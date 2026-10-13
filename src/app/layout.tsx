import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { AppStoreProvider } from "@/lib/store";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "SK Tapri — Daily Sales Report",
    template: "%s | SK Tapri",
  },
  description:
    "Daily sales reporting for SK Tapri branches. Cash, online, finance, debt, exchange, cheque, store use, and other totals — all in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

function LayoutInner({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={cn("h-full bg-background text-foreground antialiased")}>
        <TooltipProvider delayDuration={300}>
          <AppStoreProvider>
            {children}
            <Toaster position="bottom-center" richColors />
          </AppStoreProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<div className="p-24 text-center">Loading…</div>}>
      <LayoutInner>{children}</LayoutInner>
    </Suspense>
  );
}
