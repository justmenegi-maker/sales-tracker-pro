"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, RotateCcw } from "lucide-react";
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

/**
 * Reminder list for offline sales.
 *
 * The money for these items already reached the shop as cash or online, so the
 * prices here are reference only and never feed Total Sale. The list exists so
 * the items can be entered later in the separate daily-sales system.
 */
export function OfflineSales({ branchId }: { branchId?: string | null }) {
  const { offlineSales, branches, addOfflineSale, setOfflineSaleAdded, session } =
    useAppStore();

  const [itemName, setItemName] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [saleDate, setSaleDate] = useState(todayISO());
  const [pickedBranchId, setPickedBranchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fixedBranchId = branchId ?? session?.branchId ?? null;

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

  const addBranchId =
    fixedBranchId ||
    pickedBranchId ||
    branches[0]?.id ||
    "";

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? "Branch";

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
        : `${sale.itemName} marked as added to the system.`,
    );
  }

  return (
    <div className="space-y-4">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Offline sale reminders</CardTitle>
          <p className="text-xs text-muted-foreground">
            Money is already received in cash or online. This list only reminds
            you to enter these items in the daily sales system — their prices are
            not counted in Total Sale.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing pending. Add an offline sale below when an item still has
              to be entered in the system.
            </p>
          ) : (
            visible.slice(0, 15).map((sale) => (
              <div
                key={sale.id}
                className="rounded-md border bg-background/60 p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {sale.itemName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {branchName(sale.branchId)} ·{" "}
                      {formatDateLabel(sale.saleDate)}
                      {sale.addedToSystem && sale.addedByName
                        ? ` · added by ${sale.addedByName}`
                        : ""}
                    </p>
                  </div>
                  <p className="tnum text-right text-sm font-medium">
                    {formatINR(sale.amountPaise)}
                  </p>
                  <Badge variant={sale.addedToSystem ? "secondary" : "destructive"}>
                    {sale.addedToSystem ? "Added" : "Not added"}
                  </Badge>
                  <Button
                    size="sm"
                    variant={sale.addedToSystem ? "ghost" : "outline"}
                    disabled={busyId === sale.id}
                    onClick={() => void toggleAdded(sale)}
                  >
                    {sale.addedToSystem ? (
                      <>
                        <RotateCcw className="size-4" />
                        Undo
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4" />
                        Mark added
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add an offline sale</CardTitle>
          <p className="text-xs text-muted-foreground">
            The price is a reminder only. Do not add it to the day&apos;s report
            — the cash or online amount already covers it.
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
    </div>
  );
}
