"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Flag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateLabel, formatINR, formatWeekdayShort } from "@/lib/format";
import {
  LINE_CATEGORY_META,
  SECTION_META,
  reviewLabel,
} from "@/lib/report";
import type { ReportSummary } from "@/lib/report";
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

/**
 * Opens one filed report — any day, any branch — with its sections, its lines
 * and (for admins) the review controls.
 */
export function ReportDetail({
  summary,
  initialFlag = false,
  onClose,
}: {
  summary: ReportSummary;
  /** Open straight into the concern note, e.g. from the table's flag action. */
  initialFlag?: boolean;
  onClose: () => void;
}) {
  const { session, setReportReview } = useAppStore();
  const { report, sections, totalPaise } = summary;
  const canReview = session?.role === "admin" && report.status === "active";

  const [note, setNote] = useState(report.reviewNote ?? "");
  const [flagging, setFlagging] = useState(
    initialFlag || report.reviewStatus === "concern",
  );
  const [saving, setSaving] = useState(false);

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
    const ok = await setReportReview(report.id, status, note);
    setSaving(false);
    if (!ok) {
      toast.error(
        status === "concern"
          ? "Add a short note before flagging the report."
          : "Could not save the review.",
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
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-card text-card-foreground shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold">
              {formatDateLabel(report.reportDate)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {formatWeekdayShort(report.reportDate)}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {report.branchName} · filed by {report.submittedByName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report.status === "voided" ? (
              <Badge variant="destructive">Voided</Badge>
            ) : null}
            <Badge variant={REVIEW_BADGE[report.reviewStatus]}>
              {reviewLabel(report.reviewStatus)}
            </Badge>
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

        <div className="space-y-5 px-5 py-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Total Sale
            </p>
            <p className="tnum font-display text-3xl font-semibold tracking-tight">
              {formatINR(totalPaise)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cash + Online + Finance + Debt + Exchange + Cheque + Store use +
              Others
            </p>
          </div>

          {report.status === "voided" && report.voidReason ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Voided: {report.voidReason}
            </p>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Sections</h3>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {SECTION_META.map((section) => (
                <div
                  key={section.key}
                  className={cn(
                    "flex items-baseline justify-between gap-3 border-b border-dashed pb-1",
                    sections[section.key] === 0 && "text-muted-foreground",
                  )}
                >
                  <dt className="text-sm">{section.label}</dt>
                  <dd className="tnum text-sm">
                    {formatINR(sections[section.key])}
                  </dd>
                </div>
              ))}
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
                return (
                  <div key={meta.key}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="truncate">
                            {line.label || "—"}
                          </span>
                          <span className="tnum">
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
            <h3 className="text-sm font-semibold">Review</h3>
            {report.reviewStatus === "pending" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No admin has checked this report yet.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Marked <span className="text-foreground">
                  {reviewLabel(report.reviewStatus)}
                </span>
                {report.reviewedByName ? ` by ${report.reviewedByName}` : ""}
                {report.reviewedAt
                  ? ` on ${report.reviewedAt.slice(0, 10)}`
                  : ""}
                .
              </p>
            )}
            {report.reviewStatus === "concern" && report.reviewNote ? (
              <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {report.reviewNote}
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
                    Tick OK
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
      </div>
    </div>
  );
}
