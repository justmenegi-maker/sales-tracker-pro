"use client";

/**
 * Single source of truth for SK Tapri Daily Sales workspace.
 *
 * Strict Role-Based Scoping:
 * - Admin: Full access across all branches, reports, debts, staff invites, and management.
 * - Branch Manager: Strictly scoped only to view and file for their assigned branch.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  auth,
  db,
  firestoreErrorMessage,
  googleProvider,
  OperationType,
  signInWithPopup,
  fbSignOut,
  onAuthStateChanged,
  type User,
} from "./firebase";
import {
  advanceApplyError,
  advanceRefundError,
  buildBranchDocument,
  buildReportEditPayload,
  makeId,
  resolveFilingBranch,
} from "./report";
import type {
  Advance,
  AdvanceInput,
  Branch,
  DailyReport,
  Debt,
  LineCategory,
  OfflineSale,
  OfflineSaleInput,
  ReportEditInput,
  ReviewStatus,
  SaveReportInput,
  StaffInvite,
} from "./report";
import { computeTotalSale } from "./totals";

export type Session = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "branch";
  branchId: string | null;
  branchName?: string | null;
};

/**
 * Outcome of filing a day's report.
 *
 * `filed` is true once the report document itself is in Firestore; `error` then
 * only carries a caveat, such as a debt row that never reached the ledger.
 */
export type FileReportResult = {
  filed: boolean;
  error: string | null;
};

/**
 * Outcome of an admin/maintenance action.
 *
 * Every awaited write returns its reason instead of throwing: a throw out of a
 * click handler leaves the button stuck on "…" with no message at all, which is
 * how "I cannot add branches" arrived with no cause attached.
 */
export type ActionResult = {
  ok: boolean;
  error: string | null;
};

type StoreValue = {
  ready: boolean;
  backend: "firebase";
  session: Session | null;
  branches: Branch[];
  reports: DailyReport[];
  debts: Debt[];
  advances: Advance[];
  offlineSales: OfflineSale[];
  invites: StaffInvite[];
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  saveReport: (input: SaveReportInput) => Promise<FileReportResult>;
  voidReport: (reportId: string, reason: string) => Promise<ActionResult>;
  /** Admin correction of a filed report (amounts, rows, date or note). */
  updateReport: (
    reportId: string,
    input: ReportEditInput,
  ) => Promise<ActionResult>;
  setReportReview: (
    reportId: string,
    status: ReviewStatus,
    note: string,
  ) => Promise<ActionResult>;
  recordDebtPayment: (
    debtId: string,
    amountPaise: number,
    note: string,
  ) => Promise<ActionResult>;
  addAdvance: (input: AdvanceInput) => Promise<ActionResult>;
  /** Fold a held advance into the sale filed on `appliedOn`. */
  applyAdvance: (advanceId: string, appliedOn: string) => Promise<ActionResult>;
  refundAdvance: (input: {
    advanceId: string;
    amountPaise: number;
    refundedOn: string;
    note?: string | null;
  }) => Promise<ActionResult>;
  addManualDebt: (input: {
    branchId: string;
    productName: string;
    amountPaise: number;
    debtDate: string;
    dueDate?: string | null;
  }) => Promise<ActionResult>;
  /** Set (or clear) the date a debt is expected to be collected by. */
  setDebtDueDate: (
    debtId: string,
    dueDate: string | null,
  ) => Promise<ActionResult>;
  addOfflineSale: (input: OfflineSaleInput) => Promise<ActionResult>;
  setOfflineSaleAdded: (
    saleId: string,
    added: boolean,
  ) => Promise<ActionResult>;
  addBranch: (
    name: string,
    managerEmail?: string,
    managerName?: string,
  ) => Promise<ActionResult>;
  deleteBranch: (branchId: string) => Promise<ActionResult>;
  inviteStaff: (input: {
    email: string;
    displayName: string;
    branchId: string;
    role?: "branch" | "admin";
  }) => Promise<ActionResult>;
  deleteInvite: (inviteId: string) => Promise<ActionResult>;
};

