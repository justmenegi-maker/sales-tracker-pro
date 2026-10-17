"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DebtLedger } from "@/components/debt-ledger";
import { OfflineSales } from "@/components/offline-sales";
import { ReportForm } from "@/components/report-form";
import { ReportsTable } from "@/components/reports-table";
import { RequireAuth } from "@/components/require-auth";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { formatINRWhole, todayISO } from "@/lib/format";
import {
  debtOutstandingPaise,
  deriveDebtStatus,
  reviewCounts,
  summarizeReports,
  totalsByDate,
  trendSeries,
} from "@/lib/report";
import { useAppStore } from "@/lib/store";

function DashboardBody() {
  const { session, reports, debts, branches } = useAppStore();

  const [activeBranchFilter, setActiveBranchFilter] = useState<string>(
    session?.branchId || "all",
  );

  const effectiveBranchId =
    session?.role === "branch" && session.branchId
      ? session.branchId
      : activeBranchFilter === "all"
        ? null
        : activeBranchFilter;

  const today = todayISO();
  const month = today.slice(0, 7);

  const summaries = useMemo(() => summarizeReports(reports), [reports]);

  const scoped = useMemo(
    () =>
      summaries.filter(
        (summary) =>
          summary.report.status === "active" &&
          (!effectiveBranchId || summary.report.branchId === effectiveBranchId),
      ),
    [effectiveBranchId, summaries],
  );

  const totals = useMemo(() => totalsByDate(scoped), [scoped]);
  const trend = useMemo(
    () => trendSeries(totals, 14, today),
    [today, totals],
  );

  const todayTotal = totals.get(today) ?? 0;
  const monthSummaries = useMemo(
    () =>
      scoped.filter((summary) => summary.report.reportDate.startsWith(month)),
    [month, scoped],
  );
  const monthTotal = monthSummaries.reduce(
    (sum, summary) => sum + summary.totalPaise,
    0,
  );
  const monthFinance = monthSummaries.reduce(
    (sum, summary) => sum + summary.financeCount,
    0,
  );
  const review = useMemo(
    () => reviewCounts(scoped.map((summary) => summary.report)),
    [scoped],
  );

  const outstanding = debts
    .filter(
      (debt) => !debt.voided && (!effectiveBranchId || debt.branchId === effectiveBranchId),
    )
    .filter((debt) => deriveDebtStatus(debt) !== "cleared")
    .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0);

  const openDebtCount = debts.filter(
    (debt) =>
      !debt.voided &&
      (!effectiveBranchId || debt.branchId === effectiveBranchId) &&
      deriveDebtStatus(debt) !== "cleared",
  ).length;

  const currentBranch = branches.find((b) => b.id === effectiveBranchId);
  const branchSubtitle = currentBranch
    ? `${currentBranch.name} · ${session?.displayName ?? ""}`
    : `All branches · ${session?.displayName ?? ""}`;

  const historySummaries = [...scoped].sort((a, b) =>
    a.report.reportDate < b.report.reportDate ? 1 : -1,
  );

  return (
    <AppShell title="Daily sales report" subtitle={branchSubtitle}>
      <div className="space-y-6">
        {session?.role === "branch" && !session?.branchId ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900">
            <p className="font-semibold">Branch Assignment Pending</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your account ({session.email}) has not been assigned to a branch yet. Please ask an admin (justmenegi@gmail.com) to assign your Gmail in the Admin portal.
            </p>
          </div>
        ) : null}

        {session?.role === "admin" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Filter Branch:
            </span>
            <Button
              size="sm"
              variant={activeBranchFilter === "all" ? "default" : "outline"}
              onClick={() => setActiveBranchFilter("all")}
            >
              All Branches
            </Button>
            {branches.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={activeBranchFilter === b.id ? "default" : "outline"}
                onClick={() => setActiveBranchFilter(b.id)}
              >
                {b.name}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Today's Total Sale"
            value={formatINRWhole(todayTotal)}
            hint={todayTotal > 0 ? "Report filed" : "Not filed yet"}
            tone="primary"
          />
          <StatTile
            label="This month"
            value={formatINRWhole(monthTotal)}
            hint={`${monthSummaries.length} reports · ${monthFinance} finance`}
          />
          <StatTile
            label="Debt outstanding"
            value={formatINRWhole(outstanding)}
            hint={`${openDebtCount} open ledger entries`}
            tone={outstanding > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Flagged by admin"
            value={String(review.concern)}
            hint={`${review.pending} awaiting review`}
            tone={review.concern > 0 ? "warning" : "default"}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Last 14 days</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <TrendChart points={trend} />
          </CardContent>
        </Card>

        <ReportForm />

        <div className="grid gap-6 lg:grid-cols-2">
          <ReportsTable
            summaries={historySummaries}
            title={effectiveBranchId ? "Your filed reports" : "Consolidated branch reports"}
            limit={10}
            emptyHint="Nothing filed yet. Add today's numbers above to get started."
          />
          <DebtLedger branchId={effectiveBranchId} />
        </div>

        {/* Reminders only: these prices are already in the cash/online totals. */}
        <OfflineSales branchId={effectiveBranchId} />
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardBody />
    </RequireAuth>
  );
}
