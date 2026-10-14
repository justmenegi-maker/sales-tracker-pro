"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, ShieldCheck, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";

const subscribeToUrl = () => () => {};
const getUrlSnapshot = () => window.location.search;
const getServerUrlSnapshot = () => "";

export default function LoginPage() {
  const router = useRouter();
  const { ready, session, signIn, signInWithGoogle, error, clearError } =
    useAppStore();

  const search = useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getServerUrlSnapshot,
  );
  const params = new URLSearchParams(search);
  const requested = params.get("returnTo");
  const returnTo = requested?.startsWith("/") ? requested : null;
  const wantsAdmin = params.get("role") === "admin";

  const [email, setEmail] = useState("justmenegi@gmail.com");
  const [password, setPassword] = useState("mango123");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const fallback = wantsAdmin ? "/admin" : "/dashboard";

  useEffect(() => {
    if (ready && session) router.replace(returnTo ?? fallback);
  }, [fallback, ready, returnTo, router, session]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const ok = await signIn(email.trim(), password);
    setSubmitting(false);
    if (ok) {
      const target = returnTo ?? (email.trim().toLowerCase() === "justmenegi@gmail.com" ? "/admin" : "/dashboard");
      toast.success("Signed in successfully.");
      router.replace(target);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    const ok = await signInWithGoogle();
    setGoogleLoading(false);
    if (ok) {
      toast.success("Signed in with Google.");
      router.replace(returnTo ?? fallback);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r bg-primary/5 p-10 lg:flex">
        <div
          aria-hidden
          className="paper-grid pointer-events-none absolute inset-0 opacity-40"
        />
        <Link
          href="/"
          className="relative flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>

        <div className="relative max-w-md">
          <span className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-5" />
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
            The cash book that adds up by itself.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Branch staff file the day once. Admins see every branch, invite staff
            via Gmail, review debts, and consolidate daily sales.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
            <li>· Cash, online, finance, debt, exchange, cheque, store use, others</li>
            <li>· Multi-branch management & staff invite via Gmail</li>
            <li>· Stored persistently in Firebase Cloud Firestore</li>
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Tenant: sktapri.app · Secure Cloud
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-5">
          <div className="lg:hidden">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </div>

          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Badge variant="default" className="gap-1">
                  <ShieldCheck className="size-3.5" />
                  Firebase Authentication
                </Badge>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Sign in to SK Tapri
                </h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with your Google account or administrator credentials.
                </p>
              </div>

              {/* Google Sign In */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-primary/20 hover:bg-primary/5 py-5"
                disabled={googleLoading}
                onClick={handleGoogleSignIn}
              >
                <svg className="size-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {googleLoading ? "Connecting…" : "Continue with Google (Gmail)"}
              </Button>

              <div className="relative flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  or sign in with email
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) clearError();
                    }}
                    placeholder="justmenegi@gmail.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) clearError();
                    }}
                    placeholder="••••••••"
                  />
                </div>

                {error ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>

                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground">Admin:</span> justmenegi@gmail.com
                    <span className="mx-1">/</span>
                    <span className="font-mono">mango123</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setEmail("justmenegi@gmail.com");
                      setPassword("mango123");
                    }}
                  >
                    <KeyRound className="size-3 mr-1" />
                    Fill
                  </Button>
                </div>
              </form>

              <div className="border-t pt-3 text-center text-xs text-muted-foreground">
                Staff invited by an Admin can sign in using their Gmail account to
                access their assigned branch reports.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
