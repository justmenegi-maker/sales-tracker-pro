"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";

/**
 * Client-side guard for the signed-in routes.
 *
 * This app is exported statically, so there is no server middleware: the guard
 * runs in the browser and sends signed-out visitors to /auth/login with the
 * path they wanted, which the login page uses as its return target.
 */
export function RequireAuth({
  role,
  children,
}: {
  role?: "admin" | "branch";
  children: React.ReactNode;
}) {
  const { ready, session } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !session) {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, ready, router, session]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">Opening the cash book…</p>
      </div>
    );
  }

  if (!session) return null;

  if (role && session.role !== role) {
    return (
      <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="font-display text-2xl font-semibold">
              Admin access only
            </h1>
            <p className="text-sm text-muted-foreground">
              You are signed in as {session.email} (
              {session.role === "admin" ? "admin" : "branch staff"}). Switch to an
              admin account to open the branch overview.
            </p>
            <div className="flex justify-center gap-2">
              <Link href="/dashboard">
                <Button variant="outline">Go to daily report</Button>
              </Link>
              <Link href="/auth/login?role=admin">
                <Button>Switch account</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
