import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Logo } from "@/components/Logo";
import { RecordDialog } from "@/components/RecordDialog";
import { StoresDialog } from "@/components/StoresDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  dateKeyLabel,
  dateKeyRangeLabel,
  formatCurrency,
  shiftDateKey,
  toDateKey,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Receipt,
  Store,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

type RangeMode = "today" | "7d" | "30d" | "all";

const RANGE_OPTIONS: { value: RangeMode; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "all", label: "All time", days: null },
];

const RANGE_START_FALLBACK = "2000-01-01";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const stores = useQuery(api.stores.list) ?? [];
  const settings = useQuery(api.settings.get);
  const setCurrency = useMutation(api.settings.setCurrency);
  const removeRecord = useMutation(api.records.remove);

  const currency = settings?.currency ?? "USD";

  const [rangeMode, setRangeMode] = useState<RangeMode>("7d");
  const [anchor, setAnchor] = useState<string>(toDateKey());
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Doc<"salesRecords"> | null>(null);
  const [recordDefaults, setRecordDefaults] = useState<{ storeId?: string; date?: string }>({});
  const [storesOpen, setStoresOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Doc<"salesRecords"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const today = toDateKey();

  const { from, to } = useMemo(() => {
    const option = RANGE_OPTIONS.find((r) => r.value === rangeMode)!;
    if (option.days === null) return { from: RANGE_START_FALLBACK, to: today };
    if (option.days === 1) return { from: anchor, to: anchor };
    return { from: shiftDateKey(anchor, -(option.days - 1)), to: anchor };
  }, [rangeMode, anchor, today]);

  const records = useQuery(api.records.listRange, { from, to }) ?? [];

  const storeNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const store of stores) map[store._id] = store.name;
    return map;
  }, [stores]);

  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        cash: acc.cash + r.cash,
        online: acc.online + r.online,
        financed: acc.financed + r.financed,
      }),
      { totalSales: 0, cash: 0, online: 0, financed: 0 },
    );
  }, [records]);

  const unaccounted = useMemo(
    () =>
      Number(
        (totals.totalSales - (totals.cash + totals.online + totals.financed)).toFixed(2),
      ),
    [totals],
  );

  const dayCount = useMemo(() => {
    if (rangeMode === "all") {
      const unique = new Set(records.map((r) => r.date));
      return Math.max(unique.size, 1);
    }
    const option = RANGE_OPTIONS.find((r) => r.value === rangeMode)!;
    return option.days ?? 1;
  }, [rangeMode, records]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of records) {
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.totalSales);
    }
    const keys = [...byDay.keys()].sort();
    return keys.map((key) => ({
      date: key,
      label: dateKeyLabel(key).replace(/^[A-Za-z]{3}, /, ""),
      total: byDay.get(key) ?? 0,
    }));
  }, [records]);

  const mix = useMemo(() => {
    const total = totals.totalSales;
    if (total <= 0) return { cash: 0, online: 0, financed: 0 };
    return {
      cash: (totals.cash / total) * 100,
      online: (totals.online / total) * 100,
      financed: (totals.financed / total) * 100,
    };
  }, [totals]);

  const shiftWindow = (direction: 1 | -1) => {
    const option = RANGE_OPTIONS.find((r) => r.value === rangeMode)!;
    if (option.days === null) return;
    setAnchor((prev) => {
      const next = shiftDateKey(prev, direction * (option.days ?? 1));
      return next > today ? today : next;
    });
  };

  const canGoForward = rangeMode !== "all" && anchor < today;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const openNewRecord = () => {
    setEditingRecord(null);
    setRecordDefaults({ date: today });
    setRecordOpen(true);
  };

  const openEditRecord = (record: Doc<"salesRecords">) => {
    setEditingRecord(record);
    setRecordOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeRecord({ id: pendingDelete._id });
      toast.success("Record deleted");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete record");
    } finally {
      setDeleting(false);
    }
  };

  const statCards = [
    {
      label: "Total sales",
      value: totals.totalSales,
      icon: TrendingUp,
      iconClass: "bg-accent text-accent-foreground",
      sub: `~${formatCurrency(totals.totalSales / dayCount, currency)} / day`,
    },
    {
      label: "Cash payments",
      value: totals.cash,
      icon: Banknote,
      iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      sub: `${mix.cash.toFixed(0)}% of total`,
    },
    {
      label: "Online payments",
      value: totals.online,
      icon: CreditCard,
      iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      sub: `${mix.online.toFixed(0)}% of total`,
    },
    {
      label: "Financed items",
      value: totals.financed,
      icon: Landmark,
      iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      sub: `${mix.financed.toFixed(0)}% of total`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="size-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Ledgerly</p>
              <p className="truncate text-xs text-muted-foreground">
                Multi-store daily sales
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={currency}
              onValueChange={(value) => {
                void setCurrency({ currency: value }).catch(() =>
                  toast.error("Could not update currency"),
                );
              }}
            >
              <SelectTrigger size="sm" className="w-[92px]" aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {["USD", "EUR", "GBP", "INR", "AED", "SAR", "PKR", "BDT", "NGN", "CAD", "AUD", "JPY"].map(
                  (code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStoresOpen(true)}
              className="hidden sm:inline-flex"
            >
              <Store className="size-4" />
              Stores
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">
              Sales overview
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateKeyRangeLabel([from, to])}
              {stores.length > 0 && (
                <>
                  {" · "}
                  {stores.length} {stores.length === 1 ? "store" : "stores"}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStoresOpen(true)}
              className="sm:hidden"
            >
              <Store className="size-4" />
              Stores
            </Button>
            <Button onClick={openNewRecord} className="shadow-sm shadow-primary/25">
              <Plus className="size-4" />
              New record
            </Button>
          </div>
        </div>

        {/* Range toolbar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5 shadow-sm">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRangeMode(option.value);
                  if (option.value !== "all") setAnchor(today);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  rangeMode === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {rangeMode !== "all" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => shiftWindow(-1)}
                aria-label="Previous period"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => shiftWindow(1)}
                disabled={!canGoForward}
                aria-label="Next period"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
          {rangeMode !== "all" && anchor !== today && (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              <CalendarDays className="size-4" />
              Jump to today
            </Button>
          )}
        </div>

        {/* Stat cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.label} className="border-border/70 shadow-sm">
              <CardContent className="flex items-start gap-3 pt-5">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    card.iconClass,
                  )}
                >
                  <card.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <p className="font-mono-num mt-0.5 truncate text-xl font-semibold tracking-tight">
                    {formatCurrency(card.value, currency)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Breakdown + trend */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="border-border/70 shadow-sm lg:col-span-2">
            <CardContent className="pt-5">
              <h2 className="text-sm font-semibold tracking-tight">Payment mix</h2>
              <div className="mt-4 flex flex-col gap-4">
                {[
                  { label: "Cash", value: totals.cash, pct: mix.cash, bar: "bg-emerald-500" },
                  { label: "Online", value: totals.online, pct: mix.online, bar: "bg-sky-500" },
                  { label: "Financed", value: totals.financed, pct: mix.financed, bar: "bg-amber-500" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-mono-num font-medium">
                        {formatCurrency(row.value, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", row.bar)}
                        style={{ width: `${Math.min(row.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Unaccounted</span>
                  <span
                    className={cn(
                      "font-mono-num font-semibold",
                      unaccounted === 0 ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {formatCurrency(unaccounted, currency)}
                  </span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Unaccounted is total sales minus cash, online, and financed — a quick
                  check that everything adds up.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm lg:col-span-3">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Daily total sales</h2>
                <Badge variant="secondary" className="font-mono-num">
                  {chartData.length} {chartData.length === 1 ? "day" : "days"}
                </Badge>
              </div>
              {chartData.length === 0 ? (
                <div className="mt-4 flex h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                  <Receipt className="size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No records in this range yet</p>
                </div>
              ) : (
                <div className="mt-4 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        minTickGap={24}
                      />
                      <YAxis
                        width={56}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        tickFormatter={(value: number) =>
                          Intl.NumberFormat("en", { notation: "compact" }).format(value)
                        }
                      />
                      <Tooltip
                        cursor={{ stroke: "var(--color-border)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const value = payload[0].value as number;
                          return (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                              <p className="text-muted-foreground">{label}</p>
                              <p className="font-mono-num mt-0.5 font-semibold">
                                {formatCurrency(value, currency)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        fill="url(#salesFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Records table */}
        <Card className="mt-4 border-border/70 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Records</h2>
              <span className="text-xs text-muted-foreground">
                {records.length} {records.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {records.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                  <Receipt className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No sales records here yet</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Save today&apos;s total sales, cash and online payments, and financed
                    items — plus a note — and they&apos;ll show up here.
                  </p>
                </div>
                <Button size="sm" onClick={openNewRecord}>
                  <Plus className="size-4" />
                  Add your first record
                </Button>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Date</th>
                      <th className="pb-2 pr-3 font-medium">Store</th>
                      <th className="pb-2 pr-3 text-right font-medium">Total</th>
                      <th className="hidden pb-2 pr-3 text-right font-medium sm:table-cell">Cash</th>
                      <th className="hidden pb-2 pr-3 text-right font-medium sm:table-cell">Online</th>
                      <th className="hidden pb-2 pr-3 text-right font-medium md:table-cell">Financed</th>
                      <th className="hidden pb-2 pr-3 font-medium md:table-cell">Note</th>
                      <th className="pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        key={record._id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                          {dateKeyLabel(record.date)}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Store className="size-3.5 text-muted-foreground" />
                            {storeNames[record.storeId] ?? "Unknown store"}
                          </span>
                        </td>
                        <td className="font-mono-num py-2.5 pr-3 text-right font-semibold">
                          {formatCurrency(record.totalSales, currency)}
                        </td>
                        <td className="font-mono-num hidden py-2.5 pr-3 text-right text-muted-foreground sm:table-cell">
                          {formatCurrency(record.cash, currency)}
                        </td>
                        <td className="font-mono-num hidden py-2.5 pr-3 text-right text-muted-foreground sm:table-cell">
                          {formatCurrency(record.online, currency)}
                        </td>
                        <td className="font-mono-num hidden py-2.5 pr-3 text-right text-muted-foreground md:table-cell">
                          {formatCurrency(record.financed, currency)}
                        </td>
                        <td className="hidden max-w-[220px] py-2.5 pr-3 md:table-cell">
                          {record.note ? (
                            <span className="line-clamp-1 text-muted-foreground" title={record.note}>
                              {record.note}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                              onClick={() => openEditRecord(record)}
                              aria-label="Edit record"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setPendingDelete(record)}
                              aria-label="Delete record"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Signed in{user?.name ? ` as ${user.name}` : ""} · One record per store per day —
          saving again updates it.
        </p>
      </main>

      <RecordDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        stores={stores}
        editing={editingRecord}
        defaultStoreId={recordDefaults.storeId}
        defaultDate={recordDefaults.date}
        currency={currency}
        onManageStores={() => setStoresOpen(true)}
      />
      <StoresDialog open={storesOpen} onOpenChange={setStoresOpen} stores={stores} />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                `${storeNames[pendingDelete.storeId] ?? "This store"} — ${dateKeyLabel(pendingDelete.date)}`}{" "}
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
