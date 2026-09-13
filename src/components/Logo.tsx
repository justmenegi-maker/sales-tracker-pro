import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[60%]"
        aria-hidden="true"
      >
        <path d="M3 17 L9 11 L13 14 L21 6" />
        <path d="M16 6 h5 v5" />
        <path d="M3 21 h18" />
      </svg>
    </div>
  );
}
