"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Store, LayoutDashboard, ReceiptText } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Daily report", shortLabel: "Report", icon: ReceiptText },
  { href: "/admin", label: "Admin overview", shortLabel: "Admin", icon: LayoutDashboard },
];

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, branches, signOut } = useAppStore();

  return (
    <div className="min-h-dvh">
      {/* pt-env keeps the bar clear of the notch in installed (standalone) mode. */}
      <header className="safe-top sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-display text-base font-semibold">
                SK Tapri
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Daily sales
              </span>
            </span>
          </Link>

          <nav className="ml-1 flex items-center gap-0.5 sm:ml-2 sm:gap-1">
            {NAV.filter((item) => item.href !== "/admin" || session?.role === "admin").map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.shortLabel}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <PWAInstallButton size="sm" variant="ghost" />
            {/* On a phone the branch name already heads the page, so the badge
                is desktop-only; it would otherwise squeeze the header. */}
            <Badge
              variant="outline"
              className="hidden max-w-[12rem] truncate text-xs capitalize sm:inline-flex"
            >
              {session?.role === "admin"
                ? "Admin"
                : (branches.find((b) => b.id === session?.branchId)?.name || session?.branchName || "Branch")}
            </Badge>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {session?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sign out"
              className="px-2 sm:px-3"
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-6xl px-3 pt-6 pb-24 sm:px-4 sm:pt-8 lg:pb-10"
      >
        <div className="mb-5 flex flex-col gap-1 sm:mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </motion.main>
    </div>
  );
}
