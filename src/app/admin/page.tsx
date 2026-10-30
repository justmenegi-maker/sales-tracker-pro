"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { AdvanceLedger } from "@/components/advance-ledger";
import { AppShell } from "@/components/app-shell";
import { OfflineSaleReminders } from "@/components/offline-sales";
import { ReportsTable } from "@/components/reports-table";
import { SalesExportCard } from "@/components/sales-export";
import { RequireAuth } from "@/components/require-auth";
import { TrendChart } from "@/components/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatTile } from "@/components/ui/stat-tile";
import {
  addDays,
  formatDateLabel,
  formatINRWhole,
  formatINRWholeSigned,
  todayISO,
} from "@/lib/format";
import {
  REVIEW_META,
  advanceAppliedPaise,
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
  const {
    branches,
    reports,
    debts,
    advances,
    invites,
    addBranch,
    deleteBranch,
    inviteStaff,
    deleteInvite,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"sales" | "staff">("sales");
  const [days, setDays] = useState(14);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | ReviewStatus>("all");

  // Form states for adding branch
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchManagerEmail, setNewBranchManagerEmail] = useState("");
  const [newBranchManagerName, setNewBranchManagerName] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);

  // Form states for inviting staff
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteBranchId, setInviteBranchId] = useState(branches[0]?.id || "");
  const [inviteRole, setInviteRole] = useState<"branch" | "admin">("branch");
  const [invitingStaff, setInvitingStaff] = useState(false);

  const today = todayISO();
  const rangeStart = addDays(today, -(days - 1));

  // Totals are summed once per data change, not per tile, row and trend point.
  const summaries = useMemo(() => summarizeReports(reports), [reports]);

  const rangeAll = useMemo(
    () => withinRange(summaries, rangeStart, today),
    [rangeStart, summaries, today],
  );

  // Voided reports stay visible in the table but never count as sales.
  const rangeActive = useMemo(
    () => rangeAll.filter((summary) => summary.report.status === "active"),
    [rangeAll],
  );

  const branchSummaries = useMemo(
    () =>
      branchFilter === "all"
        ? summaries
        : summaries.filter(
            (summary) => summary.report.branchId === branchFilter,
          ),
    [branchFilter, summaries],
  );

  const inRangeAll = useMemo(
    () =>
      branchFilter === "all"
        ? rangeAll
        : rangeAll.filter((summary) => summary.report.branchId === branchFilter),
    [branchFilter, rangeAll],
  );

  const inRange = useMemo(
    () =>
      branchFilter === "all"
        ? rangeActive
        : rangeActive.filter(
            (summary) => summary.report.branchId === branchFilter,
          ),
    [branchFilter, rangeActive],
  );

  const scopeLabel =
    branchFilter === "all"
      ? "All branches"
      : branches.find((branch) => branch.id === branchFilter)?.name ??
        "Selected branch";

  const branchAdvances = useMemo(
    () =>
      branchFilter === "all"
        ? advances
        : advances.filter((advance) => advance.branchId === branchFilter),
    [advances, branchFilter],
  );

  // Advance money added to a sale inside the selected range. It counts on the
  // day it was added, so the range, the trend and the branch cards agree with
  // the branch's own daily tiles.
  const rangeAdvances = useMemo(
    () =>
      branchAdvances.filter(
        (advance) =>
          advance.appliedOn &&
          advance.appliedOn >= rangeStart &&
          advance.appliedOn <= today,
      ),
    [branchAdvances, rangeStart, today],
  );

  const rangeAdvancePaise = useMemo(
    () =>
      rangeAdvances.reduce(
        (sum, advance) => sum + advanceAppliedPaise(advance),
        0,
      ),
    [rangeAdvances],
  );

  const rangeDailyTotals = useMemo(
    () => totalsByDate(inRange, rangeAdvances),
    [inRange, rangeAdvances],
  );

  const rangeTotal = useMemo(
    () =>
      [...rangeDailyTotals.values()].reduce((sum, paise) => sum + paise, 0),
    [rangeDailyTotals],
  );

  // Money paid out, tracked beside Total Sale and never inside it.
  const rangeExpense = useMemo(
    () => inRange.reduce((sum, summary) => sum + summary.expensePaise, 0),
    [inRange],
  );

  const review = useMemo(
    () => reviewCounts(inRange.map((summary) => summary.report)),
    [inRange],
  );

  const trend = useMemo(
    () => trendSeries(rangeDailyTotals, days, today),
    [days, rangeDailyTotals, today],
  );

  const perBranch = useMemo(() => {
    const totalsByBranch = totalsByBranchDate(rangeActive, rangeAdvances);
    const datesByBranch = new Map<string, Set<string>>();
    for (const summary of rangeActive) {
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
  }, [branches, debts, rangeActive, rangeAdvances, summaries]);

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
        ? inRangeAll
        : inRangeAll.filter(
            (summary) => summary.report.reviewStatus === reviewFilter,
          );
    return [...filtered].sort((a, b) =>
      a.report.reportDate < b.report.reportDate ? 1 : -1,
    );
  }, [inRangeAll, reviewFilter]);

  async function handleAddBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!newBranchName.trim()) {
      toast.error("Please enter a branch name.");
      return;
    }
    setAddingBranch(true);
    const result = await addBranch(
      newBranchName.trim(),
      newBranchManagerEmail.trim() || undefined,
      newBranchManagerName.trim() || undefined,
    );
    setAddingBranch(false);
    if (result.ok) {
      toast.success(`Branch "${newBranchName}" created successfully.`);
      setNewBranchName("");
      setNewBranchManagerEmail("");
      setNewBranchManagerName("");
      // A manager invitation that did not land is a caveat on a created branch.
      if (result.error) toast.warning(result.error);
      return;
    }
    // The store knows why Firestore refused the write; "try again" hid that.
    toast.error(result.error ?? "Could not create branch. Please try again.");
  }

  async function handleInviteStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast.error("Please provide a valid Gmail address.");
      return;
    }
    const targetBranch = inviteBranchId || branches[0]?.id;
    if (!targetBranch) {
      toast.error("Please select a branch first.");
      return;
    }

    setInvitingStaff(true);
    const result = await inviteStaff({
      email: inviteEmail.trim(),
      displayName: inviteName.trim() || inviteEmail.split("@")[0],
      branchId: targetBranch,
      role: inviteRole,
    });
    setInvitingStaff(false);
    if (result.ok) {
      toast.success(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail("");
      setInviteName("");
      return;
    }
    toast.error(result.error ?? "Failed to send staff invitation.");
  }

  return (
    <AppShell
      title="Admin Portal"
      subtitle={`${branches.length} branches · ${invites.length} staff members`}
    >
      <div className="space-y-6">
        {/* Navigation Tabs — scrolls sideways on a phone instead of stretching the page. */}
        <div className="flex overflow-x-auto border-b">
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              activeTab === "sales"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("sales")}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span className="hidden sm:inline">Consolidated Sales &amp; Overview</span>
            <span className="sm:hidden">Sales &amp; overview</span>
          </button>
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              activeTab === "staff"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("staff")}
          >
            <Users className="size-4 shrink-0" />
            <span className="hidden sm:inline">
              Branches &amp; Staff Management ({branches.length} Branches, {invites.length} Invites)
            </span>
            <span className="sm:hidden">
              Branches &amp; staff ({branches.length}/{invites.length})
            </span>
          </button>
        </div>

        {activeTab === "sales" ? (
          <>
            {/* Export sits first so it is visible without scrolling on a phone. */}
            <SalesExportCard
              summaries={branchSummaries}
              scopeLabel={scopeLabel}
              advances={branchAdvances}
            />

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
                hint={
                  rangeAdvancePaise > 0
                    ? `${inRange.length} reports · incl. ${formatINRWhole(rangeAdvancePaise)} advance`
                    : `${inRange.length} reports filed`
                }
                tone="primary"
              />
              <StatTile
                label="Expense in range"
                value={formatINRWhole(rangeExpense)}
                hint={`Net in hand ${formatINRWholeSigned(rangeTotal - rangeExpense)}`}
              />
              <StatTile
                label="Needs review"
                value={String(review.pending)}
                hint="Waiting for admin check"
                tone={review.pending > 0 ? "accent" : "default"}
              />
              <StatTile
                label="Flagged concerns"
                value={String(review.concern)}
                hint={`${review.ok} marked OK`}
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
                <CardTitle className="text-lg">
                  Consolidated Daily Trend ({days} days)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <TrendChart points={trend} />
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleBranches.map((row) => {
                const missing = days - row.reports;
                return (
                  <Card key={row.branch.id} className="relative overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {row.branch.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {row.reports} of {days} days filed
                          </p>
                        </div>
                        {row.branch.managerEmail ? (
                          <Badge
                            variant="outline"
                            className="max-w-[9rem] truncate text-[10px] sm:max-w-none"
                          >
                            {row.branch.managerEmail}
                          </Badge>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total Sale</span>
                        <p className="tnum font-display text-base font-semibold">
                          {formatINRWhole(row.total)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Debt outstanding
                        </span>
                        <p
                          className={cn(
                            "tnum font-display text-base font-semibold",
                            row.outstanding > 0 ? "text-amber-700" : "",
                          )}
                        >
                          {formatINRWhole(row.outstanding)}
                        </p>
                      </div>
                      <div className="col-span-2 text-muted-foreground">
                        Last filed:{" "}
                        <span className="font-medium text-foreground">
                          {row.lastFiledDate
                            ? formatDateLabel(row.lastFiledDate)
                            : "Never"}
                        </span>
                      </div>
                      {missing > 0 ? (
                        <div className="col-span-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700">
                          {missing} day{missing > 1 ? "s" : ""} without a report in this range
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Daily report review
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Open any day to compare it with the branch&apos;s usual
                    sale, then tick it OK or flag a concern.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {tableSummaries.length} report
                  {tableSummaries.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Filter
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
            </div>

            <ReportsTable
              summaries={tableSummaries}
              contextSummaries={branchSummaries}
              detailed
              title="Reports in range"
              showBranch
              canReview
              canVoid
              canEdit
              limit={25}
              emptyHint={
                reviewFilter === "all"
                  ? "No reports filed in this range for the selected branches."
                  : "Nothing matches this review filter in the selected range."
              }
            />

            {/* Advances: held money, advances folded into a later sale, refunds. */}
            <AdvanceLedger
              branchId={branchFilter === "all" ? null : branchFilter}
              showAddForm
            />

            {/* Review queue: tick a reminder once it is entered in the sales system. */}
            <OfflineSaleReminders
              branchId={branchFilter === "all" ? null : branchFilter}
              variant="admin"
            />
          </>
        ) : (
          /* Staff & Branch Management Tab */
          <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Add New Branch Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="size-5 text-primary" />
                    Add a Branch
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddBranch} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="branch-name">Branch Name *</Label>
                      <Input
                        id="branch-name"
                        required
                        placeholder="e.g. SK Tapri South Ex"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="branch-mgr-name">Manager Name</Label>
                        <Input
                          id="branch-mgr-name"
                          placeholder="e.g. Rahul Sharma"
                          value={newBranchManagerName}
                          onChange={(e) => setNewBranchManagerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="branch-mgr-email">Manager Gmail</Label>
                        <Input
                          id="branch-mgr-email"
                          type="email"
                          placeholder="manager.southex@gmail.com"
                          value={newBranchManagerEmail}
                          onChange={(e) => setNewBranchManagerEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={addingBranch} className="w-full gap-2">
                      <Plus className="size-4" />
                      {addingBranch ? "Adding branch…" : "Add Branch"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Invite Staff Member Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="size-5 text-primary" />
                    Invite Staff / Manager via Gmail
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleInviteStaff} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="staff-email">Gmail Address *</Label>
                        <Input
                          id="staff-email"
                          type="email"
                          required
                          placeholder="staff.name@gmail.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="staff-name">Display Name</Label>
                        <Input
                          id="staff-name"
                          placeholder="e.g. Amit Kumar"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="staff-branch">Assign Branch</Label>
                        <select
                          id="staff-branch"
                          value={inviteBranchId || branches[0]?.id || ""}
                          onChange={(e) => setInviteBranchId(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="staff-role">Role</Label>
                        <select
                          id="staff-role"
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as "branch" | "admin")}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="branch">Branch Staff / Manager</option>
                          <option value="admin">System Admin</option>
                        </select>
                      </div>
                    </div>

                    <Button type="submit" disabled={invitingStaff} className="w-full gap-2">
                      <Mail className="size-4" />
                      {invitingStaff ? "Sending invite…" : "Invite via Gmail"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Active Branches Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Configured Branches ({branches.length})</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Branches where daily sales reports and debt records are filed.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y rounded-md border">
                  {branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{b.name}</p>
                          <Badge variant="outline" className="max-w-full truncate font-mono text-[10px]">
                            ID: {b.id}
                          </Badge>
                        </div>
                        <p className="break-words text-xs text-muted-foreground">
                          Manager: {b.managerEmail ? `${b.managerName ? `${b.managerName} (${b.managerEmail})` : b.managerEmail}` : "Not assigned"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                        {branches.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={async () => {
                              if (!confirm(`Delete branch "${b.name}"?`)) return;
                              const result = await deleteBranch(b.id);
                              if (result.ok) {
                                toast.success(`Branch ${b.name} removed.`);
                              } else {
                                toast.error(result.error ?? `Could not remove ${b.name}.`);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Staff Invites Directory */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Staff & Manager Invitations ({invites.length})</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When invited staff sign in with their Gmail, their profile automatically links to the assigned branch.
                </p>
              </CardHeader>
              <CardContent>
                {invites.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No staff invitations yet. Use the invite form above to add branch staff using their Gmail address.
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {invites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm">{inv.displayName}</span>
                            <Badge variant={inv.status === "active" ? "default" : "outline"} className="text-[10px] gap-1">
                              {inv.status === "active" ? (
                                <>
                                  <CheckCircle2 className="size-3 text-emerald-500" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <Clock className="size-3 text-amber-500" />
                                  Invited
                                </>
                              )}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {inv.role}
                            </Badge>
                          </div>
                          <p className="break-all font-mono text-xs text-muted-foreground">
                            {inv.email} · Branch: <span className="font-sans font-medium text-foreground">{inv.branchName}</span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            const result = await deleteInvite(inv.id);
                            if (result.ok) {
                              toast.success(`Removed invite for ${inv.email}`);
                            } else {
                              toast.error(result.error ?? `Could not remove the invite for ${inv.email}.`);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
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
