"use client";

/**
 * Single source of truth for the signed-in workspace.
 *
 * Two backends are supported behind one API:
 *  - `supabase`: real auth + tables (used when the env keys are present)
 *  - `demo`: seeded data persisted to localStorage (used when they are not)
 *
 * Components only ever talk to this provider, so switching backends never
 * changes page code.
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
import { createDemoWorkspace, DEMO_BRANCHES, DEMO_USERS } from "./demo-data";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { makeId } from "./report";
import type {
  Branch,
  DailyReport,
  Debt,
  LineCategory,
  SaveReportInput,
} from "./report";
import { computeTotalSale } from "./totals";

export type Backend = "supabase" | "demo";

export type Session = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "branch";
  branchId: string | null;
};

export type ProfileRow = {
  id: string;
  role: "admin" | "branch";
  branch_id: string | null;
  display_name: string;
  is_active: boolean;
};

type StoreValue = {
  ready: boolean;
  backend: Backend;
  session: Session | null;
  branches: Branch[];
  reports: DailyReport[];
  debts: Debt[];
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInDemo: (role: "admin" | "branch") => void;
  signOut: () => Promise<void>;
  saveReport: (input: SaveReportInput) => Promise<boolean>;
  voidReport: (reportId: string, reason: string) => Promise<boolean>;
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
  refresh: () => Promise<void>;
};

const DEMO_SESSION_KEY = "sktapri.session.v1";
const DEMO_WORKSPACE_KEY = "sktapri.workspace.v1";

const StoreContext = createContext<StoreValue | null>(null);

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the app still works in memory.
  }
}

type SupabaseReportRow = {
  id: string;
  branch_id: string;
  report_date: string;
  submitted_by: string;
  cash_paise: number;
  online_paise: number;
  status: "active" | "voided";
  void_reason: string | null;
  created_at: string;
  report_lines: Array<{
    id: string;
    category: LineCategory;
    label: string;
    amount_paise: number;
  }> | null;
};

type SupabaseDebtRow = {
  id: string;
  branch_id: string;
  product_name: string;
  amount_paise: number;
  debt_date: string;
  source: "report" | "manual";
  voided: boolean;
  debt_payments: Array<{
    id: string;
    amount_paise: number;
    paid_on: string;
    note: string | null;
  }> | null;
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const backend: Backend = isSupabaseConfigured() ? "supabase" : "demo";
  const supabase = useMemo(() => getSupabase(), []);

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const persistDemo = useCallback(
    (next: { reports?: DailyReport[]; debts?: Debt[] }) => {
      const current = readJSON<{ reports: DailyReport[]; debts: Debt[] }>(
        DEMO_WORKSPACE_KEY,
      ) ?? { reports: [], debts: [] };
      writeJSON(DEMO_WORKSPACE_KEY, {
        reports: next.reports ?? current.reports,
        debts: next.debts ?? current.debts,
      });
    },
    [],
  );

  const loadSupabase = useCallback(
    async (activeSession: Session, client: NonNullable<typeof supabase>) => {
      const [branchResult, profileResult, reportResult, debtResult] =
        await Promise.all([
          client.from("branches").select("id, name, is_active").order("name"),
          client.from("profiles").select("id, display_name"),
          client
            .from("daily_reports")
            .select(
              "id, branch_id, report_date, submitted_by, cash_paise, online_paise, status, void_reason, created_at, report_lines(id, category, label, amount_paise)",
            )
            .order("report_date", { ascending: false })
            .limit(500),
          client
            .from("debts")
            .select(
              "id, branch_id, product_name, amount_paise, debt_date, source, voided, debt_payments(id, amount_paise, paid_on, note)",
            )
            .order("debt_date", { ascending: false })
            .limit(500),
        ]);

      const failure =
        branchResult.error ?? reportResult.error ?? debtResult.error ?? null;
      if (failure) {
        if (mounted.current) setError(failure.message);
        return;
      }

      const names = new Map<string, string>(
        ((profileResult.data ?? []) as ProfileRow[]).map((profile) => [
          profile.id,
          profile.display_name || profile.id,
        ]),
      );

      const branchRows = (branchResult.data ?? []) as unknown as Array<{
        id: string;
        name: string;
        is_active: boolean;
      }>;
      const branchList: Branch[] = branchRows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.is_active,
      }));
      const branchNames = new Map(branchList.map((b) => [b.id, b.name]));

      const reportRows = (reportResult.data ?? []) as unknown as SupabaseReportRow[];
      const debtRows = (debtResult.data ?? []) as unknown as SupabaseDebtRow[];

      if (!mounted.current) return;

      setBranches(branchList);
      setReports(
        reportRows.map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          branchName: branchNames.get(row.branch_id) ?? "Branch",
          reportDate: row.report_date,
          submittedBy: row.submitted_by,
          submittedByName: names.get(row.submitted_by) ?? activeSession.displayName,
          cashPaise: row.cash_paise,
          onlinePaise: row.online_paise,
          lines: (row.report_lines ?? []).map((line) => ({
            id: line.id,
            category: line.category,
            label: line.label,
            amountPaise: line.amount_paise,
          })),
          status: row.status,
          voidReason: row.void_reason,
          createdAt: row.created_at,
        })),
      );
      setDebts(
        debtRows.map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          productName: row.product_name,
          amountPaise: row.amount_paise,
          debtDate: row.debt_date,
          source: row.source,
          voided: row.voided,
          payments: (row.debt_payments ?? []).map((payment) => ({
            id: payment.id,
            amountPaise: payment.amount_paise,
            paidOn: payment.paid_on,
            note: payment.note,
          })),
        })),
      );
    },
    [],
  );

  const resolveSupabaseSession = useCallback(
    async (client: NonNullable<typeof supabase>) => {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        setSession(null);
        setReady(true);
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("id, role, branch_id, display_name, is_active")
        .eq("id", user.id)
        .maybeSingle();

      const next: Session = {
        id: user.id,
        email: user.email ?? "",
        displayName: profile?.display_name || user.email || "Signed in",
        role: profile?.role === "admin" ? "admin" : "branch",
        branchId: profile?.branch_id ?? null,
      };

      if (!mounted.current) return;
      setSession(next);
      await loadSupabase(next, client);
      if (mounted.current) setReady(true);
    },
    [loadSupabase],
  );

  // Boot: restore a demo session, or resolve the Supabase session.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (backend === "demo") {
        const stored = readJSON<Session>(DEMO_SESSION_KEY);
        const workspace = readJSON<{ reports: DailyReport[]; debts: Debt[] }>(
          DEMO_WORKSPACE_KEY,
        );
        const seeded = createDemoWorkspace();
        if (cancelled) return;
        setBranches(seeded.branches);
        setReports(workspace?.reports?.length ? workspace.reports : seeded.reports);
        setDebts(workspace?.debts?.length ? workspace.debts : seeded.debts);
        setSession(stored ?? null);
        setReady(true);
        return;
      }

      if (supabase) await resolveSupabaseSession(supabase);
      else setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [backend, resolveSupabaseSession, supabase]);

  // Keep the Supabase session in sync with auth events.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setReports([]);
        setDebts([]);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void resolveSupabaseSession(supabase);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [resolveSupabaseSession, supabase]);

  const refresh = useCallback(async () => {
    if (backend === "demo" || !supabase || !session) return;
    await loadSupabase(session, supabase);
  }, [backend, loadSupabase, session, supabase]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      if (!supabase) {
        setError(
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or continue in demo mode.",
        );
        return false;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return false;
      }
      await resolveSupabaseSession(supabase);
      return true;
    },
    [resolveSupabaseSession, supabase],
  );

  const signInDemo = useCallback((role: "admin" | "branch") => {
    const user = role === "admin" ? DEMO_USERS.admin : DEMO_USERS.branch;
    const next: Session = {
      id: `demo_${role}`,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      branchId: user.branchId,
    };
    writeJSON(DEMO_SESSION_KEY, next);
    setSession(next);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase && session && !session.id.startsWith("demo_")) {
      await supabase.auth.signOut();
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
    }
    setSession(null);
  }, [session, supabase]);

  const saveReport = useCallback(
    async (input: SaveReportInput) => {
      setError(null);
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

      let total: number;
      try {
        total = computeTotalSale(sections);
      } catch {
        setError("Every amount must be a non-negative number of rupees.");
        return false;
      }

      const branch = branches.find((item) => item.id === input.branchId);
      if (!branch) {
        setError("Pick a branch before submitting.");
        return false;
      }

      if (backend === "demo" || !supabase || !session) {
        const report: DailyReport = {
          id: makeId("report"),
          branchId: branch.id,
          branchName: branch.name,
          reportDate: input.reportDate,
          submittedBy: session?.id ?? "demo",
          submittedByName: session?.displayName ?? "Demo",
          cashPaise: input.cashPaise,
          onlinePaise: input.onlinePaise,
          lines: input.lines.map((line) => ({ ...line, id: makeId("line") })),
          status: "active",
          voidReason: null,
          createdAt: new Date().toISOString(),
        };

        const nextReports = [report, ...reports];
        const nextDebts = [
          ...input.lines
            .filter((line) => line.category === "debt")
            .map<Debt>((line) => ({
              id: makeId("debt"),
              branchId: branch.id,
              productName: line.label || "Debt item",
              amountPaise: line.amountPaise,
              debtDate: input.reportDate,
              source: "report",
              voided: false,
              payments: [],
            })),
          ...debts,
        ];

        setReports(nextReports);
        setDebts(nextDebts);
        persistDemo({ reports: nextReports, debts: nextDebts });
        return true;
      }

      const reportId = crypto.randomUUID();
      const { error: reportError } = await supabase.from("daily_reports").insert({
        id: reportId,
        branch_id: branch.id,
        report_date: input.reportDate,
        submitted_by: session.id,
        cash_paise: input.cashPaise,
        online_paise: input.onlinePaise,
        total_paise: total,
        finance_count: input.lines.filter((l) => l.category === "finance").length,
        has_debt: input.lines.some((l) => l.category === "debt"),
        status: "active",
      });

      if (reportError) {
        setError(reportError.message);
        return false;
      }

      if (input.lines.length > 0) {
        const { error: linesError } = await supabase.from("report_lines").insert(
          input.lines.map((line) => ({
            report_id: reportId,
            category: line.category,
            label: line.label,
            amount_paise: line.amountPaise,
          })),
        );
        if (linesError) {
          setError(linesError.message);
          return false;
        }
      }

      const debtLines = input.lines.filter((line) => line.category === "debt");
      if (debtLines.length > 0) {
        const { error: debtError } = await supabase.from("debts").insert(
          debtLines.map((line) => ({
            branch_id: branch.id,
            report_id: reportId,
            source: "report",
            product_name: line.label,
            amount_paise: line.amountPaise,
            debt_date: input.reportDate,
            created_by: session.id,
          })),
        );
        if (debtError) setError(debtError.message);
      }

      await loadSupabase(session, supabase);
      return true;
    },
    [backend, branches, debts, loadSupabase, persistDemo, reports, session, supabase],
  );

  const voidReport = useCallback(
    async (reportId: string, reason: string) => {
      setError(null);
      if (backend === "demo" || !supabase || !session) {
        const nextReports = reports.map((report) =>
          report.id === reportId
            ? { ...report, status: "voided" as const, voidReason: reason }
            : report,
        );
        setReports(nextReports);
        persistDemo({ reports: nextReports });
        return true;
      }

      const { error: voidError } = await supabase
        .from("daily_reports")
        .update({
          status: "voided",
          void_reason: reason,
          voided_by: session.id,
          voided_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (voidError) {
        setError(voidError.message);
        return false;
      }
      await loadSupabase(session, supabase);
      return true;
    },
    [backend, loadSupabase, persistDemo, reports, session, supabase],
  );

  const recordDebtPayment = useCallback(
    async (debtId: string, amountPaise: number, note: string) => {
      setError(null);
      if (backend === "demo" || !supabase || !session) {
        const nextDebts = debts.map((debt) =>
          debt.id === debtId
            ? {
                ...debt,
                payments: [
                  ...debt.payments,
                  {
                    id: makeId("pay"),
                    amountPaise,
                    paidOn: new Date().toISOString().slice(0, 10),
                    note: note || null,
                  },
                ],
              }
            : debt,
        );
        setDebts(nextDebts);
        persistDemo({ debts: nextDebts });
        return true;
      }

      const { error: paymentError } = await supabase
        .from("debt_payments")
        .insert({
          debt_id: debtId,
          amount_paise: amountPaise,
          note: note || null,
          recorded_by: session.id,
        });

      if (paymentError) {
        setError(paymentError.message);
        return false;
      }
      await loadSupabase(session, supabase);
      return true;
    },
    [backend, debts, loadSupabase, persistDemo, session, supabase],
  );

  const addManualDebt = useCallback(
    async (input: {
      branchId: string;
      productName: string;
      amountPaise: number;
      debtDate: string;
    }) => {
      setError(null);
      if (backend === "demo" || !supabase || !session) {
        const nextDebts: Debt[] = [
          {
            id: makeId("debt"),
            branchId: input.branchId,
            productName: input.productName,
            amountPaise: input.amountPaise,
            debtDate: input.debtDate,
            source: "manual",
            voided: false,
            payments: [],
          },
          ...debts,
        ];
        setDebts(nextDebts);
        persistDemo({ debts: nextDebts });
        return true;
      }

      const { error: insertError } = await supabase.from("debts").insert({
        branch_id: input.branchId,
        product_name: input.productName,
        amount_paise: input.amountPaise,
        debt_date: input.debtDate,
        source: "manual",
        created_by: session.id,
      });

      if (insertError) {
        setError(insertError.message);
        return false;
      }
      await loadSupabase(session, supabase);
      return true;
    },
    [backend, debts, loadSupabase, persistDemo, session, supabase],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      backend,
      session,
      branches: branches.length > 0 ? branches : backend === "demo" ? DEMO_BRANCHES : [],
      reports,
      debts,
      error,
      clearError: () => setError(null),
      signIn,
      signInDemo,
      signOut,
      saveReport,
      voidReport,
      recordDebtPayment,
      addManualDebt,
      refresh,
    }),
    [
      addManualDebt,
      backend,
      branches,
      debts,
      error,
      ready,
      recordDebtPayment,
      refresh,
      reports,
      saveReport,
      session,
      signIn,
      signInDemo,
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
