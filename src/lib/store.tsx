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
import { purgeLegacyAuthStorage } from "./auth-storage";
import { todayISO } from "./format";
import { logError, logWarn } from "./log";
import { passwordIssues } from "./password";
import { buildOAuthRedirect, primaryProvider, providerVerifiedEmail } from "./oauth";
import { createRateLimiter, formatWait, safeErrorMessage } from "./security";
import { accountStateReason, normalizeSession, type Session } from "./session";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  validateCredentialFields,
  validateDebtPayment,
  validateManualDebt,
  validateReportInput,
  validateReview,
  validateVoidReason,
} from "./validation";
import { debtOutstandingPaise, makeId } from "./report";
import type {
  Branch,
  DailyReport,
  Debt,
  LineCategory,
  ReviewStatus,
  SaveReportInput,
} from "./report";
import { computeTotalSale } from "./totals";

type Backend = "supabase" | "demo";

type ProfileRow = {
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
  /** Set when a sign-in was refused because the address is not confirmed. */
  pendingVerificationEmail: string | null;
  resendVerification: () => Promise<boolean>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<boolean>;
  signOutEverywhere: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  /** Starts the Google redirect; the browser leaves this page on success. */
  signInWithGoogle: (returnTo?: string | null) => Promise<boolean>;
  /** Completes the redirect: exchanges the one-time PKCE code for a session. */
  completeGoogleSignIn: (code: string) => Promise<boolean>;
  signInDemo: (role: "admin" | "branch") => void;
  signOut: () => Promise<void>;
  saveReport: (input: SaveReportInput) => Promise<boolean>;
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
};

const DEMO_SESSION_KEY = "sktapri.session.v1";
const DEMO_WORKSPACE_KEY = "sktapri.workspace.v1";

/**
 * Client-side throttles. They exist so an honest user gets one clear message
 * instead of a wall of failed requests; the limits that actually hold are the
 * per-user write triggers in `supabase/migrations/006_security_hardening.sql`
 * plus Supabase Auth's own sign-in rate limits.
 */
const signInLimiter = createRateLimiter({ limit: 5, windowMs: 5 * 60_000 });
const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

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

const REPORT_COLUMNS =
  "id, branch_id, report_date, submitted_by, cash_paise, online_paise, status, void_reason, created_at, review_status, review_note, reviewed_by, reviewed_at, report_lines(id, category, label, amount_paise)";

