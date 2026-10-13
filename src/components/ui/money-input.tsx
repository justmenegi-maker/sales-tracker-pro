"use client";

import { useState } from "react";
import { parseRupeesToPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rupee field that always reports integer paise upward.
 * Invalid characters are rejected at the keystroke, so the value is never a
 * half-parsed number.
 */
export function MoneyInput({
  id,
  value,
  onValueChange,
  placeholder = "0.00",
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  onValueChange: (paise: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  // While the field is being edited we show exactly what was typed; the rest of
  // the time the display is derived from the paise value, so external resets
  // (a new report, a cleared row) always show up without an effect.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value === 0 ? "" : (value / 100).toFixed(2));

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          const cleaned = event.target.value.replace(/[₹,\s]/g, "");
          if (cleaned !== "" && !/^\d*(\.\d{0,2})?$/.test(cleaned)) return;
          setDraft(cleaned);
          onValueChange(parseRupeesToPaise(cleaned) ?? 0);
        }}
        onBlur={() => {
          setDraft(null);
          onValueChange(parseRupeesToPaise(text) ?? 0);
        }}
        className={cn(
          "tnum flex h-10 w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-right text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
    </div>
  );
}
