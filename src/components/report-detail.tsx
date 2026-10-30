"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Flag,
  Minus,
  PencilLine,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportEditForm } from "@/components/report-edit-form";
import {
  formatDateLabel,
  formatINR,
  formatINRCompact,
  formatINRSigned,
  formatWeekdayShort,
} from "@/lib/format";
import {
  LINE_CATEGORY_META,
  SECTION_META,
  advancesAppliedOn,
  reviewLabel,
} from "@/lib/report";
import type { ReportSummary } from "@/lib/report";
import { reportContext } from "@/lib/sales-analytics";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const REVIEW_BADGE: Record<
  ReportSummary["report"]["reviewStatus"],
  "default" | "secondary" | "destructive"
> = {
  pending: "default",
  ok: "secondary",
  concern: "destructive",
};

function ChangePill({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> no history
      </span>
    );
  }
  const up = change >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-primary" : "text-destructive",
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5" />
      ) : (
        <ArrowDownRight className="size-3.5" />
      )}
      {up ? "+" : ""}
      {change}% vs usual
    </span>
  );
}

/**
 * Opens one filed report — any day, any branch — with its sections, its lines
 * and (for admins) the review controls.
 *
 * When `context` is supplied (the admin review queue passes the reports in the
 * selected range), the sheet also compares the day with that branch's usual
 * filed day and the day before, so a reviewer can judge the number instead of
 * only reading it.
 */