const BOOTSTRAP_ADMIN_EMAIL = "justmenegi@gmail.com";

/** One Firestore branch document, as the UI understands a branch. */
function toBranch(docSnap: DocumentSnapshot<DocumentData>): Branch {
  const data = docSnap.data() ?? {};
  return {
    id: docSnap.id,
    name: data.name,
    isActive: data.isActive ?? true,
    managerEmail: data.managerEmail || null,
    managerName: data.managerName || null,
    createdAt: data.createdAt,
  };
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [offlineSales, setOfflineSales] = useState<OfflineSale[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Sync user profile & staff invite state
  const resolveFirebaseUser = useCallback(async (user: User): Promise<Session> => {
    const emailLower = (user.email || "").toLowerCase();
    const isAdminUser = emailLower === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

    // Check admin document
    let adminDocExists = false;
    try {
      const adminSnap = await getDoc(doc(db, "admins", user.uid));
      adminDocExists = adminSnap.exists();
    } catch {
      adminDocExists = false;
    }

    const isAdmin = isAdminUser || adminDocExists;

    // Check user profile document
    let profileRole: "admin" | "branch" = isAdmin ? "admin" : "branch";
    let branchId: string | null = null;
    let branchName: string | null = null;

    try {
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const udata = userSnap.data();
        profileRole = isAdmin ? "admin" : (udata.role as "admin" | "branch") || "branch";
        branchId = udata.branchId || null;
      } else {
        // Optional keys are omitted rather than written as null: the security
        // rules require a string whenever the key is present, so a `branchId:
        // null` profile was refused outright and a new account ended up with no
        // profile document at all (which then broke the invitation link-up).
        await setDoc(userDocRef, {
          email: user.email || "",
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          role: profileRole,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("Could not read/write user profile:", err);
    }

    // Check if staff has an invite record by email
    if (!isAdmin && emailLower) {
      try {
        const inviteDocSnap = await getDoc(doc(db, "invites", emailLower));
        if (inviteDocSnap.exists()) {
          const inv = inviteDocSnap.data() as StaffInvite;
          branchId = inv.branchId;
          branchName = inv.branchName;
          profileRole = inv.role || "branch";
          await updateDoc(doc(db, "users", user.uid), {
            branchId: inv.branchId,
            role: profileRole,
          });
          await updateDoc(doc(db, "invites", inviteDocSnap.id), {
            status: "active",
          });
        }
      } catch (err) {
        console.warn("Could not check staff invite:", err);
      }

      // Check if user is assigned as managerEmail on any branch
      if (!branchId) {
        try {
          const branchesSnap = await getDocs(
            query(collection(db, "branches"), where("managerEmail", "==", emailLower)),
          );
          if (!branchesSnap.empty) {
            const bDoc = branchesSnap.docs[0];
            branchId = bDoc.id;
            branchName = bDoc.data().name;
            await updateDoc(doc(db, "users", user.uid), {
              branchId,
              role: "branch",
            });
          }
        } catch (err) {
          console.warn("Could not check branch managerEmail:", err);
        }
      }
    }

    // Ensure bootstrap admin document exists
    if (isAdmin && !adminDocExists) {
      try {
        await setDoc(doc(db, "admins", user.uid), {
          email: user.email || "",
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("Could not write admin record:", err);
      }
    }

    return {
      id: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email?.split("@")[0] || "Staff",
      role: profileRole,
      branchId,
      branchName,
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted.current) return;

      if (!user) {
        setSession(null);
        setReady(true);
        return;
      }

      try {
        const resolved = await resolveFirebaseUser(user);
        if (mounted.current) {
          setSession(resolved);
          setReady(true);
        }
      } catch (err) {
        console.error("Auth state resolution error:", err);
        if (mounted.current) setReady(true);
      }
    });

    return () => unsubscribe();
  }, [resolveFirebaseUser]);

  // Firestore Realtime Listeners (Role-Based Scoped)
  useEffect(() => {
    if (!session) return;

    // Branches listener.
    //
    // Firestore rules are not filters: a query has to be allowed for every
    // document it could return. `firestore.rules` grants branch reads to admins,
    // to the caller's own branch, and to a branch whose `managerEmail` is the
    // caller — so an unfiltered `collection(db, "branches")` is *denied* for a
    // branch login. That denial is why a branch could not file a report: the
    // listener errored, `branches` stayed empty, and filing then failed with
    // "Pick a branch before submitting". A branch login therefore listens to its
    // own branch document, which the rules allow because the request binds the
    // document ID. Administrators keep the whole collection.
    let unsubBranches = () => {};
    if (session.role === "admin") {
      unsubBranches = onSnapshot(
        collection(db, "branches"),
        (snapshot) => {
          if (!mounted.current) return;
          setBranches(snapshot.docs.map(toBranch));
        },
        (error) => {
          setError(
            firestoreErrorMessage(error, OperationType.LIST, "branches", "load the branch list"),
          );
        },
      );
    } else if (session.branchId) {
      unsubBranches = onSnapshot(
        doc(db, "branches", session.branchId),
        (snapshot) => {
          if (!mounted.current) return;
          setBranches(snapshot.exists() ? [toBranch(snapshot)] : []);
        },
        (error) => {
          setError(
            firestoreErrorMessage(error, OperationType.GET, `branches/${session.branchId}`, "load your branch"),
          );
        },
      );
    }

    // Reports listener - Scoped strictly to branch for managers
    const reportsQuery =
      session.role === "admin"
        ? collection(db, "reports")
        : session.branchId
          ? query(collection(db, "reports"), where("branchId", "==", session.branchId))
          : null;

    let unsubReports = () => {};
    if (reportsQuery) {
      unsubReports = onSnapshot(
        reportsQuery,
        (snapshot) => {
          if (!mounted.current) return;
          const list: DailyReport[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              branchId: d.branchId,
              branchName: d.branchName,
              reportDate: d.reportDate,
              submittedBy: d.submittedBy,
              submittedByName: d.submittedByName || "Staff",
              cashPaise: d.cashPaise,
              onlinePaise: d.onlinePaise,
              lines: d.lines || [],
              status: d.status || "active",
              voidReason: d.voidReason || null,
              note: d.note || null,
              reviewStatus: d.reviewStatus || "pending",
              reviewNote: d.reviewNote || null,
              reviewedByName: d.reviewedByName || null,
              reviewedAt: d.reviewedAt || null,
              editedByName: d.editedByName || null,
              editedAt: d.editedAt || null,
              createdAt: d.createdAt,
            };
          });
          setReports(list);
        },
        (error) => {
          setError(
            firestoreErrorMessage(error, OperationType.LIST, "reports", "load the reports"),
          );
        },
      );
    }

    // Debts listener - Scoped strictly to branch for managers
    const debtsQuery =
      session.role === "admin"
        ? collection(db, "debts")
        : session.branchId
          ? query(collection(db, "debts"), where("branchId", "==", session.branchId))
          : null;

    let unsubDebts = () => {};
    if (debtsQuery) {
      unsubDebts = onSnapshot(
        debtsQuery,
        (snapshot) => {
          if (!mounted.current) return;
          const list: Debt[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              branchId: d.branchId,
              productName: d.productName,
              amountPaise: d.amountPaise,
              debtDate: d.debtDate,
              dueDate: d.dueDate || null,
              source: d.source || "report",
              voided: d.voided || false,
              payments: d.payments || [],
            };
          });
          setDebts(list);
        },
        (error) => {
          setError(
            firestoreErrorMessage(error, OperationType.LIST, "debts", "load the debt ledger"),
          );
        },
      );
    }

    // Advances - same branch scoping as debts. An advance is money received
    // before the item is handed over, so it is tracked in its own ledger and
    // never folded into Total Sale automatically.
    const advancesQuery =
      session.role === "admin"
        ? collection(db, "advances")
        : session.branchId
          ? query(collection(db, "advances"), where("branchId", "==", session.branchId))
          : null;

    let unsubAdvances = () => {};
    if (advancesQuery) {
      unsubAdvances = onSnapshot(
        advancesQuery,
        (snapshot) => {
          if (!mounted.current) return;
          const list: Advance[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              branchId: d.branchId,
              customerName: d.customerName,
              itemName: d.itemName,
              amountPaise: d.amountPaise,
              advanceDate: d.advanceDate,
              appliedOn: d.appliedOn || null,
              appliedByName: d.appliedByName || null,
              refunds: d.refunds || [],
              note: d.note || null,
              createdAt: d.createdAt,
            };
          });
          setAdvances(list);
        },
        (error) => {
          setError(
            firestoreErrorMessage(
              error,
              OperationType.LIST,
              "advances",
              "load the advance ledger",
            ),
          );
        },
      );
    }

    // Offline-sale reminders - same branch scoping as debts. These never feed
    // into a report total: the money was already taken as cash or online.
    const offlineSalesQuery =
      session.role === "admin"
        ? collection(db, "offlineSales")
        : session.branchId
          ? query(collection(db, "offlineSales"), where("branchId", "==", session.branchId))
          : null;

    let unsubOfflineSales = () => {};
    if (offlineSalesQuery) {
      unsubOfflineSales = onSnapshot(
        offlineSalesQuery,
        (snapshot) => {
          if (!mounted.current) return;
          const list: OfflineSale[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              branchId: d.branchId,
              itemName: d.itemName,
              amountPaise: d.amountPaise,
              saleDate: d.saleDate,
              addedToSystem: d.addedToSystem || false,
              addedAt: d.addedAt || null,
              addedByName: d.addedByName || null,
              createdAt: d.createdAt,
            };
          });
          setOfflineSales(list);
        },
        (error) => {
          setError(
            firestoreErrorMessage(
              error,
              OperationType.LIST,
              "offlineSales",
              "load the offline sale reminders",
            ),
          );
        },
      );
    }

    // Staff Invites listener (Only loaded for Admin)
    let unsubInvites = () => {};
    if (session.role === "admin") {
      unsubInvites = onSnapshot(
        collection(db, "invites"),
        (snapshot) => {
          if (!mounted.current) return;
          const list: StaffInvite[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              email: d.email,
              displayName: d.displayName,
              branchId: d.branchId,
              branchName: d.branchName,
              role: d.role || "branch",
              invitedBy: d.invitedBy || "",
              status: d.status || "invited",
              createdAt: d.createdAt,
            };
          });
          setInvites(list);
        },
        (error) => {
          console.warn("Invites snapshot notice:", error);
        },
      );
    }

    return () => {
      unsubBranches();
      unsubReports();
      unsubDebts();
      unsubAdvances();
      unsubOfflineSales();
      unsubInvites();
    };
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const resolved = await resolveFirebaseUser(result.user);
        setSession(resolved);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    }
  }, [resolveFirebaseUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const cleanEmail = email.trim();
      try {
        const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
        if (result.user) {
          const resolved = await resolveFirebaseUser(result.user);
          setSession(resolved);
          return true;
        }
        return false;
      } catch (err: unknown) {
        const fbErr = err as { code?: string; message?: string };
        if (
          fbErr.code === "auth/user-not-found" ||
          fbErr.code === "auth/invalid-credential" ||
          fbErr.code === "auth/invalid-login-credentials"
        ) {
          try {
            const created = await createUserWithEmailAndPassword(
              auth,
              cleanEmail,
              password,
            );
            if (created.user) {
              const resolved = await resolveFirebaseUser(created.user);
              setSession(resolved);
              return true;
            }
          } catch (createErr: unknown) {
            const cErr = createErr as { code?: string; message?: string };
            setError(
              cErr.code === "auth/email-already-in-use"
                ? "Incorrect email or password."
                : cErr.message || "Could not sign in.",
            );
            return false;
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return false;
      }
    },
    [resolveFirebaseUser],
  );

  const signOut = useCallback(async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
    setSession(null);
  }, []);

  const saveReport = useCallback(
    async (input: SaveReportInput) => {
      setError(null);
      const failure = (message: string): FileReportResult => {
        setError(message);
        return { filed: false, error: message };
      };

      if (!session) {
        return failure("You must be signed in to submit a report.");
      }

      // Branch Manager cannot file for a different branch
      if (session.role === "branch" && session.branchId && input.branchId !== session.branchId) {
        return failure("You are only authorized to file reports for your assigned branch.");
      }

      const sections = {
        cash: input.cashPaise,
        online: input.onlinePaise,
        finance: sumCategory(input.lines, "finance"),
        debt: sumCategory(input.lines, "debt"),
        exchange: sumCategory(input.lines, "exchange"),
        cheque: sumCategory(input.lines, "cheque"),
        store_use: sumCategory(input.lines, "store_use"),
        others: sumCategory(input.lines, "others"),
      };

      try {
        computeTotalSale(sections);
      } catch {
        return failure("Every amount must be a non-negative number of rupees.");
      }

      const branch = resolveFilingBranch({
        branchId: input.branchId,
        branches,
        session,
      });

      if (!branch) {
        return failure("Pick a branch before submitting.");
      }

      const reportId = makeId("report");
      const linesWithIds = input.lines.map((line) => ({
        ...line,
        id: makeId("line"),
      }));

      const reportPayload = {
        branchId: branch.id,
        branchName: branch.name,
        reportDate: input.reportDate,
        submittedBy: session.id,
        submittedByName: session.displayName || "Branch Staff",
        cashPaise: input.cashPaise,
        onlinePaise: input.onlinePaise,
        lines: linesWithIds,
        status: "active" as const,
        note: input.note?.trim() ? input.note.trim() : null,
        reviewStatus: "pending" as const,
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, "reports", reportId), reportPayload);
      } catch (err) {
        return failure(
          firestoreErrorMessage(
            err,
            OperationType.CREATE,
            `reports/${reportId}`,
            "file this report",
          ),
        );
      }

      // Add debt records to ledger if present.
      //
      // The debt rows are already part of the report saved above, so a ledger
      // write that fails is a caveat on a filed report, not a failed filing.
      const debtLines = input.lines.filter((line) => line.category === "debt");
      let ledgerError: string | null = null;
      for (const line of debtLines) {
        const debtId = makeId("debt");
        const debtPayload = {
          branchId: branch.id,
          productName: line.label || "Credit sale item",
          amountPaise: line.amountPaise,
          debtDate: input.reportDate,
          source: "report" as const,
          voided: false,
          payments: [],
          createdAt: new Date().toISOString(),
        };
        try {
          await setDoc(doc(db, "debts", debtId), debtPayload);
        } catch (err) {
          ledgerError =
            ledgerError ??
            firestoreErrorMessage(
              err,
              OperationType.CREATE,
              `debts/${debtId}`,
              "add the debt to the ledger",
            );
        }
      }

      if (ledgerError) {
        const caveat = `The report was filed, but ${ledgerError}`;
        setError(caveat);
        return { filed: true, error: caveat };
      }

      return { filed: true, error: null };
    },
    [branches, session],
  );

  const voidReport = useCallback(
    async (reportId: string, reason: string): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can void a filed report.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await updateDoc(doc(db, "reports", reportId), {
          status: "voided",
          voidReason: reason,
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `reports/${reportId}`,
          "void this report",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const updateReport = useCallback(
    async (
      reportId: string,
      input: ReportEditInput,
    ): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can edit a filed report.";
        setError(message);
        return { ok: false, error: message };
      }

      const { data, error } = buildReportEditPayload(
        input,
        session.displayName || "Admin",
        new Date().toISOString(),
      );
      if (error) {
        setError(error);
        return { ok: false, error };
      }

      try {
        await updateDoc(doc(db, "reports", reportId), data);
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `reports/${reportId}`,
          "save this correction",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const setReportReview = useCallback(
    async (
      reportId: string,
      status: ReviewStatus,
      note: string,
    ): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can review reports.";
        setError(message);
        return { ok: false, error: message };
      }

      const trimmed = note.trim();
      if (status === "concern" && trimmed.length < 3) {
        const message = "Add a short note explaining the concern.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await updateDoc(doc(db, "reports", reportId), {
          reviewStatus: status,
          reviewNote: status === "concern" ? trimmed : null,
          reviewedByName: session.displayName || "Admin",
          reviewedAt: new Date().toISOString(),
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `reports/${reportId}`,
          "save this review",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const recordDebtPayment = useCallback(
    async (
      debtId: string,
      amountPaise: number,
      note: string,
    ): Promise<ActionResult> => {
      setError(null);
      const currentDebt = debts.find((d) => d.id === debtId);
      const paymentItem = {
        id: makeId("pay"),
        amountPaise,
        paidOn: new Date().toISOString().slice(0, 10),
        note: note || null,
      };

      const updatedPayments = currentDebt
        ? [...currentDebt.payments, paymentItem]
        : [paymentItem];

      try {
        await updateDoc(doc(db, "debts", debtId), {
          payments: updatedPayments,
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `debts/${debtId}`,
          "record this payment",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [debts],
  );

  const setDebtDueDate = useCallback(
    async (debtId: string, dueDate: string | null): Promise<ActionResult> => {
      setError(null);
      const clean = dueDate?.trim() || "";
      if (clean && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const message = "Pick a valid due date.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await updateDoc(doc(db, "debts", debtId), {
          dueDate: clean || null,
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `debts/${debtId}`,
          "save this due date",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const addManualDebt = useCallback(
    async (input: {
      branchId: string;
      productName: string;
      amountPaise: number;
      debtDate: string;
      dueDate?: string | null;
    }): Promise<ActionResult> => {
      setError(null);
      // Branch Manager cannot add debt for another branch
      if (session?.role === "branch" && session.branchId && input.branchId !== session.branchId) {
        const message = "You can only record debts for your assigned branch.";
        setError(message);
        return { ok: false, error: message };
      }

      const debtId = makeId("debt");
      const dueDate = input.dueDate?.trim() || "";
      try {
        await setDoc(doc(db, "debts", debtId), {
          branchId: input.branchId,
          productName: input.productName,
          amountPaise: input.amountPaise,
          debtDate: input.debtDate,
          ...(dueDate ? { dueDate } : {}),
          source: "manual" as const,
          voided: false,
          payments: [],
          createdAt: new Date().toISOString(),
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.CREATE,
          `debts/${debtId}`,
          "add this debt",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const addAdvance = useCallback(
    async (input: AdvanceInput): Promise<ActionResult> => {
      setError(null);
      if (session?.role === "branch" && session.branchId && input.branchId !== session.branchId) {
        const message = "You can only record advances for your assigned branch.";
        setError(message);
        return { ok: false, error: message };
      }

      const customerName = input.customerName.trim();
      const itemName = input.itemName.trim();
      if (!customerName) {
        const message = "Add the customer name.";
        setError(message);
        return { ok: false, error: message };
      }
      if (!itemName) {
        const message = "Add the item or appliance.";
        setError(message);
        return { ok: false, error: message };
      }
      if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
        const message = "The advance must be more than zero.";
        setError(message);
        return { ok: false, error: message };
      }
      if (!input.advanceDate) {
        const message = "Pick the date the advance was received.";
        setError(message);
        return { ok: false, error: message };
      }

      const advanceId = makeId("advance");
      try {
        await setDoc(doc(db, "advances", advanceId), {
          branchId: input.branchId,
          customerName,
          itemName,
          amountPaise: input.amountPaise,
          advanceDate: input.advanceDate,
          appliedOn: null,
          appliedByName: null,
          refunds: [],
          note: input.note?.trim() ? input.note.trim() : null,
          createdAt: new Date().toISOString(),
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.CREATE,
          `advances/${advanceId}`,
          "add this advance",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const applyAdvance = useCallback(
    async (advanceId: string, appliedOn: string): Promise<ActionResult> => {
      setError(null);
      const current = advances.find((advance) => advance.id === advanceId);
      if (!current) {
        const message = "That advance is no longer in the ledger.";
        setError(message);
        return { ok: false, error: message };
      }

      const blocked = advanceApplyError(current, appliedOn);
      if (blocked) {
        setError(blocked);
        return { ok: false, error: blocked };
      }

      try {
        await updateDoc(doc(db, "advances", advanceId), {
          appliedOn,
          appliedByName: session?.displayName || "Staff",
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `advances/${advanceId}`,
          "add this advance to a sale",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [advances, session],
  );

  const refundAdvance = useCallback(
    async (input: {
      advanceId: string;
      amountPaise: number;
      refundedOn: string;
      note?: string | null;
    }): Promise<ActionResult> => {
      setError(null);
      const current = advances.find((advance) => advance.id === input.advanceId);
      if (!current) {
        const message = "That advance is no longer in the ledger.";
        setError(message);
        return { ok: false, error: message };
      }

      const blocked = advanceRefundError(current, input.amountPaise);
      if (blocked) {
        setError(blocked);
        return { ok: false, error: blocked };
      }
      if (!input.refundedOn) {
        const message = "Pick the refund date.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await updateDoc(doc(db, "advances", input.advanceId), {
          refunds: [
            ...current.refunds,
            {
              id: makeId("refund"),
              amountPaise: input.amountPaise,
              refundedOn: input.refundedOn,
              note: input.note?.trim() ? input.note.trim() : null,
            },
          ],
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `advances/${input.advanceId}`,
          "refund this advance",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [advances],
  );

  const addOfflineSale = useCallback(
    async (input: OfflineSaleInput): Promise<ActionResult> => {
      setError(null);
      // A branch login can only add reminders for its own branch.
      if (session?.role === "branch" && session.branchId && input.branchId !== session.branchId) {
        const message = "You can only add offline sales for your assigned branch.";
        setError(message);
        return { ok: false, error: message };
      }

      const itemName = input.itemName.trim();
      if (!itemName) {
        const message = "Add the item name.";
        setError(message);
        return { ok: false, error: message };
      }
      if (!Number.isInteger(input.amountPaise) || input.amountPaise < 0) {
        const message = "The price must be a non-negative amount.";
        setError(message);
        return { ok: false, error: message };
      }

      const saleId = makeId("offline");
      try {
        await setDoc(doc(db, "offlineSales", saleId), {
          branchId: input.branchId,
          itemName,
          amountPaise: input.amountPaise,
          saleDate: input.saleDate,
          addedToSystem: false,
          createdAt: new Date().toISOString(),
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.CREATE,
          `offlineSales/${saleId}`,
          "add this offline sale",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const setOfflineSaleAdded = useCallback(
    async (saleId: string, added: boolean): Promise<ActionResult> => {
      setError(null);
      try {
        await updateDoc(doc(db, "offlineSales", saleId), {
          addedToSystem: added,
          addedAt: added ? new Date().toISOString() : null,
          addedByName: added ? session?.displayName || "Staff" : null,
        });
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.UPDATE,
          `offlineSales/${saleId}`,
          "update this offline sale reminder",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const addBranch = useCallback(
    async (
      name: string,
      managerEmail?: string,
      managerName?: string,
    ): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message =
          "Only admins can create branches. Sign in with an admin account and try again.";
        setError(message);
        return { ok: false, error: message };
      }

      // Lower-cased so the branch's `managerEmail` matches the lookup that links
      // a signed-in manager to their branch (`where("managerEmail", "==", email)`).
      const cleanEmail = (managerEmail || "").trim().toLowerCase();
      const cleanManagerName = (managerName || "").trim();
      const { id: branchId, data: payload } = buildBranchDocument({
        name,
        managerEmail: cleanEmail,
        managerName: cleanManagerName,
        createdAt: new Date().toISOString(),
      });

      try {
        await setDoc(doc(db, "branches", branchId), payload);
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.CREATE,
          `branches/${branchId}`,
          "create this branch",
        );
        setError(message);
        return { ok: false, error: message };
      }

      // The branch exists from here on, so a manager invitation that does not go
      // through is a caveat on a created branch, not a failed creation — the same
      // shape as a debt row that never reached the ledger.
      if (cleanEmail) {
        try {
          await setDoc(doc(db, "invites", cleanEmail), {
            email: cleanEmail,
            displayName: cleanManagerName || cleanEmail.split("@")[0],
            branchId,
            branchName: payload.name,
            role: "branch" as const,
            invitedBy: session.email,
            status: "invited" as const,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          const message = `The branch was created, but ${firestoreErrorMessage(
            err,
            OperationType.CREATE,
            `invites/${cleanEmail}`,
            "invite the manager",
          )}`;
          setError(message);
          return { ok: true, error: message };
        }
      }

      return { ok: true, error: null };
    },
    [session],
  );

  const deleteBranch = useCallback(
    async (branchId: string): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can delete branches.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await deleteDoc(doc(db, "branches", branchId));
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.DELETE,
          `branches/${branchId}`,
          "delete this branch",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const inviteStaff = useCallback(
    async (input: {
      email: string;
      displayName: string;
      branchId: string;
      role?: "branch" | "admin";
    }): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can invite staff.";
        setError(message);
        return { ok: false, error: message };
      }

      const cleanEmail = input.email.trim().toLowerCase();
      const branch = branches.find((b) => b.id === input.branchId);
      const inviteId = cleanEmail;

      const payload = {
        email: cleanEmail,
        displayName: input.displayName.trim() || cleanEmail.split("@")[0],
        branchId: input.branchId,
        branchName: branch ? branch.name : input.branchId,
        role: input.role || "branch",
        invitedBy: session.email,
        status: "invited" as const,
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, "invites", inviteId), payload);
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.CREATE,
          `invites/${inviteId}`,
          "send this invitation",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [branches, session],
  );

  const deleteInvite = useCallback(
    async (inviteId: string): Promise<ActionResult> => {
      setError(null);
      if (session?.role !== "admin") {
        const message = "Only admins can delete invites.";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        await deleteDoc(doc(db, "invites", inviteId));
        return { ok: true, error: null };
      } catch (err) {
        const message = firestoreErrorMessage(
          err,
          OperationType.DELETE,
          `invites/${inviteId}`,
          "remove this invitation",
        );
        setError(message);
        return { ok: false, error: message };
      }
    },
    [session],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      backend: "firebase",
      session,
      branches,
      reports,
      debts,
      advances,
      offlineSales,
      invites,
      error,
      clearError: () => setError(null),
      signIn,
      signInWithGoogle,
      signOut,
      saveReport,
      voidReport,
      updateReport,
      setReportReview,
      recordDebtPayment,
      setDebtDueDate,
      addManualDebt,
      addAdvance,
      applyAdvance,
      refundAdvance,
      addOfflineSale,
      setOfflineSaleAdded,
      addBranch,
      deleteBranch,
      inviteStaff,
      deleteInvite,
    }),
    [
      addAdvance,
      addBranch,
      addManualDebt,
      addOfflineSale,
      advances,
      applyAdvance,
      branches,
      debts,
      deleteBranch,
      deleteInvite,
      error,
      inviteStaff,
      invites,
      offlineSales,
      ready,
      recordDebtPayment,
      refundAdvance,
      reports,
      setDebtDueDate,
      saveReport,
      session,
      setOfflineSaleAdded,
      setReportReview,
      signIn,
      signInWithGoogle,
      signOut,
      updateReport,
      voidReport,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function sumCategory(
  lines: Array<{ category: LineCategory; amountPaise: number }>,
  category: LineCategory,
): number {
  return lines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.amountPaise, 0);
}

export function useAppStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useAppStore must be used inside <AppStoreProvider>");
  }
  return store;
}
