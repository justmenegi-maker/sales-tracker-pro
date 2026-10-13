"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReportsTable } from "@/components/reports-table";
import { RequireAuth } from "@/components/require-auth";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { addDays, formatDateLabel, formatINRWhole, todayISO } from "@/lib/format";
import {
  REVIEW_META,
  debtOutstandingPaise,
  deriveDebtStatus,
  reviewCounts,
  summarizeReports,
  totalsByBranchDate,
  totalsByDate,
  trendSeries,
  withinRange,
} from "@/lib/report";
import type { ReviewStatus } from "@/lib/report";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES = [7, 14, 30];

function AdminBody() {
  const { branches, reports, debts } = useAppStore();
  const [days, setDays] = useState(14);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | ReviewStatus>("all");

  const today = todayISO();
  const rangeStart = addDays(today, -(days - 1));

  // Totals are summed once per data change, not per tile, row and trend point.
  const summaries = useMemo(() => summarizeReports(reports), [reports]);

  const rangeAll = useMemo(
    () => withinRange(summaries, rangeStart, today),
    [rangeStart, summaries, today],
  );

  const inRange = useMemo(
    () =>
      branchFilter === "all"
        ? rangeAll
        : rangeAll.filter((summary) => summary.report.branchId === branchFilter),
    [branchFilter, rangeAll],
  );

  const rangeTotal = useMemo(
    () => inRange.reduce((sum, summary) => sum + summary.totalPaise, 0),
    [inRange],
  );

  const review = useMemo(
    () => reviewCounts(inRange.map((summary) => summary.report)),
    [inRange],
  );

  const trend = useMemo(
    () => trendSeries(totalsByDate(inRange), days, today),
    [days, inRange, today],
  );

  const perBranch = useMemo(() => {
    const totalsByBranch = totalsByBranchDate(rangeAll);
    const datesByBranch = new Map<string, Set<string>>();
    for (const summary of rangeAll) {
      const dates = datesByBranch.get(summary.report.branchId) ?? new Set();
      dates.add(summary.report.reportDate);
      datesByBranch.set(summary.report.branchId, dates);
    }

    return branches.map((branch) => {
      const byDate = totalsByBranch.get(branch.id);
      const branchDebts = debts.filter(
        (debt) => !debt.voided && debt.branchId === branch.id,
      );
      const lastFiled = summaries
        .filter(
          (summary) =>
            summary.report.branchId === branch.id &&
            summary.report.status === "active",
        )
        .reduce<string | null>(
          (latest, summary) =>
            !latest || summary.report.reportDate > latest
              ? summary.report.reportDate
              : latest,
          null,
        );

      return {
        branch,
        total: byDate ? [...byDate.values()].reduce((sum, v) => sum + v, 0) : 0,
        reports: (datesByBranch.get(branch.id) ?? new Set()).size,
        outstanding: branchDebts
          .filter((debt) => deriveDebtStatus(debt) !== "cleared")
          .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0),
        lastFiledDate: lastFiled,
      };
    });
  }, [branches, debts, rangeAll, summaries]);

  const visibleBranches = perBranch.filter(
    (row) => branchFilter === "all" || row.branch.id === branchFilter,
  );
  const missingDays = visibleBranches.reduce(
    (sum, row) => sum + (days - row.reports),
    0,
  );

  const tableSummaries = useMemo(() => {
    const filtered =
      reviewFilter === "all"
        ? inRange
        : inRange.filter(
            (summary) => summary.report.reviewStatus === reviewFilter,
          );
    return [...filtered].sort((a, b) =>
      a.report.reportDate < b.report.reportDate ? 1 : -1,
    );
  }, [inRange, reviewFilter]);

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
            label="Needs review"
            value={String(review.pending)}
            hint="Waiting for an admin check"
            tone={review.pending > 0 ? "accent" : "default"}
          />
          <StatTile
            label="Flagged concerns"
            value={String(review.concern)}
            hint={`${review.ok} ticked OK`}
            tone={review.concern > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Missing branch days"
            value={String(missingDays)}
            hint={`${visibleBranches.length} branches × ${days} days`}
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
            const missing = days - row.reports;
            return (
              <Card key={row.branch.id} className={cn(!selected && "opacity-50")}>
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
                  {missing > 0 ? (
                    <p className="col-span-2 rounded-md border border-accent-foreground/25 bg-accent/40 px-3 py-2 text-xs">
                      {missing} day{missing > 1 ? "s" : ""} without a report in
                      this range.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Review
          </span>
          <Button
            size="sm"
            variant={reviewFilter === "all" ? "default" : "outline"}
            onClick={() => setReviewFilter("all")}
          >
            All
          </Button>
          {REVIEW_META.map((meta) => (
            <Button
              key={meta.key}
              size="sm"
              variant={reviewFilter === meta.key ? "default" : "outline"}
              onClick={() => setReviewFilter(meta.key)}
            >
              {meta.label}
            </Button>
          ))}
        </div>

        <ReportsTable
          summaries={tableSummaries}
          title="Reports in range"
          showBranch
          canReview
          canVoid
          limit={25}
          emptyHint={
            reviewFilter === "all"
              ? "No reports filed in this range for the selected branches."
              : "Nothing matches this review filter in the selected range."
          }
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
