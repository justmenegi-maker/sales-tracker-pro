"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { StatTile } from "@/components/ui/stat-tile";
import { formatDateLabel, formatINR, formatINRWhole, todayISO } from "@/lib/format";
import {
  advanceHeldPaise,
  advanceRefundedPaise,
  deriveAdvanceStatus,
  summarizeAdvances,
} from "@/lib/report";
import type { Advance, AdvanceStatus } from "@/lib/report";
import { useAppStore } from "@/lib/store";

const STATUS_LABEL: Record<AdvanceStatus, string> = {
  open: "Held",
  applied: "In sale",
  refunded: "Refunded",
};

type RowAction = { id: string; kind: "apply" | "refund" };

/**
 * Record money a customer pays before the item is handed over.
 *
 * Sits directly below the Finance section of the daily report form, the same
 * way the offline-sale form sits under Others: the advance belongs with the
 * rest of the day's money, but it stays in its own ledger. The received date
 * can be a past date, so an old advance can be entered later.
 */
export function AdvanceForm({ branchId }: { branchId?: string | null }) {
  const { branches, session, addAdvance } = useAppStore();

  const [customerName, setCustomerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [advanceDate, setAdvanceDate] = useState(todayISO());
  const [pickedBranchId, setPickedBranchId] = useState("");
  const [saving, setSaving] = useState(false);

  const fixedBranchId = branchId ?? session?.branchId ?? null;
  const addBranchId = fixedBranchId || pickedBranchId || branches[0]?.id || "";

  async function submitAdvance() {
    if (!addBranchId) {
      toast.error("No branch available.");
      return;
    }
    setSaving(true);
    const result = await addAdvance({
      branchId: addBranchId,
      customerName,
      itemName,
      amountPaise,
      advanceDate,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not add the advance.");
      return;
    }
    toast.success(`Advance of ${formatINR(amountPaise)} added.`);
    setCustomerName("");
    setItemName("");
    setAmountPaise(0);
    setAdvanceDate(todayISO());
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Advance</CardTitle>
        <p className="text-xs text-muted-foreground">
          Money a customer pays before delivery. Use the received date even if
          you are entering an old advance now — that is the day the cash came
          in. It stays in the advance ledger and is not added to Total Sale.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.9fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="advance-customer">Customer</Label>
          <Input
            id="advance-customer"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Imran"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="advance-item">Item / appliance</Label>
          <Input
            id="advance-item"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Ceiling fan"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="advance-amount">Advance</Label>
          <MoneyInput
            id="advance-amount"
            value={amountPaise}
            onValueChange={setAmountPaise}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="advance-date">Received on</Label>
          <Input
            id="advance-date"
            type="date"
            value={advanceDate}
            onChange={(event) => setAdvanceDate(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={saving}
            onClick={() => void submitAdvance()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {!fixedBranchId && branches.length > 1 ? (
          <div className="space-y-1 sm:col-span-2 lg:col-span-5">
            <Label htmlFor="advance-branch">Branch</Label>
            <select
              id="advance-branch"
              value={addBranchId}
              onChange={(event) => setPickedBranchId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The advance ledger: money a customer pays before the item is handed over.
 *
 * Kept separate from a report's Total Sale: the cash arrived on the advance
 * date, so counting it again on the day of the full sale would double it. The
 * "Add to sale" action records the later date the advance was folded into a
 * filed sale, which is what reconciles the two days.
 */
export function AdvanceLedger({
  branchId,
  showAddForm = false,
}: {
  branchId?: string | null;
  /** Admin keeps the entry form here; the dashboard form lives under Finance. */
  showAddForm?: boolean;
}) {
  const { advances, branches, applyAdvance, refundAdvance } = useAppStore();

  const [action, setAction] = useState<RowAction | null>(null);
  const [actionAmount, setActionAmount] = useState(0);
  const [actionDate, setActionDate] = useState(todayISO());
  const [actionNote, setActionNote] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = useMemo(
    () =>
      advances
        .filter((advance) => (branchId ? advance.branchId === branchId : true))
        .sort((a, b) => (a.advanceDate < b.advanceDate ? 1 : -1)),
    [advances, branchId],
  );

  const summary = useMemo(() => summarizeAdvances(visible), [visible]);

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? "Branch";

  function openAction(advance: Advance, kind: RowAction["kind"]) {
    if (action?.id === advance.id && action.kind === kind) {
      setAction(null);
      return;
    }
    setAction({ id: advance.id, kind });
    setActionAmount(kind === "refund" ? advanceHeldPaise(advance) : 0);
    setActionDate(todayISO());
    setActionNote("");
  }

  async function submitApply(advance: Advance) {
    setSaving(true);
    const result = await applyAdvance(advance.id, actionDate);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not add the advance to a sale.");
      return;
    }
    // The advance is now part of that day's Total Sale, so say what was added
    // and where it landed rather than leaving it to the ledger to explain.
    toast.success(
      `${formatINR(advanceHeldPaise(advance))} advance from ${advance.customerName} added to ${formatDateLabel(actionDate)}'s sale.`,
    );
    setAction(null);
  }

  async function submitRefund(advance: Advance) {
    setSaving(true);
    const result = await refundAdvance({
      advanceId: advance.id,
      amountPaise: actionAmount,
      refundedOn: actionDate,
      note: actionNote,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not refund the advance.");
      return;
    }
    toast.success(`Refund of ${formatINR(actionAmount)} recorded.`);
    setAction(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Advance held"
          value={formatINRWhole(summary.heldPaise)}
          hint={`${summary.openCount} customer${summary.openCount === 1 ? "" : "s"} yet to take delivery`}
          tone={summary.heldPaise > 0 ? "accent" : "default"}
        />
        <StatTile
          label="Added to a sale"
          value={formatINRWhole(summary.appliedPaise)}
          hint={`${summary.appliedCount} advance${summary.appliedCount === 1 ? "" : "s"} counted on their sale day`}
        />
        <StatTile
          label="Refunded"
          value={formatINRWhole(summary.refundedPaise)}
          hint={`${summary.refundedCount} advance${summary.refundedCount === 1 ? "" : "s"} returned`}
          tone={summary.refundedPaise > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Advance ledger</CardTitle>
          <p className="text-xs text-muted-foreground">
            Advance money is counted once, on the day you add it to a sale. Add
            it here and that day&apos;s Total Sale includes it, alongside any
            balance the customer paid.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No advances recorded yet. Money taken before delivery is entered
              below the Finance section of the daily report.
            </p>
          ) : (
            visible.slice(0, 20).map((advance) => {
              const status = deriveAdvanceStatus(advance);
              const refunded = advanceRefundedPaise(advance);
              return (
                <div
                  key={advance.id}
                  className="rounded-md border bg-background/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {advance.customerName}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {advance.itemName}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {branchName(advance.branchId)} ·{" "}
                        {formatDateLabel(advance.advanceDate)}
                        {advance.appliedOn
                          ? ` · sale on ${formatDateLabel(advance.appliedOn)}`
                          : ""}
                        {refunded > 0
                          ? ` · ${formatINR(refunded)} refunded`
                          : ""}
                      </p>
                    </div>
                    <div className="tnum text-right text-sm">
                      <p className="font-medium">
                        {formatINR(advance.amountPaise)}
                      </p>
                      {status === "open" && refunded > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {formatINR(advanceHeldPaise(advance))} held
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        status === "open"
                          ? "outline"
                          : status === "applied"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {STATUS_LABEL[status]}
                    </Badge>

                    {status === "open" ? (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAction(advance, "apply")}
                        >
                          <ArrowRightLeft className="size-4" />
                          Add to sale
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAction(advance, "refund")}
                        >
                          <RotateCcw className="size-4" />
                          Refund
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {action?.id === advance.id ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                      {action.kind === "apply" ? (
                        <>
                          <div className="flex-1 space-y-1">
                            <Label htmlFor={`apply-date-${advance.id}`}>
                              Sale date this advance belongs to
                            </Label>
                            <Input
                              id={`apply-date-${advance.id}`}
                              type="date"
                              value={actionDate}
                              onChange={(event) =>
                                setActionDate(event.target.value)
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => void submitApply(advance)}
                          >
                            <CheckCircle2 className="size-4" />
                            Add {formatINR(advance.amountPaise)} to this day
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="w-36 space-y-1">
                            <Label htmlFor={`refund-amount-${advance.id}`}>
                              Refund amount
                            </Label>
                            <MoneyInput
                              id={`refund-amount-${advance.id}`}
                              value={actionAmount}
                              onValueChange={setActionAmount}
                            />
                          </div>
                          <div className="w-40 space-y-1">
                            <Label htmlFor={`refund-date-${advance.id}`}>
                              Refund date
                            </Label>
                            <Input
                              id={`refund-date-${advance.id}`}
                              type="date"
                              value={actionDate}
                              onChange={(event) =>
                                setActionDate(event.target.value)
                              }
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <Label htmlFor={`refund-note-${advance.id}`}>
                              Reason (optional)
                            </Label>
                            <Input
                              id={`refund-note-${advance.id}`}
                              value={actionNote}
                              onChange={(event) =>
                                setActionNote(event.target.value)
                              }
                              placeholder="Customer cancelled the order"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={saving}
                            onClick={() => void submitRefund(advance)}
                          >
                            Refund {formatINR(actionAmount)}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {showAddForm ? <AdvanceForm branchId={branchId} /> : null}
    </div>
  );
}