const REPORT_COLUMNS_LEGACY =
  "id, branch_id, report_date, submitted_by, cash_paise, online_paise, status, void_reason, created_at, report_lines(id, category, label, amount_paise)";

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
  /** Absent on a project that has not run migration 005. */
  review_status?: ReviewStatus | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
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
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<
    string | null
  >(null);
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
      const [branchResult, profileResult, debtResult] = await Promise.all([
        client.from("branches").select("id, name, is_active").order("name"),
        client.from("profiles").select("id, display_name"),
        client
          .from("debts")
          .select(
            "id, branch_id, product_name, amount_paise, debt_date, source, voided, debt_payments(id, amount_paise, paid_on, note)",
          )
          .order("debt_date", { ascending: false })
          .limit(500),
      ]);

      const reportQuery = (columns: string) =>
        client
          .from("daily_reports")
          .select(columns)
          .order("report_date", { ascending: false })
          .limit(500);

      let reportResult = await reportQuery(REPORT_COLUMNS);

      // A project that has not run migration 005 yet has no review columns.
      // Fall back to the original select so the workspace still opens, with
      // every report treated as unreviewed.
      if (reportResult.error?.code === "42703") {
        reportResult = await reportQuery(REPORT_COLUMNS_LEGACY);
      }

      const failure =
        branchResult.error ?? reportResult.error ?? debtResult.error ?? null;
      if (failure) {
        // Log the code, never the raw driver text: messages can echo values back.
        logError("workspace load failed", { code: failure.code });
        if (mounted.current) {
          setError(safeErrorMessage(failure.message, "Could not load the workspace."));
        }
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
          reviewStatus: row.review_status ?? "pending",
          reviewNote: row.review_note ?? null,
          reviewedByName: row.reviewed_by
            ? (names.get(row.reviewed_by) ?? "Admin")
            : null,
          reviewedAt: row.reviewed_at ?? null,
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

      // An unverified address never becomes a session, even if a stale token
      // is still lying around in the browser. An OAuth sign-in counts as
      // verified, because the provider asserted the address.
      if (!providerVerifiedEmail(user)) {
        logWarn("session refused: email not confirmed");
        await client.auth.signOut({ scope: "local" });
        if (mounted.current) {
          setPendingVerificationEmail(user.email ?? null);
          setError("Confirm your email address before signing in.");
          setReady(true);
        }
        return;
      }

      // `is_active` is part of the gate, not a decoration: both RLS helpers
      // (`is_admin()`, `current_branch_id()`) ignore an inactive profile, so the
      // workspace would be empty and every file would be refused.
      const next = normalizeSession({
        id: user.id,
        email: user.email ?? "",
        displayName: profile?.display_name || user.email || "Signed in",
        role: profile?.role === "admin" ? "admin" : "branch",
        branchId: profile?.branch_id ?? null,
        emailVerified: true,
        hasProfile: Boolean(profile),
        isActive: Boolean(profile?.is_active),
        signInProvider: primaryProvider(user),
      });

      if (!next) return;
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
      // Older builds persisted the session in localStorage; drop any copy left
      // behind so the only place a token can live is this tab's sessionStorage.
      purgeLegacyAuthStorage();

      if (backend === "demo") {
        // Normalised: a session stored by an earlier build is missing the
        // newer fields, and reading it raw would show "Account not linked yet"
        // to a branch that was signed in a minute ago.
        const stored = normalizeSession(readJSON(DEMO_SESSION_KEY));
        const workspace = readJSON<{ reports: DailyReport[]; debts: Debt[] }>(
          DEMO_WORKSPACE_KEY,
        );
        const seeded = createDemoWorkspace();
        if (cancelled) return;
        setBranches(seeded.branches);
        setReports(workspace?.reports?.length ? workspace.reports : seeded.reports);
        setDebts(workspace?.debts?.length ? workspace.debts : seeded.debts);
        setSession(stored);
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

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setPendingVerificationEmail(null);
      if (!supabase) {
        setError(
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or continue in demo mode.",
        );
        return false;
      }

      const fields = validateCredentialFields(email, password);
      if (!fields.ok) {
        setError(fields.errors[0]);
        return false;
      }

      const account = fields.value.email.toLowerCase();
      const decision = signInLimiter.check(account);
      if (!decision.allowed) {
        setError(
          `Too many sign-in attempts. Try again in ${formatWait(decision.retryAfterMs)}.`,
        );
        return false;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: fields.value.email,
        password: fields.value.password,
      });

      if (signInError) {
        const unverified =
          signInError.code === "email_not_confirmed" ||
          /not confirmed|confirm your email/i.test(signInError.message ?? "");
        if (unverified) {
          setPendingVerificationEmail(fields.value.email);
          setError(
            "Confirm your email address first — open the link we sent you, then sign in again.",
          );
        } else {
          setError(safeErrorMessage(signInError, "Could not sign in."));
        }
        logWarn("sign-in rejected", { code: signInError.code });
        return false;
      }

      // Belt and braces: a session without a verified address is thrown away.
      const user = data.user ?? data.session?.user ?? null;
      if (user && !providerVerifiedEmail(user)) {
        await supabase.auth.signOut({ scope: "local" });
        setPendingVerificationEmail(fields.value.email);
        setError("Confirm your email address before signing in.");
        return false;
      }

      signInLimiter.reset(account);
      await resolveSupabaseSession(supabase);
      return true;
    },
    [resolveSupabaseSession, supabase],
  );

  /**
   * Hands the browser to Google via Supabase.
   *
   * `redirectTo` is built from this origin's `/auth/callback` route plus a safe
   * internal return path, and it must be allow-listed in the Supabase dashboard
   * (Authentication → URL Configuration). Nothing about the account is trusted
   * here: the session only exists once the callback exchanges the code.
   */
  const signInWithGoogle = useCallback(
    async (returnTo?: string | null) => {
      setError(null);
      setPendingVerificationEmail(null);
      if (!supabase) {
        setError("Connect Supabase before using Google sign-in.");
        return false;
      }
      if (typeof window === "undefined") {
        setError("Google sign-in needs a browser.");
        return false;
      }

      const decision = signInLimiter.check("oauth:google");
      if (!decision.allowed) {
        setError(
          `Too many sign-in attempts. Try again in ${formatWait(decision.retryAfterMs)}.`,
        );
        return false;
      }

      const redirectTo = buildOAuthRedirect(window.location.origin, returnTo);
      if (!redirectTo) {
        setError(
          "This site's address is not a valid redirect target for Google sign-in.",
        );
        return false;
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        logError("google sign-in could not start", { code: oauthError.code });
        setError(safeErrorMessage(oauthError, "Could not start Google sign-in."));
        return false;
      }
      // The browser is navigating to Google now.
      return true;
    },
    [supabase],
  );

  /** Exchanges the one-time PKCE code the callback route received. */
  const completeGoogleSignIn = useCallback(
    async (code: string) => {
      setError(null);
      if (!supabase) {
        setError("Connect Supabase before using Google sign-in.");
        return false;
      }

      const { data, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        logWarn("google code exchange rejected", { code: exchangeError.code });
        setError(
          safeErrorMessage(
            exchangeError,
            "That Google sign-in link has expired. Try again.",
          ),
        );
        return false;
      }

      const user = data.user ?? data.session?.user ?? null;
      if (!user || !providerVerifiedEmail(user)) {
        await supabase.auth.signOut({ scope: "local" });
        setError("That Google account has no verified email address.");
        return false;
      }

      await resolveSupabaseSession(supabase);
      return true;
    },
    [resolveSupabaseSession, supabase],
  );

  const resendVerification = useCallback(async () => {
    if (!supabase || !pendingVerificationEmail) return false;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingVerificationEmail,
    });
    if (resendError) {
      setError(safeErrorMessage(resendError, "Could not resend the confirmation email."));
      return false;
    }
    return true;
  }, [pendingVerificationEmail, supabase]);

  const signInDemo = useCallback(
    (role: "admin" | "branch") => {
      // Demo sessions exist for exploring the app with no backend. Once
      // Supabase is connected they would only fake a role the database would
      // refuse anyway, so they are switched off.
      if (backend === "supabase") {
        setError("Demo mode is off while Supabase is connected — sign in instead.");
        return;
      }
      const user = role === "admin" ? DEMO_USERS.admin : DEMO_USERS.branch;
      const next = normalizeSession({
        id: `demo_${role}`,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        branchId: user.branchId,
        emailVerified: true,
        hasProfile: true,
        isActive: true,
        signInProvider: "email",
      });
      if (!next) return;
      writeJSON(DEMO_SESSION_KEY, next);
      setSession(next);
      setError(null);
    },
    [backend],
  );

  const signOut = useCallback(async () => {
    if (supabase && session && !session.id.startsWith("demo_")) {
      await supabase.auth.signOut({ scope: "local" });
    }
    purgeLegacyAuthStorage();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
    }
    setSession(null);
  }, [session, supabase]);

  /** Ends the session on every device the account is signed in on. */
  const signOutEverywhere = useCallback(async () => {
    if (supabase && session && !session.id.startsWith("demo_")) {
      await supabase.auth.signOut({ scope: "global" });
    }
    purgeLegacyAuthStorage();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
    }
    setSession(null);
    setReports([]);
    setDebts([]);
  }, [session, supabase]);

  /** Re-authenticates with the current password, then sets a policy-clean new one. */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      setError(null);
      if (!supabase || !session) {
        setError("Connect Supabase and sign in to change the password.");
        return false;
      }
      if (typeof currentPassword !== "string" || currentPassword.length === 0) {
        setError("Enter your current password.");
        return false;
      }
      if (newPassword === currentPassword) {
        setError("Choose a password you have not used here before.");
        return false;
      }

      const issues = passwordIssues(newPassword, {
        email: session.email,
        displayName: session.displayName,
      });
      if (issues.length > 0) {
        setError(issues[0]);
        return false;
      }

      const decision = signInLimiter.check(`reauth:${session.id}`);
      if (!decision.allowed) {
        setError(
          `Too many attempts. Try again in ${formatWait(decision.retryAfterMs)}.`,
        );
        return false;
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: session.email,
        password: currentPassword,
      });
      if (reauthError) {
        setError("That current password is not right.");
        return false;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(safeErrorMessage(updateError, "Could not change the password."));
        return false;
      }

      // A password change should end sessions that were opened with the old one.
      await supabase.auth.signOut({ scope: "others" });
      return true;
    },
    [session, supabase],
  );

  const saveReport = useCallback(
    async (input: SaveReportInput) => {
      setError(null);
      if (!session) {
        setError("Sign in before filing a report.");
        return false;
      }

      // An unlinked, inactive or branch-less login cannot file anything, and the
      // database would refuse it too — say which one it is.
      const blocked = accountStateReason(session);
      if (blocked) {
        setError(blocked);
        return false;
      }

      const validated = validateReportInput(input, todayISO());
      if (!validated.ok) {
        setError(validated.errors[0]);
        return false;
      }
      const payload = validated.value;

      // A branch may only file for its own branch (the RLS insert policy is the
      // authority; this keeps the message friendly).
      if (session.role !== "admin" && payload.branchId !== session.branchId) {
        setError("You can only file reports for your own branch.");
        return false;
      }

      const decision = writeLimiter.check(`report:${session.id}`);
      if (!decision.allowed) {
        setError(`Slow down — try again in ${formatWait(decision.retryAfterMs)}.`);
        return false;
      }

      const sections = {
        cash: payload.cashPaise,
        online: payload.onlinePaise,
        finance: sumCategory(payload.lines, "finance"),
        debt: sumCategory(payload.lines, "debt"),
        exchange: sumCategory(payload.lines, "exchange"),
        cheque: sumCategory(payload.lines, "cheque"),
        store_use: sumCategory(payload.lines, "store_use"),
        others: sumCategory(payload.lines, "others"),
      };

      let total: number;
      try {
        total = computeTotalSale(sections);
      } catch {
        setError("Every amount must be a non-negative number of rupees.");
        return false;
      }

      const branch = branches.find((item) => item.id === payload.branchId);
      if (!branch) {
        setError("Pick a branch before submitting.");
        return false;
      }

      if (backend === "demo" || !supabase || !session) {
        const report: DailyReport = {
          id: makeId("report"),
          branchId: branch.id,
          branchName: branch.name,
          reportDate: payload.reportDate,
          submittedBy: session?.id ?? "demo",
          submittedByName: session?.displayName ?? "Demo",
          cashPaise: payload.cashPaise,
          onlinePaise: payload.onlinePaise,
          lines: payload.lines.map((line) => ({ ...line, id: makeId("line") })),
          status: "active",
          voidReason: null,
          createdAt: new Date().toISOString(),
          reviewStatus: "pending",
          reviewNote: null,
          reviewedByName: null,
          reviewedAt: null,
        };

        const nextReports = [report, ...reports];
        const nextDebts = [
          ...payload.lines
            .filter((line) => line.category === "debt")
            .map<Debt>((line) => ({
              id: makeId("debt"),
              branchId: branch.id,
              productName: line.label || "Debt item",
              amountPaise: line.amountPaise,
              debtDate: payload.reportDate,
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
        report_date: payload.reportDate,
        submitted_by: session.id,
        cash_paise: payload.cashPaise,
        online_paise: payload.onlinePaise,
        total_paise: total,
        finance_count: payload.lines.filter((l) => l.category === "finance").length,
        has_debt: payload.lines.some((l) => l.category === "debt"),
        status: "active",
        review_status: "pending",
      });

      if (reportError) {
        logError("report insert failed", { code: reportError.code });
        setError(safeErrorMessage(reportError.message, "Could not file the report."));
        return false;
      }

      if (payload.lines.length > 0) {
        const { error: linesError } = await supabase.from("report_lines").insert(
          payload.lines.map((line) => ({
            report_id: reportId,
            category: line.category,
            label: line.label,
            amount_paise: line.amountPaise,
          })),
        );
        if (linesError) {
          logError("report lines insert failed", { code: linesError.code });
          setError(safeErrorMessage(linesError.message, "Could not save the report rows."));
          return false;
        }
      }

      const debtLines = payload.lines.filter((line) => line.category === "debt");
      if (debtLines.length > 0) {
        const { error: debtError } = await supabase.from("debts").insert(
          debtLines.map((line) => ({
            branch_id: branch.id,
            report_id: reportId,
            source: "report",
            product_name: line.label,
            amount_paise: line.amountPaise,
            debt_date: payload.reportDate,
            created_by: session.id,
          })),
        );
        if (debtError) {
          logError("debt insert failed", { code: debtError.code });
          setError(safeErrorMessage(debtError.message, "Could not save the debt rows."));
        }
      }

      await loadSupabase(session, supabase);
      return true;
    },
    [backend, branches, debts, loadSupabase, persistDemo, reports, session, supabase],
  );

  const voidReport = useCallback(
    async (reportId: string, reason: string) => {
      setError(null);
      if (!session) {
        setError("Sign in before voiding a report.");
        return false;
      }
      // Voiding is an admin action; the database enforces it too (policy +
      // the append-only trigger in migration 006).
      if (session.role !== "admin") {
        setError("Only an admin can void a filed report.");
        return false;
      }
      const validated = validateVoidReason(reason);
      if (!validated.ok) {
        setError(validated.errors[0]);
        return false;
      }
      const cleanReason = validated.value.reason;

      const decision = writeLimiter.check(`void:${session.id}`);
      if (!decision.allowed) {
        setError(`Slow down — try again in ${formatWait(decision.retryAfterMs)}.`);
        return false;
      }

      if (backend === "demo" || !supabase) {
        const nextReports = reports.map((report) =>
          report.id === reportId
            ? { ...report, status: "voided" as const, voidReason: cleanReason }
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
          void_reason: cleanReason,
          voided_by: session.id,
          voided_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (voidError) {
        logError("void failed", { code: voidError.code });
        setError(safeErrorMessage(voidError.message, "Could not void the report."));
        return false;
      }
      await loadSupabase(session, supabase);
      return true;
    },
    [backend, loadSupabase, persistDemo, reports, session, supabase],
  );

  /** Admin review: tick a report OK, or flag a concern against it. */
  const setReportReview = useCallback(
    async (reportId: string, status: ReviewStatus, note: string) => {
      setError(null);
      if (!session) {
        setError("Sign in before reviewing a report.");
        return false;
      }
      if (session.role !== "admin") {
        setError("Only an admin can review a report.");
        return false;
      }

      const validated = validateReview(status, note);
      if (!validated.ok) {
        setError(validated.errors[0]);
        return false;
      }
      const cleanNote = validated.value.note;

      const decision = writeLimiter.check(`review:${session.id}`);
      if (!decision.allowed) {
        setError(`Slow down — try again in ${formatWait(decision.retryAfterMs)}.`);
        return false;
      }

      if (backend === "demo" || !supabase) {
        const nextReports = reports.map((report) =>
          report.id === reportId
            ? {
                ...report,
                reviewStatus: status,
                reviewNote: status === "concern" ? cleanNote : null,
                reviewedByName: session?.displayName ?? "Admin",
                reviewedAt: new Date().toISOString(),
              }
            : report,
        );
        setReports(nextReports);
        persistDemo({ reports: nextReports });
        return true;
      }

      const { error: reviewError } = await supabase
        .from("daily_reports")
        .update({
          review_status: status,
          review_note: status === "concern" ? cleanNote : null,
          reviewed_by: session.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (reviewError) {
        logError("review update failed", { code: reviewError.code });
        setError(safeErrorMessage(reviewError.message, "Could not save the review."));
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
      if (!session) {
        setError("Sign in before recording a payment.");
        return false;
      }

      const debt = debts.find((item) => item.id === debtId);
      if (!debt) {
        setError("That debt is no longer in the ledger.");
        return false;
      }

      const validated = validateDebtPayment({
        amountPaise,
        note,
        outstandingPaise: debtOutstandingPaise(debt),
      });
      if (!validated.ok) {
        setError(validated.errors[0]);
        return false;
      }
      const payment = validated.value;

      const decision = writeLimiter.check(`payment:${session.id}`);
      if (!decision.allowed) {
        setError(`Slow down — try again in ${formatWait(decision.retryAfterMs)}.`);
        return false;
      }

      if (backend === "demo" || !supabase) {
        const nextDebts = debts.map((entry) =>
          entry.id === debtId
            ? {
                ...entry,
                payments: [
                  ...entry.payments,
                  {
                    id: makeId("pay"),
                    amountPaise: payment.amountPaise,
                    paidOn: todayISO(),
                    note: payment.note,
                  },
                ],
              }
            : entry,
        );
        setDebts(nextDebts);
        persistDemo({ debts: nextDebts });
        return true;
      }

      const { error: paymentError } = await supabase.from("debt_payments").insert({
        debt_id: debtId,
        amount_paise: payment.amountPaise,
        note: payment.note,
        recorded_by: session.id,
      });

      if (paymentError) {
        logError("payment insert failed", { code: paymentError.code });
        setError(safeErrorMessage(paymentError.message, "Could not record the payment."));
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
      if (!session) {
        setError("Sign in before adding a debt.");
        return false;
      }

      const validated = validateManualDebt(input, todayISO());
      if (!validated.ok) {
        setError(validated.errors[0]);
        return false;
      }
      const debtEntry = validated.value;

      const blocked = accountStateReason(session);
      if (blocked) {
        setError(blocked);
        return false;
      }

      if (session.role !== "admin" && debtEntry.branchId !== session.branchId) {
        setError("You can only add debts for your own branch.");
        return false;
      }

      const decision = writeLimiter.check(`debt:${session.id}`);
      if (!decision.allowed) {
        setError(`Slow down — try again in ${formatWait(decision.retryAfterMs)}.`);
        return false;
      }

      if (backend === "demo" || !supabase) {
        const nextDebts: Debt[] = [
          {
            id: makeId("debt"),
            branchId: debtEntry.branchId,
            productName: debtEntry.productName,
            amountPaise: debtEntry.amountPaise,
            debtDate: debtEntry.debtDate,
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
        branch_id: debtEntry.branchId,
        product_name: debtEntry.productName,
        amount_paise: debtEntry.amountPaise,
        debt_date: debtEntry.debtDate,
        source: "manual",
        created_by: session.id,
      });

      if (insertError) {
        logError("debt insert failed", { code: insertError.code });
        setError(safeErrorMessage(insertError.message, "Could not add the debt."));
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
      clearError: () => {
        setError(null);
        setPendingVerificationEmail(null);
      },
      pendingVerificationEmail,
      resendVerification,
      changePassword,
      signOutEverywhere,
      signIn,
      signInWithGoogle,
      completeGoogleSignIn,
      signInDemo,
      signOut,
      saveReport,
      voidReport,
      setReportReview,
      recordDebtPayment,
      addManualDebt,
    }),
    [
      addManualDebt,
      backend,
      branches,
      changePassword,
      completeGoogleSignIn,
      debts,
      error,
      pendingVerificationEmail,
      ready,
      recordDebtPayment,
      reports,
      resendVerification,
      saveReport,
      session,
      setReportReview,
      signIn,
      signInWithGoogle,
      signInDemo,
      signOut,
      signOutEverywhere,
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
