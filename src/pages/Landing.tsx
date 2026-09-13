import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Landmark,
  NotebookPen,
  Store as StoreIcon,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/Logo";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
};

const FEATURES = [
  {
    icon: StoreIcon,
    title: "Multiple stores",
    description:
      "Add each location you run and keep every store's books in one tidy workspace.",
  },
  {
    icon: TrendingUp,
    title: "Daily totals",
    description:
      "Save total sales for the day and watch revenue build across your timeline.",
  },
  {
    icon: Banknote,
    title: "Cash & online split",
    description:
      "Record cash and online payments side by side and see the mix at a glance.",
  },
  {
    icon: Landmark,
    title: "Financed items",
    description:
      "Track financed sales separately so big-ticket deals never blur your cash view.",
  },
  {
    icon: NotebookPen,
    title: "Notes that stick",
    description:
      "A description box on every record for context — staffing, deliveries, promos, anything.",
  },
  {
    icon: CalendarClock,
    title: "Reconcile in seconds",
    description:
      "Unaccounted totals are flagged automatically, so books balance before you close up.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Add your stores",
    description: "Name each location once — from a kiosk to a chain of branches.",
  },
  {
    number: "02",
    title: "Log the day",
    description:
      "Drop in totals, cash, online payments, and financed items in under a minute.",
  },
  {
    number: "03",
    title: "Close with confidence",
    description:
      "Review the mix, spot gaps, and keep notes for the story behind the numbers.",
  },
];

const HERO_ROWS = [
  { store: "Downtown", total: "$4,920.00", note: "Lunch rush — two staff short" },
  { store: "Riverside", total: "$5,060.50", note: "Promo codes drove online sales" },
  { store: "Airport", total: "$2,500.00", note: "Quiet morning, strong evening" },
];

const AUTH_HREF = "/auth?returnTo=%2Fdashboard";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="text-base font-semibold tracking-tight">Ledgerly</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to={AUTH_HREF}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Sign in
            </Link>
            <Link
              to={AUTH_HREF}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25"
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,--theme(--color-primary/8%),transparent_70%)]"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="size-1.5 rounded-full bg-primary" />
              Built for multi-store owners
            </div>
            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Every store. Every day.{" "}
              <span className="text-primary">One clean ledger.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              Ledgerly is the simplest way to save daily sales for each of your stores —
              totals, cash and online payments, financed items, and a note for the story
              behind the numbers.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={AUTH_HREF}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 sm:w-auto"
              >
                Start tracking free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to={AUTH_HREF}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card px-6 text-sm font-semibold shadow-sm transition-colors hover:bg-accent sm:w-auto"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free to start · No spreadsheets · Works on your phone
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-14 max-w-4xl sm:mt-16"
          >
            <div className="rounded-2xl border bg-card p-2 shadow-xl shadow-primary/5">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Today · 3 stores
                    </p>
                    <p className="font-mono-num mt-1 text-2xl font-bold tracking-tight">
                      $12,480.50
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {["Cash", "Online", "Financed"].map((label) => (
                      <span
                        key={label}
                        className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {HERO_ROWS.map((row) => (
                    <div key={row.store} className="rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-md bg-accent">
                          <StoreIcon className="size-3 text-accent-foreground" />
                        </div>
                        <span className="text-sm font-medium">{row.store}</span>
                      </div>
                      <p className="font-mono-num mt-2 text-lg font-semibold">{row.total}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {row.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything a day-end close needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              No clutter, no learning curve — just the fields that matter, saved in
              seconds.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <div className="group h-full rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From open to close in three steps
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <span className="font-mono-num text-sm font-semibold text-primary">
                {step.number}
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center shadow-lg shadow-primary/20 sm:px-12 sm:py-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,--theme(--color-primary-foreground/15%),transparent_70%)]"
          />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
              Tonight's numbers, saved before you lock up
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
              Start your first ledger in under a minute. Your stores, your totals, your
              notes — all in one place.
            </p>
            <Link
              to={AUTH_HREF}
              className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-foreground px-6 text-sm font-semibold text-primary shadow-md transition-all hover:opacity-90"
            >
              Create your free account
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="font-medium text-foreground">Ledgerly</span>
          </div>
          <p>Daily sales tracking for multi-store owners.</p>
        </div>
      </footer>
    </div>
  );
}
