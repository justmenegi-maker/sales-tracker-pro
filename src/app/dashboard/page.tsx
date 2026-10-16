"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { DebtLedger } from "@/components/debt-ledger";
import { ReportForm } from "@/components/report-form";
import { ReportsTable } from "@/components/reports-table";
import { RequireAuth } from "@/components/require-auth";
import { SecurityPanel } from "@/components/security-panel";
import { TrendChart } from "@/components/trend-chart";
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

  const branchId = session?.branchId ?? null;
  const today = todayISO();
  const month = today.slice(0, 7);

  const summaries = useMemo(() => summarizeReports(reports), [reports]);

  const scoped = useMemo(
    () =>
      summaries.filter(
        (summary) =>
          summary.report.status === "active" &&
          (!branchId || summary.report.branchId === branchId),
      ),
    [branchId, summaries],
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
      (debt) => !debt.voided && (!branchId || debt.branchId === branchId),
    )
    .filter((debt) => deriveDebtStatus(debt) !== "cleared")
    .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0);

  const openDebtCount = debts.filter(
    (debt) =>
      !debt.voided &&
      (!branchId || debt.branchId === branchId) &&
      deriveDebtStatus(debt) !== "cleared",
  ).length;

  const branchName =
    branches.find((branch) => branch.id === branchId)?.name ??
    (session?.role === "admin" ? "All branches" : "Your branch");

  const historySummaries = [...scoped].sort((a, b) =>
    a.report.reportDate < b.report.reportDate ? 1 : -1,
  );

  return (
    <AppShell
      title="Daily sales report"
      subtitle={`${branchName} · ${session?.displayName ?? ""}`}
    >
      <div className="space-y-6">
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
            title="Your filed reports"
            limit={10}
            emptyHint="Nothing filed yet. Add today's numbers above to get started."
          />
          <DebtLedger branchId={branchId} />
        </div>

        <SecurityPanel />
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
