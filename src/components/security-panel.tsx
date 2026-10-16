"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  passwordStrength,
} from "@/lib/password";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STRENGTH_TONE = [
  "bg-destructive",
  "bg-destructive",
  "bg-accent-foreground/60",
  "bg-primary/60",
  "bg-primary",
];

/**
 * Account and security settings: whether the address is confirmed, a password
 * change that enforces the policy in `lib/password.ts`, and a way to end every
 * session at once.
 */
export function SecurityPanel() {
  const { session, backend, changePassword, signOutEverywhere } = useAppStore();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const liveBackend = backend === "supabase";
  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  // A Google-only account has no password here to change.
  const passwordAccount = (session?.signInProvider ?? "email") === "email";

  async function submit() {
    if (next !== confirm) {
      toast.error("The two new passwords do not match.");
      return;
    }
    setSaving(true);
    const ok = await changePassword(current, next);
    setSaving(false);
    if (ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. Other devices were signed out.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="size-4" />
          Account &amp; security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-muted-foreground">Signed in as</span>
          <span className="font-medium">{session?.email ?? "—"}</span>
          <Badge variant="outline">
            {session?.role === "admin" ? "admin" : "branch staff"}
          </Badge>
          {passwordAccount ? null : (
            <Badge variant="outline">{session?.signInProvider}</Badge>
          )}
          {session?.emailVerified ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3.5" /> Email verified
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="size-3.5" /> Email not verified
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          This browser keeps the session in this tab only (never in
          localStorage), and a report can only be filed by the branch it belongs
          to — the database refuses anything else.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await signOutEverywhere();
              toast.success("Signed out on every device.");
              router.push("/");
            }}
          >
            Sign out on all devices
          </Button>
        </div>

        {liveBackend && passwordAccount ? (
          <div className="space-y-3 rounded-md border bg-background/60 p-4">
            <p className="text-sm font-medium">Change password</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="current-password">Current</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">New</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={72}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Repeat new</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={72}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  aria-invalid={mismatch}
                />
              </div>
            </div>

            {next.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all",
                        STRENGTH_TONE[strength.score],
                      )}
                      style={{ width: `${(strength.score / 4) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {strength.label}
                  </span>
                </div>
                <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(next);
                    return (
                      <li
                        key={rule.label}
                        className={cn(passed && "text-foreground")}
                      >
                        {passed ? "✓" : "•"} {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters with upper and lower
                case, a number and a symbol — no names, words or keyboard
                patterns.
              </p>
            )}

            {mismatch ? (
              <p className="text-xs text-destructive">
                The two new passwords do not match.
              </p>
            ) : null}

            <Button
              size="sm"
              disabled={saving || next.length === 0 || current.length === 0}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Update password"}
            </Button>
          </div>
        ) : liveBackend ? (
          <p className="rounded-md border bg-muted/40 p-3 text-xs">
            This account signs in with {session?.signInProvider}, so there is no
            password here to set or rotate — change it in your Google account.
            Signing out below ends the session in this browser.
          </p>
        ) : (
          <p className="rounded-md border border-accent-foreground/25 bg-accent/40 p-3 text-xs">
            Password rules are enforced by Supabase Auth once the project is
            connected. In demo mode there is no account to manage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