export function ReportDetail({
  summary,
  context,
  initialFlag = false,
  canEdit = false,
  onClose,
}: {
  summary: ReportSummary;
  /** Same-scope reports used for the "usual day" comparison. */
  context?: ReportSummary[];
  /** Open straight into the concern note, e.g. from the table's flag action. */
  initialFlag?: boolean;
  /** Admins can correct a filed report instead of voiding the whole day. */
  canEdit?: boolean;
  onClose: () => void;
}) {
  const { session, setReportReview, advances } = useAppStore();
  const { report, sections, totalPaise } = summary;
  const canReview = session?.role === "admin" && report.status === "active";

  const [note, setNote] = useState(report.reviewNote ?? "");
  const [editing, setEditing] = useState(false);
  const [flagging, setFlagging] = useState(
    initialFlag || report.reviewStatus === "concern",
  );
  const [saving, setSaving] = useState(false);

  const dayAdvances = useMemo(
    () => advancesAppliedOn(advances, report.branchId, report.reportDate),
    [advances, report.branchId, report.reportDate],
  );

  const stats = useMemo(
    () => (context ? reportContext(context, summary) : null),
    [context, summary],
  );

  const linesTotal = report.lines.reduce(
    (sum, line) => sum + line.amountPaise,
    0,
  );

  // Close on Escape and keep the page behind the modal from scrolling.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function review(status: "ok" | "concern") {
    setSaving(true);
    const result = await setReportReview(report.id, status, note);
    setSaving(false);
    if (!result.ok) {
      toast.error(
        result.error ??
          (status === "concern"
            ? "Add a short note before flagging the report."
            : "Could not save the review."),
      );
      return;
    }
    toast.success(
      status === "ok"
        ? `Ticked OK for ${formatDateLabel(report.reportDate)}.`
        : `Concern flagged for ${formatDateLabel(report.reportDate)}.`,
    );
    if (status === "ok") setFlagging(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Report for ${report.reportDate}`}
        className="safe-bottom max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-card text-card-foreground shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur sm:gap-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold">
              {formatDateLabel(report.reportDate)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {formatWeekdayShort(report.reportDate)}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {report.branchName} · filed by {report.submittedByName}
              {report.editedAt
                ? ` · edited by ${report.editedByName ?? "admin"}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {report.status === "voided" ? (
              <Badge variant="destructive">Voided</Badge>
            ) : null}
            <Badge variant={REVIEW_BADGE[report.reviewStatus]}>
              {reviewLabel(report.reviewStatus)}
            </Badge>
            {canEdit && session?.role === "admin" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing((current) => !current)}
              >
                <PencilLine className="size-4" />
                <span className="hidden sm:inline">
                  {editing ? "Close edit" : "Edit"}
                </span>
                <span className="sr-only sm:hidden">
                  {editing ? "Close edit" : "Edit report"}
                </span>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close report"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {editing ? (
          <div className="px-4 py-4 sm:px-5">
            <ReportEditForm
              summary={summary}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div className="space-y-5 px-4 py-4 sm:px-5">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Total Sale
                </p>
                <p className="tnum font-display text-3xl font-semibold tracking-tight">
                  {formatINR(totalPaise)}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>
                  Cash{" "}
                  <span className="tnum font-medium text-foreground">
                    {formatINR(report.cashPaise)}
                  </span>
                </p>
                <p className="mt-0.5">
                  Online{" "}
                  <span className="tnum font-medium text-foreground">
                    {formatINR(report.onlinePaise)}
                  </span>
                </p>
                <p className="mt-0.5">
                  {report.lines.length} line item
                  {report.lines.length === 1 ? "" : "s"} ·{" "}
                  <span className="tnum">{formatINR(linesTotal)}</span>
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Cash + Online + Finance + Debt + Exchange + Cheque + Store use +
              Others
            </p>
            {report.shopClosed ? (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900">
                The shop was closed on this day. No sale is recorded, and the
                day counts as accounted for rather than missing.
              </p>
            ) : null}
            {summary.expensePaise > 0 ? (
              <dl className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">
                    Expense (money out, not in total)
                  </dt>
                  <dd className="tnum text-rose-600">
                    −{formatINR(summary.expensePaise)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-medium">Net in hand</dt>
                  <dd className="tnum font-medium">
                    {formatINRSigned(totalPaise - summary.expensePaise)}
                  </dd>
                </div>
              </dl>
            ) : null}
            {dayAdvances.count > 0 ? (
              <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-900">
                Advance added to {formatDateLabel(report.reportDate)}:{" "}
                {formatINR(dayAdvances.totalPaise)} from {dayAdvances.count}{" "}
                customer{dayAdvances.count === 1 ? "" : "s"}. It is counted in
                that day&apos;s Total Sale, not in this report&apos;s own lines.
              </p>
            ) : null}
          </div>

          {report.status === "voided" && report.voidReason ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Voided: {report.voidReason}
            </p>
          ) : null}

          {report.note ? (
            <section className="rounded-lg border bg-accent/30 p-3">
              <h3 className="text-sm font-semibold">Description / note</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {report.note}
              </p>
            </section>
          ) : null}

          {stats && stats.sampleDays > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Performance context</h3>
                <ChangePill change={stats.changeVsTypical} />
              </div>
              <dl className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Usual filed day
                  </dt>
                  <dd className="tnum mt-1 font-display text-base font-semibold">
                    {stats.typicalPaise !== null
                      ? formatINR(stats.typicalPaise)
                      : "—"}
                  </dd>
                  <p className="text-[10px] text-muted-foreground">
                    avg of {stats.sampleDays} previous day
                    {stats.sampleDays === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Previous day
                  </dt>
                  <dd className="tnum mt-1 font-display text-base font-semibold">
                    {stats.previousDay
                      ? formatINR(stats.previousDay.totalPaise)
                      : "—"}
                  </dd>
                  <p className="text-[10px] text-muted-foreground">
                    {stats.previousDay
                      ? formatDateLabel(stats.previousDay.date)
                      : "no report filed"}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Previous 7 days
                  </dt>
                  <dd className="tnum mt-1 font-display text-base font-semibold">
                    {stats.lowestInRange
                      ? `${formatINRCompact(stats.lowestInRange.totalPaise)} – ${
                          stats.bestInRange
                            ? formatINRCompact(stats.bestInRange.totalPaise)
                            : "—"
                        }`
                      : "—"}
                  </dd>
                  <p className="text-[10px] text-muted-foreground">
                    lowest to highest filed day
                  </p>
                </div>
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Section breakdown</h3>
            <dl className="space-y-2">
              {SECTION_META.map((section) => {
                const value = sections[section.key];
                const share =
                  totalPaise > 0 ? (value / totalPaise) * 100 : 0;
                return (
                  <div
                    key={section.key}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-dashed pb-1.5",
                      value === 0 && "text-muted-foreground",
                    )}
                  >
                    <dt className="text-sm">{section.label}</dt>
                    <dd className="tnum text-right text-sm">
                      {formatINR(value)}
                    </dd>
                    <div className="col-span-2 mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="tnum w-9 text-right text-[10px] text-muted-foreground">
                        {Math.round(share)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </dl>
          </section>

          {report.lines.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Line items</h3>
              {LINE_CATEGORY_META.map((meta) => {
                const lines = report.lines.filter(
                  (line) => line.category === meta.key,
                );
                if (lines.length === 0) return null;
                const subtotal = lines.reduce(
                  (sum, line) => sum + line.amountPaise,
                  0,
                );
                return (
                  <div key={meta.key}>
                    <div className="flex items-baseline justify-between gap-3 border-b pb-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {meta.label} ({lines.length})
                      </p>
                      <p className="tnum text-xs font-medium">
                        {formatINR(subtotal)}
                      </p>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="truncate">
                            {line.label || "—"}
                          </span>
                          <span className="tnum shrink-0">
                            {formatINR(line.amountPaise)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className="rounded-lg border bg-muted/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Review</h3>
              {report.reviewedAt ? (
                <span className="text-[11px] text-muted-foreground">
                  Updated {report.reviewedAt.slice(0, 10)}
                </span>
              ) : null}
            </div>
            {report.reviewStatus === "pending" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No admin has checked this report yet.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Marked{" "}
                <span className="text-foreground">
                  {reviewLabel(report.reviewStatus)}
                </span>
                {report.reviewedByName ? ` by ${report.reviewedByName}` : ""}
                {report.reviewedAt
                  ? ` on ${formatDateLabel(report.reviewedAt.slice(0, 10))}`
                  : ""}
                .
              </p>
            )}
            {report.reviewStatus === "concern" && report.reviewNote ? (
              <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {report.reviewNote}
              </p>
            ) : null}
            {report.reviewStatus === "ok" && report.reviewNote ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Note: {report.reviewNote}
              </p>
            ) : null}

            {canReview ? (
              <div className="mt-4 space-y-3">
                {flagging ? (
                  <div className="space-y-1">
                    <Label htmlFor="review-note">What looks wrong?</Label>
                    <Input
                      id="review-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="e.g. cash is far below the usual total"
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => void review("ok")}
                  >
                    <Check className="size-4" />
                    {report.reviewStatus === "ok" ? "Re-confirm OK" : "Tick OK"}
                  </Button>
                  {flagging ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={saving}
                      onClick={() => void review("concern")}
                    >
                      <Flag className="size-4" />
                      Save concern
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setFlagging(true);
                        setNote("");
                      }}
                    >
                      <Flag className="size-4" />
                      Flag concern
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {session?.role === "admin"
                  ? "Voided reports cannot be reviewed."
                  : "Only an admin can review a report."}
              </p>
            )}
          </section>
          </div>
        )}
      </div>
    </div>
  );
}
