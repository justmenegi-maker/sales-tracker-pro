"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ArrowLeft, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";

// The app is exported statically, so this route has no server-side
// searchParams: read the browser URL as an external store instead. The empty
// server snapshot keeps hydration clean and React refreshes it after mount.
const subscribeToUrl = () => () => {};
const getUrlSnapshot = () => window.location.search;
const getServerUrlSnapshot = () => "";

export default function LoginPage() {
  const router = useRouter();
  const { ready, session, backend, signIn, signInDemo, error, clearError } =
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const target = returnTo ?? fallback;
      toast.success("Signed in.");
      router.replace(target);
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
            Branch staff file the day once. Admins see every branch, every
            outstanding debt and every day that was missed.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
            <li>· Cash, online, finance, debt, exchange, cheque, store use, others</li>
            <li>· Reports lock on filing; only an admin can void</li>
            <li>· Every amount stored as integer paise</li>
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Tenant: sktapri.app
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
                <Badge variant={backend === "supabase" ? "default" : "outline"}>
                  {backend === "supabase" ? "Supabase connected" : "Demo data"}
                </Badge>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Sign in
                </h2>
                <p className="text-sm text-muted-foreground">
                  {wantsAdmin
                    ? "Use an admin account to open the branch overview."
                    : "Branch staff sign in with the email linked to their branch."}
                </p>
              </div>

              {backend === "demo" ? (
                <div className="rounded-md border border-accent-foreground/25 bg-accent/40 p-3 text-sm">
                  <p className="font-medium">Supabase is not connected yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Add <code className="tnum">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                    <code className="tnum">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in
                    Settings → Environment to enable real sign-in. Until then the
                    workspace runs on sample data.
                  </p>
                </div>
              ) : null}

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
                    placeholder="kaza@sktapri.app"
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
              </form>

              <div className="relative flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    signInDemo("branch");
                    router.push("/dashboard");
                  }}
                >
                  Demo · branch
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    signInDemo("admin");
                    router.push("/admin");
                  }}
                >
                  Demo · admin
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Demo mode uses two sample branches and three weeks of seeded
                reports, saved in this browser only.
              </p>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            New branch? Ask an admin to create your login, then set your password
            from the invite email.
          </p>
        </div>
      </div>
    </div>
  );
}
