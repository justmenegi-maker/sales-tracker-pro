"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateLabel, formatINR, formatWeekdayShort } from "@/lib/format";
import { reportFinanceCount, reportTotalPaise } from "@/lib/report";
import type { DailyReport } from "@/lib/report";
import { useAppStore } from "@/lib/store";

export function ReportsTable({
  reports,
  title = "Recent reports",
  showBranch = false,
  canVoid = false,
  emptyHint = "No reports filed yet.",
  limit = 10,
}: {
  reports: DailyReport[];
  title?: string;
  showBranch?: boolean;
  canVoid?: boolean;
  emptyHint?: string;
  limit?: number;
}) {
  const { voidReport } = useAppStore();
  const [voidingFor, setVoidingFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {reports.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyHint}
          </p>
        ) : (
          <div className="divide-y">
            {reports.slice(0, limit).map((report) => {
              const total = reportTotalPaise(report);
              const financeCount = reportFinanceCount(report);
              return (
                <div key={report.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {formatDateLabel(report.reportDate)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {formatWeekdayShort(report.reportDate)}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {showBranch ? `${report.branchName} · ` : ""}
                        {report.submittedByName}
                        {financeCount > 0
                          ? ` · ${financeCount} finance`
                          : ""}
                      </p>
                    </div>
                    <span className="tnum ml-auto text-sm font-semibold">
                      {formatINR(total)}
                    </span>
                    {report.status === "voided" ? (
                      <Badge variant="destructive">Voided</Badge>
                    ) : canVoid ? (
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
                    ) : (
                      <Badge variant="secondary">Filed</Badge>
                    )}
                  </div>

                  {report.status === "voided" && report.voidReason ? (
                    <p className="mt-1 text-xs text-destructive">
                      Voided: {report.voidReason}
                    </p>
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
      </CardContent>
    </Card>
  );
}
