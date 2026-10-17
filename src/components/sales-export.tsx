"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  Download,
  FileChartColumn,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDays,
  formatDateLabel,
  formatINRWhole,
  todayISO,
} from "@/lib/format";
import { buildRangeSales, startOfMonth } from "@/lib/sales-analytics";
import type { ReportSummary } from "@/lib/report";
import { cn } from "@/lib/utils";

type Preset = "weekly" | "monthly" | "custom";

const PRESETS: Array<{ key: Preset; label: string; hint: string }> = [
  { key: "weekly", label: "Weekly", hint: "Last 7 days" },
  { key: "monthly", label: "Monthly", hint: "This month" },
  { key: "custom", label: "Custom", hint: "Pick any range" },
];

/** Most reports a single export may cover, so a typo cannot stall the tab. */
const MAX_RANGE_DAYS = 366;

function presetRange(preset: Preset, today: string): { start: string; end: string } {
  if (preset === "monthly") {
    // The current month to date; a full past month is still reachable through
    // custom dates, which keeps "Monthly" showing actual sales, not zeros.
    return { start: startOfMonth(today), end: today };
  }
  return { start: addDays(today, -6), end: today };
}

function dayCount(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return (
    Math.round(
      (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000,
    ) + 1
  );
}

export function SalesExportCard({
  summaries,
  scopeLabel,
}: {
  /** Branch-scoped reports, all dates (not just the dashboard range). */
  summaries: ReportSummary[];
  scopeLabel: string;
}) {
  const today = todayISO();
  const [preset, setPreset] = useState<Preset>("monthly");
  const [customStart, setCustomStart] = useState(addDays(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [busy, setBusy] = useState(false);

  const { start, end } =
    preset === "custom"
      ? { start: customStart, end: customEnd }
      : presetRange(preset, today);

  const range = useMemo(
    () => buildRangeSales(summaries, start, end),
    [summaries, start, end],
  );

  const invalid =
    !start || !end || start > end || dayCount(start, end) > MAX_RANGE_DAYS;

  async function handleDownload() {
    if (!start || !end) {
      toast.error("Pick both dates for the custom range.");
      return;
    }
    if (start > end) {
      toast.error("The start date must be before the end date.");
      return;
    }
    if (dayCount(start, end) > MAX_RANGE_DAYS) {
      toast.error(`Pick a range of ${MAX_RANGE_DAYS} days or fewer.`);
      return;
    }
    if (range.reportCount === 0) {
      toast.error("No reports were filed in this range yet.");
      return;
    }

    setBusy(true);
    try {
      const { downloadSalesPdf } = await import("@/lib/sales-pdf");
      const filename = await downloadSalesPdf({
        range,
        scopeLabel,
      });
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("Could not build the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.03]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileChartColumn className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Export sales report
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A clean PDF with the daily graph, six-month trend, best and
                lowest sale day, ledger and review status.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-background p-1">
              {PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={item.hint}
                  aria-pressed={preset === item.key}
                  onClick={() => setPreset(item.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    preset === item.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Button
              onClick={() => void handleDownload()}
              disabled={busy || invalid}
              className="gap-2"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {busy ? "Building PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>

        {preset === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <div className="space-y-1">
              <Label htmlFor="export-start" className="text-xs">
                From
              </Label>
              <Input
                id="export-start"
                type="date"
                value={customStart}
                max={customEnd || today}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="export-end" className="text-xs">
                To
              </Label>
              <Input
                id="export-end"
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={today}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/80 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Total in range
            </p>
            <p className="tnum mt-1 font-display text-xl font-semibold">
              {formatINRWhole(range.totalPaise)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {range.reportCount} report{range.reportCount === 1 ? "" : "s"} ·{" "}
              {range.filedDays.length} day
              {range.filedDays.length === 1 ? "" : "s"} filed
            </p>
          </div>

          <div className="rounded-lg border bg-background/80 p-3">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <TrendingUp className="size-3 text-amber-600" />
              Best sale day
            </p>
            <p className="tnum mt-1 font-display text-xl font-semibold">
              {range.bestDay ? formatINRWhole(range.bestDay.totalPaise) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {range.bestDay
                ? formatDateLabel(range.bestDay.date)
                : "No reports in this range"}
            </p>
          </div>

          <div className="rounded-lg border bg-background/80 p-3">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <TrendingDown className="size-3 text-primary" />
              Lowest sale day
            </p>
            <p className="tnum mt-1 font-display text-xl font-semibold">
              {range.lowestDay ? formatINRWhole(range.lowestDay.totalPaise) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {range.lowestDay
                ? formatDateLabel(range.lowestDay.date)
                : "No reports in this range"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarRange className="size-3.5 shrink-0" />
            <span className="truncate">
              {formatDateLabel(start)} – {formatDateLabel(end)} · {scopeLabel}
              {range.voidedCount > 0
                ? ` · ${range.voidedCount} voided excluded`
                : ""}
            </span>
          </div>
          <span className="text-[11px]">
            Includes graph, best/lowest day and review status
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
