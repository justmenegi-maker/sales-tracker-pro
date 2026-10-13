import Link from "next/link";
import {
  BookOpenCheck,
  Calculator,
  Landmark,
  Lock,
  ShieldCheck,
  Store,
  TrendingUp,
} from "lucide-react";
import { DemoButton } from "@/components/demo-button";
import { TrendChart } from "@/components/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SECTION_META } from "@/lib/report";
import { formatINR } from "@/lib/format";

const HERO_SECTIONS = [
  { label: "Cash", amount: 28450 },
  { label: "Online", amount: 16920 },
  { label: "Finance", amount: 12500 },
  { label: "Debt", amount: 6400 },
  { label: "Exchange", amount: 1800 },
  { label: "Cheque", amount: 0 },
  { label: "Store use", amount: 950 },
  { label: "Others", amount: 2100 },
];

// Paise, so the chart shares the app's money scale.
const TREND = [
  { label: "Mon", value: 4230000 },
  { label: "Tue", value: 5110000 },
  { label: "Wed", value: 3875000 },
  { label: "Thu", value: 5820000 },
  { label: "Fri", value: 6640000 },
  { label: "Sat", value: 7190000 },
  { label: "Sun", value: 4980000 },
];

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "Cash-book entry",
    body: "Cash, online, finance, debt, exchange, cheque, store use and others — the exact sections your staff already write by hand.",
  },
  {
    icon: Calculator,
    title: "One Total Sale",
    body: "Every rupee is stored as integer paise, so totals never drift and the report total is recomputed on the server before it is accepted.",
  },
  {
    icon: Landmark,
    title: "Debt ledger",
    body: "Debt rows on a report flow straight into a ledger with part payments, outstanding balances and cleared debts.",
  },
  {
    icon: Lock,
    title: "Locked on filing",
    body: "Branch staff can file but never edit a submitted report. Only an admin can void a day with a recorded reason.",
  },
  {
    icon: ShieldCheck,
    title: "Branch-scoped access",
    body: "Row-level security gives each branch its own data and admins the whole picture — configured in SQL migrations in this repo.",
  },
  {
    icon: TrendingUp,
    title: "Admin overview",
    body: "Compare branches side by side, watch the daily trend and spot the days nobody filed.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Branch files the day",
    body: "Pick the date, enter the eight sections, watch the Total Sale add up live, then submit once.",
  },
  {
    step: "02",
    title: "Debt lands in the ledger",
    body: "Anything sold on credit becomes a ledger entry you can part-pay or clear later.",
  },
  {
    step: "03",
    title: "Admin closes the day",
    body: "Compare branches on one screen, check the trend and void a report if it was keyed wrong.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Theme wash: paper grid + soft ink/amber blooms. */}
      <div
        aria-hidden
        className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-40"
      />
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-primary/12 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -right-20 top-64 size-80 rounded-full bg-accent/50 blur-3xl"
      />

      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Store className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold">SK Tapri</span>
          <nav className="ml-6 hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <a className="hover:text-foreground" href="#how">
              How it works
            </a>
            <a className="hover:text-foreground" href="#features">
              Features
            </a>
            <a className="hover:text-foreground" href="#sections">
              Report sections
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                Admin
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button size="sm">Sign in</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="animate-rise">
            <Badge variant="outline" className="mb-5">
              Daily sales reporting · INR
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Close every branch day
              <span className="block text-primary">before you lock the shop.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              SK Tapri replaces the paper cash book with one screen that adds up
              itself. Branch staff file the day in under a minute; the admin sees
              every branch, every debt and every missing report.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/login">
                <Button size="lg" className="w-full sm:w-auto">
                  Sign in to file today
                </Button>
              </Link>
              <DemoButton
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                Explore the demo workspace
              </DemoButton>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
              {[
                { label: "Sections per report", value: "8" },
                { label: "Money precision", value: "1 paisa" },
                { label: "Edits after filing", value: "None" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="tnum font-display text-xl font-semibold">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="animate-rise relative">
            <div
              aria-hidden
              className="absolute -inset-3 -z-10 rounded-3xl bg-primary/8 blur-2xl"
            />
            <Card className="overflow-hidden border-primary/25 shadow-lg">
              <div className="flex items-center justify-between gap-3 border-b bg-secondary/60 px-5 py-3">
                <div>
                  <p className="font-display text-base font-semibold">
                    SK Kaza · daily report
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Filed 13 Oct 2026, 6:40 pm
                  </p>
                </div>
                <Badge>Locked</Badge>
              </div>
              <CardContent className="ledger-rules space-y-3 p-5">
                {HERO_SECTIONS.map((section) => (
                  <div
                    key={section.label}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {section.label}
                    </span>
                    <span className="tnum">{formatINR(section.amount * 100)}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 border-t-2 border-primary/40 pt-3">
                  <span className="font-display text-base font-semibold">
                    Total Sale
                  </span>
                  <span className="tnum font-display text-xl font-semibold text-primary">
                    {formatINR(
                      HERO_SECTIONS.reduce(
                        (sum, section) => sum + section.amount * 100,
                        0,
                      ),
                    )}
                  </span>
                </div>
                <TrendChart points={TREND} height={120} className="pt-2" />
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="how" className="border-y bg-card/60">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
            {STEPS.map((item) => (
              <div key={item.step}>
                <span className="tnum font-display text-sm font-semibold text-primary">
                  {item.step}
                </span>
                <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built like a shop ledger, not a spreadsheet
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything the counter needs, and nothing that gets in the way at
              closing time.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="h-full transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5">
                  <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                    <feature.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="sections" className="border-t bg-card/60">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                The eight sections, exactly as written today
              </h2>
              <p className="mt-3 text-muted-foreground">
                Total Sale = Cash + Online + Finance + Debt + Exchange + Cheque +
                Store use + Others. The same formula runs in the browser and on
                submit, so the number on the screen is the number stored.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/login">
                  <Button className="w-full sm:w-auto">Open the workspace</Button>
                </Link>
                <DemoButton
                  role="admin"
                  href="/admin"
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  See the admin view
                </DemoButton>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SECTION_META.map((section) => (
                <div
                  key={section.key}
                  className="rounded-lg border bg-background p-4"
                >
                  <p className="font-medium">{section.label}</p>
                  <p className="text-xs text-muted-foreground">{section.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} SK Tapri · Daily sales report</p>
          <div className="flex flex-wrap gap-4 sm:ml-auto">
            <Link href="/dashboard" className="hover:text-foreground">
              Daily report
            </Link>
            <Link href="/admin" className="hover:text-foreground">
              Admin overview
            </Link>
            <Link href="/auth/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
