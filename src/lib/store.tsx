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
  handleFirestoreError,
  OperationType,
  signInWithPopup,
  fbSignOut,
  onAuthStateChanged,
  type User,
} from "./firebase";
import { makeId, resolveFilingBranch } from "./report";
import type {
  Branch,
  DailyReport,
  Debt,
  LineCategory,
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

type StoreValue = {
  ready: boolean;
  backend: "firebase";
  session: Session | null;
  branches: Branch[];
  reports: DailyReport[];
  debts: Debt[];
  invites: StaffInvite[];
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  saveReport: (input: SaveReportInput) => Promise<FileReportResult>;
  voidReport: (reportId: string, reason: string) => Promise<boolean>;
  setReportReview: (
    reportId: string,
    status: ReviewStatus,
    note: string,
  ) => Promise<boolean>;
  recordDebtPayment: (
    debtId: string,
    amountPaise: number,
    note: string,
  ) => Promise<boolean>;
  addManualDebt: (input: {
    branchId: string;
    productName: string;
    amountPaise: number;
    debtDate: string;
  }) => Promise<boolean>;
  addBranch: (
    name: string,
    managerEmail?: string,
    managerName?: string,
  ) => Promise<boolean>;
  deleteBranch: (branchId: string) => Promise<boolean>;
  inviteStaff: (input: {
    email: string;
    displayName: string;
    branchId: string;
    role?: "branch" | "admin";
  }) => Promise<boolean>;
  deleteInvite: (inviteId: string) => Promise<boolean>;
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
        const newProfile = {
          email: user.email || "",
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          role: profileRole,
          branchId: null,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, newProfile);
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
          handleFirestoreError(error, OperationType.LIST, "branches");
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
          handleFirestoreError(error, OperationType.GET, `branches/${session.branchId}`);
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
              reviewStatus: d.reviewStatus || "pending",
              reviewNote: d.reviewNote || null,
              reviewedByName: d.reviewedByName || null,
              reviewedAt: d.reviewedAt || null,
              createdAt: d.createdAt,
            };
          });
          setReports(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, "reports");
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
              source: d.source || "report",
              voided: d.voided || false,
              payments: d.payments || [],
            };
          });
          setDebts(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, "debts");
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
    async (reportId: string, reason: string) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can void a filed report.");
        return false;
      }

      try {
        await updateDoc(doc(db, "reports", reportId), {
          status: "voided",
          voidReason: reason,
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
      }
    },
    [session],
  );

  const setReportReview = useCallback(
    async (reportId: string, status: ReviewStatus, note: string) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can review reports.");
        return false;
      }

      const trimmed = note.trim();
      if (status === "concern" && trimmed.length < 3) {
        setError("Add a short note explaining the concern.");
        return false;
      }

      try {
        await updateDoc(doc(db, "reports", reportId), {
          reviewStatus: status,
          reviewNote: status === "concern" ? trimmed : null,
          reviewedByName: session.displayName || "Admin",
          reviewedAt: new Date().toISOString(),
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
      }
    },
    [session],
  );

  const recordDebtPayment = useCallback(
    async (debtId: string, amountPaise: number, note: string) => {
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
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `debts/${debtId}`);
      }
    },
    [debts],
  );

  const addManualDebt = useCallback(
    async (input: {
      branchId: string;
      productName: string;
      amountPaise: number;
      debtDate: string;
    }) => {
      setError(null);
      // Branch Manager cannot add debt for another branch
      if (session?.role === "branch" && session.branchId && input.branchId !== session.branchId) {
        setError("You can only record debts for your assigned branch.");
        return false;
      }

      const debtId = makeId("debt");
      try {
        await setDoc(doc(db, "debts", debtId), {
          branchId: input.branchId,
          productName: input.productName,
          amountPaise: input.amountPaise,
          debtDate: input.debtDate,
          source: "manual" as const,
          voided: false,
          payments: [],
          createdAt: new Date().toISOString(),
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `debts/${debtId}`);
      }
    },
    [session],
  );

  const addBranch = useCallback(
    async (name: string, managerEmail?: string, managerName?: string) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can create branches.");
        return false;
      }

      const branchId = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || makeId("branch");

      const payload = {
        name: name.trim(),
        isActive: true,
        managerEmail: managerEmail?.trim() || null,
        managerName: managerName?.trim() || null,
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, "branches", branchId), payload);
        if (managerEmail && managerEmail.trim()) {
          const inviteDocId = managerEmail.trim().toLowerCase();
          await setDoc(doc(db, "invites", inviteDocId), {
            email: managerEmail.trim().toLowerCase(),
            displayName: managerName?.trim() || managerEmail.split("@")[0],
            branchId,
            branchName: name.trim(),
            role: "branch" as const,
            invitedBy: session.email,
            status: "invited" as const,
            createdAt: new Date().toISOString(),
          });
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `branches/${branchId}`);
      }
    },
    [session],
  );

  const deleteBranch = useCallback(
    async (branchId: string) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can delete branches.");
        return false;
      }

      try {
        await deleteDoc(doc(db, "branches", branchId));
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `branches/${branchId}`);
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
    }) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can invite staff.");
        return false;
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
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `invites/${inviteId}`);
      }
    },
    [branches, session],
  );

  const deleteInvite = useCallback(
    async (inviteId: string) => {
      setError(null);
      if (session?.role !== "admin") {
        setError("Only admins can delete invites.");
        return false;
      }

      try {
        await deleteDoc(doc(db, "invites", inviteId));
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `invites/${inviteId}`);
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
      invites,
      error,
      clearError: () => setError(null),
      signIn,
      signInWithGoogle,
      signOut,
      saveReport,
      voidReport,
      setReportReview,
      recordDebtPayment,
      addManualDebt,
      addBranch,
      deleteBranch,
      inviteStaff,
      deleteInvite,
    }),
    [
      addBranch,
      addManualDebt,
      branches,
      debts,
      deleteBranch,
      deleteInvite,
      error,
      inviteStaff,
      invites,
      ready,
      recordDebtPayment,
      reports,
      saveReport,
      session,
      setReportReview,
      signIn,
      signInWithGoogle,
      signOut,
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
