import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "accent" | "warning";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        tone === "primary" && "border-primary/35 bg-primary/5",
        tone === "accent" && "border-accent-foreground/25 bg-accent/45",
        tone === "warning" && "border-destructive/30 bg-destructive/5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="tnum mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
