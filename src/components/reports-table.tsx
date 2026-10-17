"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportDetail } from "@/components/report-detail";
import { formatDateLabel, formatINR, formatINRWhole, formatWeekdayShort } from "@/lib/format";
import { SECTION_META, reviewLabel } from "@/lib/report";
import type { ReportSummary, SectionKey } from "@/lib/report";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const SECTION_FILL: Record<SectionKey, string> = {
  cash: "bg-primary",
  online: "bg-teal-500",
  finance: "bg-amber-500",
  debt: "bg-rose-500",
  exchange: "bg-sky-500",
  cheque: "bg-violet-500",
  store_use: "bg-orange-400",
  others: "bg-slate-400",
};

const REVIEW_BADGE: Record<
  ReportSummary["report"]["reviewStatus"],
  "default" | "secondary" | "destructive"
> = {
  pending: "default",
  ok: "secondary",
  concern: "destructive",
};

export function ReportsTable({
  summaries,
  title = "Recent reports",
  showBranch = false,
  canReview = false,
  canVoid = false,
  emptyHint = "No reports filed yet.",
  limit = 10,
  detailed = false,
  contextSummaries,
}: {
  summaries: ReportSummary[];
  title?: string;
  showBranch?: boolean;
  canReview?: boolean;
  canVoid?: boolean;
  emptyHint?: string;
  limit?: number;
  /** Admin review rows: show the section mix and the review trail inline. */
  detailed?: boolean;
  /** Branch history used by the detail sheet to compare a day with its usual. */
  contextSummaries?: ReportSummary[];
}) {
  const { voidReport, setReportReview } = useAppStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [flagFirst, setFlagFirst] = useState(false);
  const [voidingFor, setVoidingFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [visible, setVisible] = useState(limit);
  const [saving, setSaving] = useState(false);

  const openSummary =
    summaries.find((summary) => summary.report.id === openId) ?? null;

  async function confirmVoid(reportId: string) {
    if (reason.trim().length < 3) {
      toast.error("Give a short reason for voiding this report.");
      return;
    }
    setSaving(true);
    const result = await voidReport(reportId, reason.trim());
    setSaving(false);
    if (result.ok) {
      toast.success("Report voided.");
      setVoidingFor(null);
      setReason("");
    } else {
      toast.error(result.error ?? "Could not void the report.");
    }
  }

  async function tickOk(summary: ReportSummary) {
    const result = await setReportReview(summary.report.id, "ok", "");
    if (result.ok) {
      toast.success(`Ticked OK for ${formatDateLabel(summary.report.reportDate)}.`);
    } else {
      toast.error(result.error ?? "Could not save the review.");
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {summaries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {emptyHint}
            </p>
          ) : (
            <div className="divide-y">
              {summaries.slice(0, visible).map((summary) => {
                const { report, totalPaise, financeCount, sections } = summary;
                const reviewed = report.reviewStatus !== "pending";
                const composition = SECTION_META.map((meta) => ({
                  ...meta,
                  amount: sections[meta.key],
                })).filter((section) => section.amount > 0);
                return (
                  <div key={report.id} className="py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFlagFirst(false);
                          setOpenId(report.id);
                        }}
                        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {formatDateLabel(report.reportDate)}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              {formatWeekdayShort(report.reportDate)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {showBranch ? `${report.branchName} · ` : ""}
                            {report.submittedByName}
                            {financeCount > 0 ? ` · ${financeCount} finance` : ""}
                            {!detailed && reviewed && report.reviewNote
                              ? ` · ${report.reviewNote}`
                              : ""}
                          </span>
                        </span>
                        <span className="tnum text-sm font-semibold">
                          {formatINR(totalPaise)}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {report.status === "voided" ? (
                          <Badge variant="destructive">Voided</Badge>
                        ) : (
                          <>
                            <Badge variant={REVIEW_BADGE[report.reviewStatus]}>
                              {reviewLabel(report.reviewStatus)}
                            </Badge>
                            {canReview ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Tick ${report.reportDate} as OK`}
                                  title="Tick OK"
                                  disabled={report.reviewStatus === "ok"}
                                  onClick={() => void tickOk(summary)}
                                >
                                  <Check className="size-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Flag a concern on ${report.reportDate}`}
                                  title="Flag concern"
                                  onClick={() => {
                                    setFlagFirst(true);
                                    setOpenId(report.id);
                                  }}
                                >
                                  <Flag className="size-4" />
                                </Button>
                              </>
                            ) : null}
                          </>
                        )}
                        {canVoid && report.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setVoidingFor(
                                voidingFor === report.id ? null : report.id,
                              );
                              setReason("");
                            }}
                          >
                            Void
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {detailed ? (
                      <div className="mt-2 space-y-2 pl-1">
                        <div
                          className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted"
                          role="img"
                          aria-label="Section mix"
                        >
                          {composition.map((section) => (
                            <span
                              key={section.key}
                              className={cn(SECTION_FILL[section.key], "h-full")}
                              style={{
                                width: `${(section.amount / Math.max(totalPaise, 1)) * 100}%`,
                              }}
                              title={`${section.label}: ${formatINRWhole(section.amount)}`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {composition.slice(0, 3).map((section) => (
                            <span
                              key={section.key}
                              className="inline-flex items-center gap-1"
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  SECTION_FILL[section.key],
                                )}
                              />
                              {section.label}{" "}
                              <span className="tnum text-foreground">
                                {formatINRWhole(section.amount)}
                              </span>
                            </span>
                          ))}
                          {composition.length > 3 ? (
                            <span>+{composition.length - 3} more</span>
                          ) : null}
                          <span className="text-muted-foreground/60">|</span>
                          <span>
                            {report.lines.length} line item
                            {report.lines.length === 1 ? "" : "s"}
                          </span>
                          <span className="text-muted-foreground/60">|</span>
                          <span
                            className={cn(
                              report.reviewStatus === "concern" &&
                                "text-destructive",
                              report.reviewStatus === "ok" && "text-primary",
                            )}
                          >
                            {reviewed
                              ? `${reviewLabel(report.reviewStatus)}${
                                  report.reviewedByName
                                    ? ` by ${report.reviewedByName}`
                                    : ""
                                }`
                              : "No admin check yet"}
                          </span>
                          {report.reviewStatus === "concern" &&
                          report.reviewNote ? (
                            <span className="w-full truncate text-destructive">
                              “{report.reviewNote}”
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {voidingFor === report.id ? (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border bg-muted/40 p-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label htmlFor={`void-${report.id}`}>
                            Reason for voiding
                          </Label>
                          <Input
                            id={`void-${report.id}`}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="e.g. keyed cash twice"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={saving}
                          onClick={() => void confirmVoid(report.id)}
                        >
                          Void report
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {summaries.length > visible ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => setVisible((current) => current + 20)}
            >
              Show {Math.min(20, summaries.length - visible)} more of{" "}
              {summaries.length}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {openSummary ? (
        <ReportDetail
          summary={openSummary}
          context={contextSummaries}
          initialFlag={flagFirst}
          onClose={() => {
            setOpenId(null);
            setFlagFirst(false);
          }}
        />
      ) : null}
    </>
  );
}
