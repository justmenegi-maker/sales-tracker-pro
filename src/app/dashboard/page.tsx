"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { DebtLedger } from "@/components/debt-ledger";
import { ReportForm } from "@/components/report-form";
import { ReportsTable } from "@/components/reports-table";
import { RequireAuth } from "@/components/require-auth";
import { TrendChart } from "@/components/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { addDays, formatINRWhole, formatWeekdayShort, todayISO } from "@/lib/format";
import { debtOutstandingPaise, deriveDebtStatus, reportTotalPaise } from "@/lib/report";
import { useAppStore } from "@/lib/store";

function DashboardBody() {
  const { session, reports, debts, branches } = useAppStore();

  const branchId = session?.branchId ?? null;
  const scopedReports = useMemo(
    () =>
      reports.filter(
        (report) => report.status === "active" && (!branchId || report.branchId === branchId),
      ),
    [branchId, reports],
  );

  const scopedDebts = useMemo(
    () => debts.filter((debt) => !debt.voided && (!branchId || debt.branchId === branchId)),
    [branchId, debts],
  );

  const today = todayISO();
  const month = today.slice(0, 7);

  const todayTotal = scopedReports
    .filter((report) => report.reportDate === today)
    .reduce((sum, report) => sum + reportTotalPaise(report), 0);

  const monthReports = scopedReports.filter((report) =>
    report.reportDate.startsWith(month),
  );
  const monthTotal = monthReports.reduce(
    (sum, report) => sum + reportTotalPaise(report),
    0,
  );

  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, -(13 - index));
    const value = scopedReports
      .filter((report) => report.reportDate === date)
      .reduce((sum, report) => sum + reportTotalPaise(report), 0);
    return { label: formatWeekdayShort(date), value };
  });

  const outstanding = scopedDebts
    .filter((debt) => deriveDebtStatus(debt) !== "cleared")
    .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0);

  const branchName =
    branches.find((branch) => branch.id === branchId)?.name ??
    (session?.role === "admin" ? "All branches" : "Your branch");

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
            hint={scopedReports.some((report) => report.reportDate === today)
              ? "Report filed"
              : "Not filed yet"}
            tone="primary"
          />
          <StatTile
            label="This month"
            value={formatINRWhole(monthTotal)}
            hint={`${monthReports.length} reports filed`}
          />
          <StatTile
            label="Debt outstanding"
            value={formatINRWhole(outstanding)}
            hint={`${scopedDebts.length} ledger entries`}
            tone={outstanding > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Finance count"
            value={String(
              scopedReports
                .filter((report) => report.reportDate.startsWith(month))
                .reduce(
                  (sum, report) =>
                    sum +
                    report.lines.filter((line) => line.category === "finance")
                      .length,
                  0,
                ),
            )}
            hint="Financed sales this month"
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
            reports={[...scopedReports].sort((a, b) =>
              a.reportDate < b.reportDate ? 1 : -1,
            )}
            title="Your filed reports"
            emptyHint="Nothing filed yet. Add today's numbers above to get started."
          />
          <DebtLedger branchId={branchId} />
        </div>
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
