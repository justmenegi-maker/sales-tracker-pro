"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { formatINR, formatDateLabel, todayISO } from "@/lib/format";
import {
  LINE_CATEGORY_META,
  SECTION_META,
  makeId,
  reportTotalPaise,
  reportsForDate,
} from "@/lib/report";
import type { DailyReport, LineCategory, SaveReportInput } from "@/lib/report";
import { computeTotalSale } from "@/lib/totals";
import { useAppStore } from "@/lib/store";

type LineDraft = {
  key: string;
  category: LineCategory;
  label: string;
  amountPaise: number;
};

function emptyDraft(category: LineCategory): LineDraft {
  return { key: makeId("draft"), category, label: "", amountPaise: 0 };
}

function initialLines(): LineDraft[] {
  return LINE_CATEGORY_META.map((meta) => emptyDraft(meta.key));
}

export function ReportForm() {
  const { session, branches, reports, saveReport, error: storeError } = useAppStore();
  const [reportDate, setReportDate] = useState(todayISO());
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const branchId = selectedBranchId ?? (session?.branchId || branches[0]?.id || "");
  const [cashPaise, setCashPaise] = useState(0);
  const [onlinePaise, setOnlinePaise] = useState(0);
  const [lines, setLines] = useState<LineDraft[]>(initialLines);
  const [saving, setSaving] = useState(false);

  const isBranchUser = session?.role === "branch" && Boolean(session?.branchId);

  const sections = useMemo(() => {
    const base = {
      cash: cashPaise,
      online: onlinePaise,
      finance: 0,
      debt: 0,
      exchange: 0,
      cheque: 0,
      store_use: 0,
      others: 0,
    };
    for (const line of lines) base[line.category] += line.amountPaise;
    return base;
  }, [cashPaise, lines, onlinePaise]);

  const total = computeTotalSale(sections);

  const alreadyFiled: DailyReport[] = useMemo(
    () => (branchId ? reportsForDate(reports, branchId, reportDate) : []),
    [branchId, reportDate, reports],
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function addLine(category: LineCategory) {
    setLines((current) => [...current, emptyDraft(category)]);
  }

  function reset() {
    setCashPaise(0);
    setOnlinePaise(0);
    setLines(initialLines());
  }

  async function submit() {
    if (!branchId) {
      toast.error("Pick a branch first.");
      return;
    }
    if (!reportDate) {
      toast.error("Pick the report date.");
      return;
    }
    if (total <= 0) {
      toast.error("Add at least one amount before submitting.");
      return;
    }

    const payload: SaveReportInput = {
      branchId,
      reportDate,
      cashPaise,
      onlinePaise,
      lines: lines
        .filter((line) => line.amountPaise > 0 || line.label.trim().length > 0)
        .filter((line) => line.amountPaise > 0)
        .map((line) => ({
          category: line.category,
          label: line.label.trim() || LINE_CATEGORY_META.find((m) => m.key === line.category)!.label,
          amountPaise: line.amountPaise,
        })),
    };

    setSaving(true);
    const ok = await saveReport(payload);
    setSaving(false);

    if (ok) {
      toast.success(
        `Report filed for ${formatDateLabel(reportDate)} — ${formatINR(total)}`,
      );
      reset();
    } else {
      toast.error(storeError || "Could not file the report. Check the amounts and try again.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Report details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
            <div className="space-y-1">
              <Label htmlFor="report-date">Report date</Label>
              <Input
                id="report-date"
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-branch">Branch</Label>
              {isBranchUser ? (
                <Input
                  id="report-branch"
                  readOnly
                  value={
                    branches.find((branch) => branch.id === branchId)?.name ??
                    "Your branch"
                  }
                  className="bg-muted/60"
                />
              ) : (
                <select
                  id="report-branch"
                  value={branchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Cash &amp; online</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
            <div className="space-y-1">
              <Label htmlFor="cash">Cash collected</Label>
              <MoneyInput
                id="cash"
                value={cashPaise}
                onValueChange={setCashPaise}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="online">Online / UPI</Label>
              <MoneyInput
                id="online"
                value={onlinePaise}
                onValueChange={setOnlinePaise}
              />
            </div>
          </CardContent>
        </Card>

        {LINE_CATEGORY_META.map((meta) => {
          const categoryLines = lines.filter(
            (line) => line.category === meta.key,
          );
          const categoryTotal = categoryLines.reduce(
            (sum, line) => sum + line.amountPaise,
            0,
          );
          return (
            <Card key={meta.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-lg">{meta.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{meta.hint}</p>
                </div>
                <span className="tnum text-sm font-medium">
                  {formatINR(categoryTotal)}
                </span>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
                {categoryLines.map((line) => (
                  <div
                    key={line.key}
                    className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label
                        htmlFor={`label-${line.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        {meta.key === "finance"
                          ? "Lender"
                          : meta.key === "debt"
                            ? "Product"
                            : "Description"}
                      </Label>
                      <Input
                        id={`label-${line.key}`}
                        value={line.label}
                        onChange={(event) =>
                          updateLine(line.key, { label: event.target.value })
                        }
                        placeholder={
                          meta.key === "debt" ? "Ceiling fan" : "Reference"
                        }
                      />
                    </div>
                    <div className="w-36 space-y-1">
                      <Label
                        htmlFor={`amount-${line.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        Amount
                      </Label>
                      <MoneyInput
                        id={`amount-${line.key}`}
                        value={line.amountPaise}
                        onValueChange={(paise) =>
                          updateLine(line.key, { amountPaise: paise })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${meta.label} row`}
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addLine(meta.key)}
                >
                  <Plus className="size-4" />
                  Add {meta.label.replace(" rows", "").toLowerCase()} row
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Total Sale</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cash + Online + Finance + Debt + Exchange + Cheque + Store use +
              Others
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="tnum font-display text-3xl font-semibold tracking-tight">
              {formatINR(total)}
            </p>
            <dl className="space-y-1.5 text-sm">
              {SECTION_META.map((section) => (
                <div
                  key={section.key}
                  className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1.5 last:border-0"
                >
                  <dt className="text-muted-foreground">{section.label}</dt>
                  <dd className="tnum">{formatINR(sections[section.key])}</dd>
                </div>
              ))}
            </dl>
            <Button
              className="w-full"
              size="lg"
              disabled={saving || total <= 0}
              onClick={() => void submit()}
            >
              {saving ? "Filing…" : `File report for ${formatDateLabel(reportDate)}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Submitted reports are locked: branch staff cannot edit them after
              filing. An admin can void a report if something was entered wrong.
            </p>
          </CardContent>
        </Card>

        {alreadyFiled.length > 0 ? (
          <Card className="border-accent-foreground/25 bg-accent/40">
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">
                {alreadyFiled.length} report
                {alreadyFiled.length > 1 ? "s" : ""} already filed for this day
              </p>
              {alreadyFiled.map((report) => (
                <p key={report.id} className="text-muted-foreground">
                  {report.branchName} · {formatINR(reportTotalPaise(report))} by{" "}
                  {report.submittedByName}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                Filing again adds a separate entry for the same day.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
