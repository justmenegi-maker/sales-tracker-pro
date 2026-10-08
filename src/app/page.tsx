import { Button } from "@/components/ui/button";
import { VercelBadge } from "@/components/ui/vercel-badge";
import Link from "next/link";

function LandingBody() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="max-w-xl">
        <VercelBadge href="https://fluffy-trout-xrpw55xxv6q72p9g9.github.dev/" className="mb-6" />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          SK Tapri Daily Sales Report
        </h1>
        <p className="mt-4 text-muted-foreground">
          Branch daily reports, debt ledger, and an admin dashboard — all under
          one roof, in INR.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/auth/login">
            <Button className="w-full sm:w-auto">Branch sign in</Button>
          </Link>
          <Link href="/auth/login?role=admin">
            <Button variant="outline" className="w-full sm:w-auto">
              Admin sign in
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HomePage() {
  return <LandingBody />;
}
