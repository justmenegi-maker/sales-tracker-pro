"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { StatTile } from "@/components/ui/stat-tile";
import {
  formatINR,
  formatINRWhole,
  formatDateLabel,
  todayISO,
} from "@/lib/format";
import {
  debtOutstandingPaise,
  debtPaidPaise,
  deriveDebtStatus,
} from "@/lib/report";
import type { Debt } from "@/lib/report";
import { useAppStore } from "@/lib/store";

const STATUS_LABEL: Record<ReturnType<typeof deriveDebtStatus>, string> = {
  open: "Open",
  partial: "Partial",
  cleared: "Cleared",
};

export function DebtLedger({ branchId }: { branchId?: string | null }) {
  const { debts, branches, recordDebtPayment, addManualDebt, session } =
    useAppStore();
  const [openPaymentFor, setOpenPaymentFor] = useState<string | null>(null);
  const [paymentPaise, setPaymentPaise] = useState(0);
  const [productName, setProductName] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [saving, setSaving] = useState(false);

  const targetBranchId = branchId ?? session?.branchId ?? branches[0]?.id ?? null;

  const visible = useMemo(
    () =>
      debts
        .filter((debt) => !debt.voided)
        .filter((debt) => (branchId ? debt.branchId === branchId : true))
        .sort((a, b) => (a.debtDate < b.debtDate ? 1 : -1)),
    [branchId, debts],
  );

  const outstanding = visible
    .filter((debt) => deriveDebtStatus(debt) !== "cleared")
    .reduce((sum, debt) => sum + debtOutstandingPaise(debt), 0);
  const collected = visible.reduce((sum, debt) => sum + debtPaidPaise(debt), 0);
  const openCount = visible.filter(
    (debt) => deriveDebtStatus(debt) === "open",
  ).length;

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? "Branch";

  async function submitPayment(debt: Debt) {
    if (paymentPaise <= 0) {
      toast.error("Enter the amount received.");
      return;
    }
    setSaving(true);
    const ok = await recordDebtPayment(debt.id, paymentPaise, "Payment received");
    setSaving(false);
    if (ok) {
      toast.success(`Payment of ${formatINR(paymentPaise)} recorded.`);
      setOpenPaymentFor(null);
      setPaymentPaise(0);
    }
    // A refusal explains itself: the store raises it and AppShell toasts it.
  }

  async function submitManualDebt() {
    if (!targetBranchId) {
      toast.error("No branch available.");
      return;
    }
    if (productName.trim().length === 0) {
      toast.error("Add a product name for the debt.");
      return;
    }
    if (amountPaise <= 0) {
      toast.error("Add the debt amount.");
      return;
    }
    setSaving(true);
    const ok = await addManualDebt({
      branchId: targetBranchId,
      productName: productName.trim(),
      amountPaise,
      debtDate: todayISO(),
    });
    setSaving(false);
    if (ok) {
      toast.success("Debt added to the ledger.");
      setProductName("");
      setAmountPaise(0);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Outstanding"
          value={formatINRWhole(outstanding)}
          hint="Yet to be collected"
          tone="warning"
        />
        <StatTile
          label="Collected"
          value={formatINRWhole(collected)}
          hint="Payments recorded"
        />
        <StatTile
          label="Open debts"
          value={String(openCount)}
          hint={`${visible.length} entries in ledger`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Debt ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No debts recorded yet. Debt rows on a daily report land here
              automatically.
            </p>
          ) : (
            visible.slice(0, 12).map((debt) => {
              const status = deriveDebtStatus(debt);
              const outstandingForDebt = debtOutstandingPaise(debt);
              return (
                <div
                  key={debt.id}
                  className="rounded-md border bg-background/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {debt.productName || "Debt item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {branchName(debt.branchId)} ·{" "}
                        {formatDateLabel(debt.debtDate)} ·{" "}
                        {debt.source === "manual" ? "manual entry" : "from report"}
                      </p>
                    </div>
                    <div className="tnum text-right text-sm">
                      <p className="font-medium">{formatINR(debt.amountPaise)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatINR(debtPaidPaise(debt))} paid
                      </p>
                    </div>
                    <Badge
                      variant={
                        status === "cleared"
                          ? "secondary"
                          : status === "partial"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {STATUS_LABEL[status]}
                    </Badge>
                    {status !== "cleared" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpenPaymentFor(
                            openPaymentFor === debt.id ? null : debt.id,
                          );
                          setPaymentPaise(0);
                        }}
                      >
                        Payment
                      </Button>
                    ) : null}
                  </div>

                  {openPaymentFor === debt.id ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`pay-${debt.id}`}>
                          Amount received
                        </Label>
                        <MoneyInput
                          id={`pay-${debt.id}`}
                          value={paymentPaise}
                          onValueChange={setPaymentPaise}
                          placeholder={String(
                            (outstandingForDebt / 100).toFixed(2),
                          )}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => void submitPayment(debt)}
                      >
                        Record {formatINR(paymentPaise)}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add a debt</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-[1.5fr_1fr_auto] sm:p-6 sm:pt-0">
          <div className="space-y-1">
            <Label htmlFor="debt-product">Product</Label>
            <Input
              id="debt-product"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Ceiling fan"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="debt-amount">Amount</Label>
            <MoneyInput
              id="debt-amount"
              value={amountPaise}
              onValueChange={setAmountPaise}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={saving}
              onClick={() => void submitManualDebt()}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
