import type { Metadata, Viewport } from "next";
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={cn("h-full bg-background text-foreground antialiased")}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-center" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
