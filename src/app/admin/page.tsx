"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReportsTable } from "@/components/reports-table";
import { RequireAuth } from "@/components/require-auth";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import {
  addDays,
  formatDateLabel,
  formatINRWhole,
  formatWeekdayShort,
  todayISO,
} from "@/lib/format";
import {
  debtOutstandingPaise,
  deriveDebtStatus,
  reportTotalPaise,
} from "@/lib/report";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES = [7, 14, 30];

function AdminBody() {
  const { branches, reports, debts } = useAppStore();
  const [days, setDays] = useState(14);
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const today = todayISO();
  const rangeStart = addDays(today, -(days - 1));

  const activeReports = useMemo(
    () => reports.filter((report) => report.status === "active"),
    [reports],
  );

  // Date range across every branch — the per-branch cards always use this, so a
  // branch filter never blanks out the other branches' numbers.
  const rangeReports = useMemo(
    () =>
      activeReports.filter(
        (report) => report.reportDate >= rangeStart && report.reportDate <= today,
      ),
    [activeReports, rangeStart, today],
  );

  const inRange = useMemo(
    () =>
      rangeReports.filter(
        (report) => branchFilter === "all" || report.branchId === branchFilter,
      ),
    [branchFilter, rangeReports],
  );

  const rangeTotal = inRange.reduce(
    (sum, report) => sum + reportTotalPaise(report),
    0,
  );

  const trend = useMemo(
    () =>
      Array.from({ length: days }, (_, index) => {
        const date = addDays(today, -(days - 1 - index));
        const value = inRange
          .filter((report) => report.reportDate === date)
          .reduce((sum, report) => sum + reportTotalPaise(report), 0);
        return { label: formatWeekdayShort(date), value };
      }),
    [days, inRange, today],
  );

  const perBranch = useMemo(
    () =>
      branches.map((branch) => {
        const branchReportsInRange = rangeReports.filter(
          (report) => report.branchId === branch.id,
        );
        const filedDays = new Set(
          branchReportsInRange.map((report) => report.reportDate),
        );
        const branchDebts = debts.filter(
          (debt) => !debt.voided && debt.branchId === branch.id,
        );
        const lastFiled = activeReports
          .filter((report) => report.branchId === branch.id)
          .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0];

        return {
          branch,
          total: branchReportsInRange.reduce(
            (sum, report) => sum + reportTotalPaise(report),
            0,
          ),
          reports: branchReportsInRange.length,
          missing: days - filedDays.size,
          outstanding: branchDebts
            .filter((debt) => deriveDebtStatus(debt) !== "cleared")
            .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0),
          lastFiledDate: lastFiled?.reportDate ?? null,
        };
      }),
    [activeReports, branches, days, debts, rangeReports],
  );

  const missingDays = perBranch
    .filter((row) => branchFilter === "all" || row.branch.id === branchFilter)
    .reduce((sum, row) => sum + row.missing, 0);

  const outstandingAll = perBranch
    .filter((row) => branchFilter === "all" || row.branch.id === branchFilter)
    .reduce((sum, row) => sum + row.outstanding, 0);

  return (
    <AppShell
      title="Admin overview"
      subtitle={`${formatDateLabel(rangeStart)} – ${formatDateLabel(today)} · ${
        branchFilter === "all"
          ? "all branches"
          : branches.find((branch) => branch.id === branchFilter)?.name
      }`}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Range
          </span>
          {RANGES.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={days === value ? "default" : "outline"}
              onClick={() => setDays(value)}
            >
              {value} days
            </Button>
          ))}
          <span className="ml-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Branch
          </span>
          <Button
            size="sm"
            variant={branchFilter === "all" ? "default" : "outline"}
            onClick={() => setBranchFilter("all")}
          >
            All
          </Button>
          {branches.map((branch) => (
            <Button
              key={branch.id}
              size="sm"
              variant={branchFilter === branch.id ? "default" : "outline"}
              onClick={() => setBranchFilter(branch.id)}
            >
              {branch.name}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total Sale in range"
            value={formatINRWhole(rangeTotal)}
            hint={`${inRange.length} reports filed`}
            tone="primary"
          />
          <StatTile
            label="Missing branch days"
            value={String(missingDays)}
            hint={`${branches.length} branches × ${days} days`}
            tone={missingDays > 0 ? "accent" : "default"}
          />
          <StatTile
            label="Debt outstanding"
            value={formatINRWhole(outstandingAll)}
            hint="Open + partially paid"
            tone={outstandingAll > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Average per day"
            value={formatINRWhole(Math.round(rangeTotal / days))}
            hint="Across the selected range"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Daily trend</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <TrendChart points={trend} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {perBranch.map((row) => {
            const selected =
              branchFilter === "all" || branchFilter === row.branch.id;
            return (
              <Card
                key={row.branch.id}
                className={cn(!selected && "opacity-50")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{row.branch.name}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Range total
                    </p>
                    <p className="tnum mt-1 font-display text-xl font-semibold">
                      {formatINRWhole(row.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Reports
                    </p>
                    <p className="tnum mt-1 font-display text-xl font-semibold">
                      {row.reports}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{days}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Debt outstanding
                    </p>
                    <p className="tnum mt-1">{formatINRWhole(row.outstanding)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Last filed
                    </p>
                    <p className="mt-1">
                      {row.lastFiledDate
                        ? formatDateLabel(row.lastFiledDate)
                        : "Never"}
                    </p>
                  </div>
                  {row.missing > 0 ? (
                    <p className="col-span-2 rounded-md border border-accent-foreground/25 bg-accent/40 px-3 py-2 text-xs">
                      {row.missing} day{row.missing > 1 ? "s" : ""} without a
                      report in this range.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <ReportsTable
          reports={[...inRange].sort((a, b) =>
            a.reportDate < b.reportDate ? 1 : -1,
          )}
          title="Reports in range"
          showBranch
          canVoid
          limit={40}
          emptyHint="No reports filed in this range for the selected branches."
        />
      </div>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <AdminBody />
    </RequireAuth>
  );
}
