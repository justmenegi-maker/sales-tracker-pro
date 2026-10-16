"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { readOAuthCallback } from "@/lib/oauth";
import { useAppStore } from "@/lib/store";

/**
 * Where Supabase returns the browser after a Google sign-in.
 *
 * The URL carries a single-use PKCE `code`, not a token: the code is exchanged
 * here, the query string is cleared straight away, and the session is only then
 * resolved. `detectSessionInUrl` stays off in `lib/supabase.ts`, so nothing else
 * in the app will ever accept a session from the address bar.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { completeGoogleSignIn, error, clearError } = useAppStore();
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    clearError();

    const { code, error: providerError, returnTo } = readOAuthCallback(
      typeof window === "undefined" ? "" : window.location.search,
    );

    // Drop the code before anything else: it is single use, and it should not
    // sit in the history or travel along in a referrer.
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Every state update happens inside this task, never in the effect body:
    // a synchronous update there would cascade a second render for nothing.
    void (async () => {
      if (providerError) {
        setCallbackError(providerError);
        return;
      }
      if (!code) {
        setCallbackError(
          "That sign-in link is missing its code. Start again from the sign-in page.",
        );
        return;
      }

      const ok = await completeGoogleSignIn(code);
      if (ok) router.replace(returnTo ?? "/dashboard");
      else {
        setCallbackError("We could not finish the Google sign-in. Please try again.");
      }
    })();
  }, [clearError, completeGoogleSignIn, router]);

  const failure = callbackError ?? error;

  return (
    <div className="mx-auto grid min-h-screen max-w-lg place-items-center px-4">
      <Card className="w-full">
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">
            {failure ? "Sign-in did not finish" : "Finishing sign-in…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {failure ??
              "Exchanging the one-time Google code for a session. This takes a second."}
          </p>
          {failure ? (
            <div className="flex justify-center gap-2">
              <Link href="/auth/login">
                <Button variant="outline">Back to sign in</Button>
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
