import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { AppStoreProvider } from "@/lib/store";
import { Toaster } from "@/components/ui/sonner";
import { OpeningAnimation } from "@/components/opening-animation";
import { OfflineIndicator } from "@/components/offline-indicator";
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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SK Tapri",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "SK Tapri — Daily Sales Report",
    description:
      "Daily sales reporting for SK Tapri branches. Cash, online, finance, debt, exchange, cheque, store use, and other totals — all in one place.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#144a42" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

function LayoutInner({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={cn("h-full bg-background text-foreground antialiased")}>
        <AppStoreProvider>
          <OpeningAnimation />
          <OfflineIndicator />
          {children}
          <Toaster position="bottom-center" richColors />
        </AppStoreProvider>
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
