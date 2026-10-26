"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { formatINR, formatINRSigned } from "@/lib/format";
import { computeTotalSale } from "@/lib/totals";
import {
  LINE_CATEGORY_META,
  makeId,
  planReportDebtSync,
  reportDebtRows,
} from "@/lib/report";
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
  const { updateReport, debts, reports } = useAppStore();
  const { report } = summary;

  const [reportDate, setReportDate] = useState(report.reportDate);
  const [cashPaise, setCashPaise] = useState(report.cashPaise);
  const [onlinePaise, setOnlinePaise] = useState(report.onlinePaise);
  const [note, setNote] = useState(report.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => toDrafts(summary));
  const [saving, setSaving] = useState(false);
  const [confirmedRemovalKey, setConfirmedRemovalKey] = useState<string | null>(
    null,
  );

  // Preview of the ledger work this correction will do, computed with the same
  // planner the save uses: a debt row turned into an expense must stop being a
  // debt, and an admin should see that before saving.
  const debtPlan = useMemo(
    () =>
      planReportDebtSync({
        branchId: report.branchId,
        previousDate: report.reportDate,
        previousDebtLines: reportDebtRows(report.lines),
        otherDebtReportsOnDate: reports.filter(
          (entry) =>
            entry.id !== report.id &&
            entry.status === "active" &&
            entry.branchId === report.branchId &&
            entry.reportDate === report.reportDate &&
            entry.lines.some((line) => line.category === "debt"),
        ).length,
        nextDate: reportDate,
        debtLines: reportDebtRows(lines),
        ledger: debts,
      }),
    [debts, lines, report, reportDate, reports],
  );
  const paidRemovals = debtPlan.voids.filter((entry) => entry.paymentCount > 0);
  const paidRemovalKey = paidRemovals
    .map((entry) => `${entry.id}:${entry.amountPaise}`)
    .join("|");
  // A tick belongs to the removals it was shown for. Editing the report into a
  // different set of paid removals must ask again instead of carrying the tick.
  const removalConfirmed =
    paidRemovalKey !== "" && confirmedRemovalKey === paidRemovalKey;
  const needsRemovalConfirmation = paidRemovals.length > 0 && !removalConfirmed;

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
    for (const line of lines) {
      // Expenses are money out and stay outside Total Sale.
      if (line.category === "expense") continue;
      base[line.category] += line.amountPaise;
    }
    return base;
  }, [cashPaise, lines, onlinePaise]);

  const expenseTotal = useMemo(
    () =>
      lines
        .filter((line) => line.category === "expense")
        .reduce((sum, line) => sum + line.amountPaise, 0),
    [lines],
  );

  const total = computeTotalSale(sections);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save() {
    setSaving(true);
    const result = await updateReport(
      report.id,
      {
        reportDate,
        cashPaise,
        onlinePaise,
        note: note.trim() ? note.trim() : null,
        lines: lines.map((line) => ({
          category: line.category,
          label: line.label,
          amountPaise: line.amountPaise,
        })),
      },
      { confirmDebtRemoval: removalConfirmed },
    );
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not save the correction.");
      return;
    }

    const sync = result.debtSync;
    const changed = sync ? sync.updated + sync.created + sync.voided : 0;
    if (sync && changed > 0) {
      const parts: string[] = [];
      if (sync.updated > 0) parts.push(`${sync.updated} updated`);
      if (sync.created > 0) parts.push(`${sync.created} added`);
      if (sync.voided > 0) parts.push(`${sync.voided} voided`);
      toast.success(`Report corrected. Debt ledger synced: ${parts.join(", ")}.`);
    } else {
      toast.success("Report corrected. The change is stamped with your name.");
    }
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

      {debtPlan.voids.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">
            This correction voids {debtPlan.voids.length} debt{" "}
            {debtPlan.voids.length === 1 ? "entry" : "entries"} in the ledger
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {debtPlan.voids.map((entry) => (
              <li key={entry.id}>
                {entry.productName} — {formatINR(entry.amountPaise)}
                {entry.paymentCount > 0
                  ? ` (${formatINR(entry.paidPaise)} already collected)`
                  : null}
              </li>
            ))}
          </ul>
          {paidRemovals.length > 0 ? (
            <label className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                checked={removalConfirmed}
                onChange={(event) =>
                  setConfirmedRemovalKey(
                    event.target.checked ? paidRemovalKey : null,
                  )
                }
                className="mt-0.5"
              />
              <span>
                I understand the payments already recorded on these debts stay in the
                audit trail but stop counting in the ledger.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="bg-muted/50 space-y-1.5 rounded-md px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">New Total Sale</span>
          <span className="tnum font-display text-lg font-semibold">
            {formatINR(total)}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Expense (not in total)</span>
          <span className="tnum text-rose-600">−{formatINR(expenseTotal)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium">Net in hand</span>
          <span className="tnum font-medium">
            {formatINRSigned(total - expenseTotal)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={saving || needsRemovalConfirmation} onClick={() => void save()}>
          {saving ? "Saving…" : "Save correction"}
        </Button>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
