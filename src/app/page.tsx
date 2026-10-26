"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export default function HomePage() {
  const router = useRouter();
  const { ready, session } = useAppStore();

  useEffect(() => {
    if (!ready || !session) return;
    router.replace(session.role === "admin" ? "/admin" : "/dashboard");
  }, [ready, session, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="grid size-12 place-items-center rounded-md bg-primary text-primary-foreground">
          <Store className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">SK Tapri</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily sales report
          </p>
        </div>
        <Link href="/auth/login">
          <Button size="lg">Sign in</Button>
        </Link>
      </div>
    </div>
  );
}
