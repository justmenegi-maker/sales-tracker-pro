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
import { formatDateLabel, formatINR, formatWeekdayShort } from "@/lib/format";
import { reviewLabel } from "@/lib/report";
import type { ReportSummary } from "@/lib/report";
import { useAppStore } from "@/lib/store";

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
}: {
  summaries: ReportSummary[];
  title?: string;
  showBranch?: boolean;
  canReview?: boolean;
  canVoid?: boolean;
  emptyHint?: string;
  limit?: number;
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
    const ok = await voidReport(reportId, reason.trim());
    setSaving(false);
    if (ok) {
      toast.success("Report voided.");
      setVoidingFor(null);
      setReason("");
    } else {
      toast.error("Could not void the report.");
    }
  }

  async function tickOk(summary: ReportSummary) {
    const ok = await setReportReview(summary.report.id, "ok", "");
    if (ok) {
      toast.success(`Ticked OK for ${formatDateLabel(summary.report.reportDate)}.`);
    } else {
      toast.error("Could not save the review.");
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
                const { report, totalPaise, financeCount } = summary;
                const reviewed = report.reviewStatus !== "pending";
                return (
                  <div key={report.id} className="py-3">
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
                            {reviewed && report.reviewNote
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
