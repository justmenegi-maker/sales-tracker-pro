"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { accountState, accountStateCopy } from "@/lib/session";

/**
 * Client-side guard for the signed-in routes.
 *
 * This app is exported statically, so there is no server middleware: the guard
 * runs in the browser and sends signed-out visitors to /auth/login with the
 * path they wanted, which the login page uses as its return target.
 *
 * The guard is a usability layer, not the security boundary. Row-level
 * security in Supabase is what actually protects the data, so the checks here
 * are limited to "is there a real signed-in session" and "does its role match
 * this page". A demo session is not acceptable while Supabase is connected,
 * and an email that Supabase has not confirmed is treated as signed out.
 */
export function RequireAuth({
  role,
  children,
}: {
  role?: "admin" | "branch";
  children: React.ReactNode;
}) {
  const { ready, session, backend, signOut } = useAppStore();
  const router = useRouter();

  const demoSessionWhileConnected =
    backend === "supabase" && !!session?.id.startsWith("demo_");
  const activeSession =
    session && session.emailVerified && !demoSessionWhileConnected ? session : null;
  const signedIn = activeSession !== null;

  // Unlinked, inactive or branch-less: a real sign-in with no workspace behind
  // it. The database refuses those writes anyway; this is the explanation.
  const state = activeSession ? accountState(activeSession) : "ready";

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      const target =
        typeof window === "undefined"
          ? "/dashboard"
          : `${window.location.pathname}${window.location.search}`;
      router.replace(`/auth/login?returnTo=${encodeURIComponent(target)}`);
      return;
    }
    // A branch user has no business on the admin overview; send them to their
    // own workspace instead of leaving them on a dead end.
    if (role && activeSession.role !== role) {
      router.replace("/dashboard");
    }
  }, [activeSession, ready, role, router, signedIn]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">Opening the cash book…</p>
      </div>
    );
  }

  if (!activeSession) return null;

  // An account that no usable `profiles` row points at is a real sign-in with
  // no workspace: say which piece is missing instead of showing an empty one.
  if (state !== "ready") {
    const copy = accountStateCopy(state, activeSession.email);
    return (
      <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="font-display text-2xl font-semibold">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                  router.replace("/auth/login");
                }}
              >
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (role && activeSession.role !== role) {
    return (
      <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="font-display text-2xl font-semibold">
              Admin access only
            </h1>
            <p className="text-sm text-muted-foreground">
              You are signed in as {activeSession.email} (
              {activeSession.role === "admin" ? "admin" : "branch staff"}). A
              branch login cannot open the branch overview.
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
