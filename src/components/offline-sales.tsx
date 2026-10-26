"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, Circle, Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { StatTile } from "@/components/ui/stat-tile";
import {
  formatDateLabel,
  formatINR,
  formatINRWhole,
  todayISO,
} from "@/lib/format";
import { summarizeOfflineSales } from "@/lib/report";
import type { OfflineSale } from "@/lib/report";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Add form for offline sales.
 *
 * Sits directly below the "Others" section of the daily report so branch staff
 * enter the reminder where they file the rest of the day. The price is a
 * reference only: the money already arrived as cash or online, so nothing here
 * feeds Total Sale.
 */
export function OfflineSaleForm({ branchId }: { branchId?: string | null }) {
  const { branches, addOfflineSale, session } = useAppStore();

  const [itemName, setItemName] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [saleDate, setSaleDate] = useState(todayISO());
  const [pickedBranchId, setPickedBranchId] = useState("");
  const [saving, setSaving] = useState(false);

  const fixedBranchId = branchId ?? session?.branchId ?? null;
  const addBranchId = fixedBranchId || pickedBranchId || branches[0]?.id || "";

  async function submit() {
    if (!addBranchId) {
      toast.error("No branch available.");
      return;
    }
    if (itemName.trim().length === 0) {
      toast.error("Add the item name.");
      return;
    }
    if (amountPaise <= 0) {
      toast.error("Add the item price.");
      return;
    }
    if (!saleDate) {
      toast.error("Pick the sale date.");
      return;
    }

    setSaving(true);
    const result = await addOfflineSale({
      branchId: addBranchId,
      itemName: itemName.trim(),
      amountPaise,
      saleDate,
    });
    setSaving(false);

    if (result.ok) {
      toast.success("Offline sale added to the reminder list.");
      setItemName("");
      setAmountPaise(0);
      setSaleDate(todayISO());
      return;
    }
    toast.error(result.error ?? "Could not add the offline sale.");
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Offline sale</CardTitle>
        <p className="text-xs text-muted-foreground">
          Reminder only — the price is already covered by the cash or online
          amount above, so it is not added to Total Sale.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0 lg:grid-cols-[1.6fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="offline-item">Item</Label>
          <Input
            id="offline-item"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Ceiling fan"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offline-price">Price</Label>
          <MoneyInput
            id="offline-price"
            value={amountPaise}
            onValueChange={setAmountPaise}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offline-date">Sale date</Label>
          <Input
            id="offline-date"
            type="date"
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={saving}
            onClick={() => void submit()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {!fixedBranchId && branches.length > 1 ? (
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="offline-branch">Branch</Label>
            <select
              id="offline-branch"
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
 * Reminder list for offline sales.
 *
 * The money for these items already reached the shop as cash or online, so the
 * prices here are reference only and never feed Total Sale. Each row carries a
 * tick: whoever checks the separate daily-sales system presses it once the item
 * is entered there, and the same tick undoes a mistaken press.
 *
 * `variant="admin"` is the compact review queue — no stat tiles, no add form,
 * just the reminders and their tick state.
 */
export function OfflineSaleReminders({
  branchId,
  variant = "dashboard",
}: {
  branchId?: string | null;
  variant?: "dashboard" | "admin";
}) {
  const { offlineSales, branches, setOfflineSaleAdded } = useAppStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      offlineSales
        .filter((sale) => (branchId ? sale.branchId === branchId : true))
        .sort((a, b) => {
          // Anything still missing from the other system comes first.
          if (a.addedToSystem !== b.addedToSystem) return a.addedToSystem ? 1 : -1;
          return a.saleDate < b.saleDate ? 1 : -1;
        }),
    [branchId, offlineSales],
  );

  const summary = useMemo(() => summarizeOfflineSales(visible), [visible]);

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? "Branch";

  async function toggleAdded(sale: OfflineSale) {
    setBusyId(sale.id);
    const result = await setOfflineSaleAdded(sale.id, !sale.addedToSystem);
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.error ?? "Could not update the reminder.");
      return;
    }
    toast.success(
      sale.addedToSystem
        ? `Moved ${sale.itemName} back to pending.`
        : `${sale.itemName} ticked as added to the system.`,
    );
  }

  const isAdmin = variant === "admin";

  return (
    <div className="space-y-4">
      {isAdmin ? null : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Not added yet"
            value={String(summary.pending)}
            hint={
              summary.pending > 0
                ? `${formatINRWhole(summary.pendingPaise)} to enter`
                : "All entered in the system"
            }
            tone={summary.pending > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Added to system"
            value={String(summary.added)}
            hint={`${formatINRWhole(summary.addedPaise)} entered`}
          />
          <StatTile
            label="Reminder list"
            value={String(visible.length)}
            hint="Prices only · never added to Total Sale"
          />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-lg">
              {isAdmin ? "Offline sale reminders" : "Offline sale reminder list"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Tick an item once it has been entered in the sales system. Prices are reference only — never part of Total Sale."
                : "Money is already received in cash or online. Tick an item once it is entered in the daily sales system — its price is not counted in Total Sale."}
            </p>
          </div>
          <Badge
            variant={summary.pending > 0 ? "destructive" : "secondary"}
            className="shrink-0"
          >
            {summary.pending} pending · {summary.added} added
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing pending. Offline sales added from the daily report form
              show up here as reminders.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.slice(0, isAdmin ? 50 : 15).map((sale) => (
                <li
                  key={sale.id}
                  className="flex items-start gap-3 rounded-md border bg-background/60 p-3"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={sale.addedToSystem}
                    aria-label={`${
                      sale.addedToSystem ? "Un-tick" : "Tick"
                    } ${sale.itemName} as added to the system`}
                    disabled={busyId === sale.id}
                    onClick={() => void toggleAdded(sale)}
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-50",
                      sale.addedToSystem
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 text-muted-foreground/50 hover:border-primary hover:text-primary",
                    )}
                  >
                    {sale.addedToSystem ? (
                      <Check className="size-4" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        sale.addedToSystem &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {sale.itemName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {branchName(sale.branchId)} ·{" "}
                      {formatDateLabel(sale.saleDate)}
                      {sale.addedToSystem && sale.addedByName
                        ? ` · ticked by ${sale.addedByName}`
                        : ""}
                    </p>
                  </div>

                  <p
                    className={cn(
                      "tnum shrink-0 text-right text-sm font-medium",
                      sale.addedToSystem && "text-muted-foreground",
                    )}
                  >
                    {formatINR(sale.amountPaise)}
                  </p>

                  {isAdmin ? null : (
                    <Button
                      size="sm"
                      variant={sale.addedToSystem ? "ghost" : "outline"}
                      disabled={busyId === sale.id}
                      aria-label={
                        sale.addedToSystem
                          ? `Undo ${sale.itemName}`
                          : `Mark ${sale.itemName} as added`
                      }
                      onClick={() => void toggleAdded(sale)}
                    >
                      {sale.addedToSystem ? (
                        <>
                          <RotateCcw className="size-4 shrink-0" />
                          <span className="hidden sm:inline">Undo</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span className="hidden sm:inline">Mark added</span>
                        </>
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
