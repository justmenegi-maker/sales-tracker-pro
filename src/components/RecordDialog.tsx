import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, toDateKey } from "@/lib/format";
import { upsertQueuedRecord, useIsOnline } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { CloudOff, Loader2, Plus, Store } from "lucide-react";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type StoreLite = Pick<Doc<"stores">, "_id" | "name">;

type RecordDraft = Pick<
  Doc<"salesRecords">,
  "storeId" | "date" | "totalSales" | "cash" | "online" | "financed" | "note"
>;

const AMOUNT_FIELDS = [
  { key: "totalSales", label: "Total sales", placeholder: "0.00" },
  { key: "cash", label: "Cash payments", placeholder: "0.00" },
  { key: "online", label: "Online payments", placeholder: "0.00" },
  { key: "financed", label: "Financed items", placeholder: "0.00" },
] as const;

type AmountKey = (typeof AMOUNT_FIELDS)[number]["key"];

export function RecordDialog({
  open,
  onOpenChange,
  stores,
  editing,
  defaultStoreId,
  defaultDate,
  currency,
  onManageStores,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: StoreLite[];
  editing: RecordDraft | null;
  defaultStoreId?: string;
  defaultDate?: string;
  currency: string;
  onManageStores?: () => void;
  onSaved?: () => void;
}) {
  const upsert = useMutation(api.records.upsert);
  const isOnline = useIsOnline();
  const [storeId, setStoreId] = useState<string>("");
  const [date, setDate] = useState<string>(toDateKey());
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>({
    totalSales: "",
    cash: "",
    online: "",
    financed: "",
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStoreId(editing.storeId);
      setDate(editing.date);
      setAmounts({
        totalSales: String(editing.totalSales),
        cash: String(editing.cash),
        online: String(editing.online),
        financed: String(editing.financed),
      });
      setNote(editing.note ?? "");
    } else {
      setStoreId(defaultStoreId ?? stores[0]?._id ?? "");
      setDate(defaultDate ?? toDateKey());
      setAmounts({ totalSales: "", cash: "", online: "", financed: "" });
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultStoreId, defaultDate]);

  const unaccounted = useMemo(() => {
    const total = Number(amounts.totalSales) || 0;
    const cash = Number(amounts.cash) || 0;
    const online = Number(amounts.online) || 0;
    const financed = Number(amounts.financed) || 0;
    return Number((total - (cash + online + financed)).toFixed(2));
  }, [amounts]);

  const hasStores = stores.length > 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId) return;
    const payload = {
      storeId: storeId as Doc<"stores">["_id"],
      date,
      totalSales: Number(amounts.totalSales) || 0,
      cash: Number(amounts.cash) || 0,
      online: Number(amounts.online) || 0,
      financed: Number(amounts.financed) || 0,
      note: note.trim() ? note.trim() : undefined,
    };
    setSaving(true);
    try {
      if (isOnline) {
        try {
          await upsert(payload);
          onOpenChange(false);
          toast.success(editing ? "Record updated" : "Sales record saved");
          onSaved?.();
          return;
        } catch (error) {
          // Network hiccup — fall through to the offline queue so nothing is lost.
          console.warn("Save failed, queueing offline instead:", error);
        }
      }
      upsertQueuedRecord(payload);
      onOpenChange(false);
      toast.success(
        isOnline
          ? "Saved — will retry syncing"
          : "Saved offline — syncs automatically when you're back online",
      );
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit daily record" : "New daily record"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the numbers for this store and day."
              : "Log today's totals, payments, and financed items for one store."}
          </DialogDescription>
        </DialogHeader>

        {hasStores ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isOnline && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
                <CloudOff className="size-3.5 shrink-0" />
                <span>
                  You&apos;re offline — this record saves to your device and syncs
                  automatically when you&apos;re back online.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="record-store">Store</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger id="record-store" className="w-full">
                    <SelectValue placeholder="Choose a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store._id} value={store._id}>
                        {store.name}
                      </SelectItem>
                    ))}
                    {onManageStores && (
                      <>
                        <SelectSeparator />
                        <div className="p-1">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              onManageStores();
                            }}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground"
                          >
                            <Store className="size-4" />
                            Manage stores…
                          </button>
                        </div>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="record-date">Date</Label>
                <Input
                  id="record-date"
                  type="date"
                  value={date}
                  max={toDateKey()}
                  onChange={(e) => setDate(e.target.value || toDateKey())}
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {AMOUNT_FIELDS.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`record-${field.key}`} className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Input
                      id={`record-${field.key}`}
                      inputMode="decimal"
                      placeholder={field.placeholder}
                      value={amounts[field.key]}
                      onChange={(e) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [field.key]: e.target.value.replace(/[^\d.]/g, ""),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  Not covered by cash / online / financed
                </span>
                <span
                  className={cn(
                    "font-mono-num text-sm font-semibold",
                    unaccounted === 0 ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {formatCurrency(unaccounted, currency)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="record-note">Notes</Label>
              <Textarea
                id="record-note"
                placeholder="Anything worth remembering about today — staffing, deliveries, promos, issues…"
                className="min-h-[88px] resize-none"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !storeId}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Save record"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <Store className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No stores yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first store to start saving daily records.
              </p>
            </div>
            {onManageStores && (
              <Button type="button" size="sm" onClick={onManageStores}>
                <Plus className="size-4" />
                Add a store
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
