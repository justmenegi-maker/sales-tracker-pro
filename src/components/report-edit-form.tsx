"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { formatINR } from "@/lib/format";
import { computeTotalSale } from "@/lib/totals";
import { LINE_CATEGORY_META, makeId } from "@/lib/report";
import type { LineCategory, ReportSummary } from "@/lib/report";
import { useAppStore } from "@/lib/store";

type DraftLine = {
  key: string;
  category: LineCategory;
  label: string;
  amountPaise: number;
};

function toDrafts(summary: ReportSummary): DraftLine[] {
  return summary.report.lines.map((line) => ({
    key: line.id,
    category: line.category,
    label: line.label,
    amountPaise: line.amountPaise,
  }));
}

/**
 * Admin correction of a filed report.
 *
 * Branch staff cannot reach this: a filed report is locked for them, which is
 * why a wrong amount used to mean voiding the whole day. The editor rebuilds
 * the cash, online, row and note values and stamps who corrected it and when.
 */
export function ReportEditForm({
  summary,
  onCancel,
}: {
  summary: ReportSummary;
  onCancel: () => void;
}) {
  const { updateReport } = useAppStore();
  const { report } = summary;

  const [reportDate, setReportDate] = useState(report.reportDate);
  const [cashPaise, setCashPaise] = useState(report.cashPaise);
  const [onlinePaise, setOnlinePaise] = useState(report.onlinePaise);
  const [note, setNote] = useState(report.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => toDrafts(summary));
  const [saving, setSaving] = useState(false);

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

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save() {
    setSaving(true);
    const result = await updateReport(report.id, {
      reportDate,
      cashPaise,
      onlinePaise,
      note: note.trim() ? note.trim() : null,
      lines: lines.map((line) => ({
        category: line.category,
        label: line.label,
        amountPaise: line.amountPaise,
      })),
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not save the correction.");
      return;
    }
    toast.success("Report corrected. The change is stamped with your name.");
    onCancel();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
        Correcting a filed report. Entered by {report.submittedByName} on {report.reportDate}. Your
        name and the time are saved with the change.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="edit-date">Report date</Label>
          <Input
            id="edit-date"
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-cash">Cash</Label>
          <MoneyInput id="edit-cash" value={cashPaise} onValueChange={setCashPaise} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-online">Online / UPI</Label>
          <MoneyInput id="edit-online" value={onlinePaise} onValueChange={setOnlinePaise} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="edit-note">Description / note</Label>
        <textarea
          id="edit-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Anything worth remembering about this day"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        />
      </div>

      <div className="space-y-3">
        {LINE_CATEGORY_META.map((meta) => {
          const categoryLines = lines.filter((line) => line.category === meta.key);
          return (
            <div key={meta.key} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{meta.label}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        key: makeId("draft"),
                        category: meta.key,
                        label: "",
                        amountPaise: 0,
                      },
                    ])
                  }
                >
                  <Plus className="size-4" />
                  Add row
                </Button>
              </div>

              {categoryLines.length === 0 ? (
                <p className="text-muted-foreground text-xs">No rows.</p>
              ) : (
                <div className="space-y-2">
                  {categoryLines.map((line) => (
                    <div key={line.key} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          aria-label={`${meta.label} description`}
                          value={line.label}
                          onChange={(event) => updateLine(line.key, { label: event.target.value })}
                          placeholder="Description"
                        />
                      </div>
                      <div className="w-32">
                        <MoneyInput
                          aria-label={`${meta.label} amount`}
                          value={line.amountPaise}
                          onValueChange={(paise) => updateLine(line.key, { amountPaise: paise })}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove row"
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.key !== line.key))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2">
        <span className="text-muted-foreground text-sm">New Total Sale</span>
        <span className="tnum font-display text-lg font-semibold">{formatINR(total)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save correction"}
        </Button>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
