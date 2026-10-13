/**
 * Deterministic demo workspace.
 *
 * The app is fully usable without Supabase credentials: this module builds a
 * believable three-week history for two branches so the landing page, the
 * report form and the admin dashboard can be explored (and verified) without a
 * backend. Numbers come from a seeded generator, so they never shuffle between
 * renders.
 */
import { addDays, todayISO } from "./format";
import { makeId } from "./report";
import type { Branch, DailyReport, Debt, ReportLine } from "./report";

export const DEMO_BRANCHES: Branch[] = [
  { id: "branch_kaza", name: "SK Kaza", isActive: true },
  { id: "branch_spillow", name: "SK Spillow", isActive: true },
];

export const DEMO_USERS = {
  admin: {
    email: "admin@sktapri.app",
    displayName: "SK Tapri Admin",
    role: "admin" as const,
    branchId: null,
  },
  branch: {
    email: "kaza@sktapri.app",
    displayName: "SK Kaza",
    role: "branch" as const,
    branchId: "branch_kaza",
  },
};

const FINANCE_LENDERS = ["Bajaj Finance", "HDB Financial", "IDFC First"];
const DEBT_PRODUCTS = [
  "Ceiling fan",
  "Mixer grinder",
  "Air cooler",
  "Steel almirah",
  "Water pump",
];
const EXCHANGE_ITEMS = ["Old fan exchange", "Old mixer exchange"];
const CHEQUE_REFS = ["Cheque 004512", "Cheque 004530", "Cheque 004561"];
const STORE_REASONS = ["Owner use", "Staff use", "Shop repair"];
const OTHER_NOTES = ["Delivery charge", "Scrap sale", "Installation"];

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)];
}

/** Random amount in whole rupees, returned as paise. */
function rupees(random: () => number, min: number, max: number): number {
  return Math.round((min + random() * (max - min)) * 100);
}

function buildDay(
  random: () => number,
  branch: Branch,
  reportDate: string,
): DailyReport {
  const weekend = ["Sat", "Sun"].includes(
    new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${reportDate}T00:00:00Z`),
    ),
  );

  const lines: ReportLine[] = [];
  const cashPaise = rupees(random, weekend ? 4000 : 9000, weekend ? 16000 : 32000);
  const onlinePaise = rupees(random, 2000, weekend ? 12000 : 18000);

  const line = (category: ReportLine["category"], label: string, min: number, max: number) =>
    lines.push({
      id: makeId("line"),
      category,
      label,
      amountPaise: rupees(random, min, max),
    });

  if (random() > 0.45) {
    line("finance", pick(random, FINANCE_LENDERS), 5000, 24000);
  }
  if (random() > 0.35) {
    line("debt", pick(random, DEBT_PRODUCTS), 1500, 9000);
  }
  if (random() > 0.75) {
    line("exchange", pick(random, EXCHANGE_ITEMS), 500, 3500);
  }
  if (random() > 0.8) {
    line("cheque", pick(random, CHEQUE_REFS), 5000, 30000);
  }
  if (random() > 0.7) {
    line("store_use", pick(random, STORE_REASONS), 200, 1800);
  }
  if (random() > 0.6) {
    line("others", pick(random, OTHER_NOTES), 300, 4000);
  }

  return {
    id: makeId("report"),
    branchId: branch.id,
    branchName: branch.name,
    reportDate,
    submittedBy: DEMO_USERS.branch.displayName,
    submittedByName: DEMO_USERS.branch.displayName,
    cashPaise,
    onlinePaise,
    lines,
    status: "active",
    voidReason: null,
    createdAt: `${reportDate}T14:20:00.000Z`,
  };
}

export function buildDemoReports(days = 21): DailyReport[] {
  const reports: DailyReport[] = [];
  for (const [index, branch] of DEMO_BRANCHES.entries()) {
    const random = seeded(20261013 + index * 977);
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const reportDate = addDays(todayISO(), -offset);
      // Occasionally a branch has not filed a report for a day.
      if (random() < 0.08) continue;
      reports.push(buildDay(random, branch, reportDate));
    }
  }
  return reports;
}

export function buildDemoDebts(reports: DailyReport[]): Debt[] {
  const random = seeded(77123);
  const debts: Debt[] = [];

  for (const report of reports) {
    for (const line of report.lines) {
      if (line.category !== "debt") continue;
      const debt: Debt = {
        id: makeId("debt"),
        branchId: report.branchId,
        productName: line.label,
        amountPaise: line.amountPaise,
        debtDate: report.reportDate,
        source: "report",
        voided: false,
        payments: [],
      };

      const roll = random();
      if (roll > 0.72) {
        debt.payments.push({
          id: makeId("pay"),
          amountPaise: debt.amountPaise,
          paidOn: addDays(report.reportDate, 4),
          note: "Cleared in cash",
        });
      } else if (roll > 0.42) {
        debt.payments.push({
          id: makeId("pay"),
          amountPaise: Math.round(debt.amountPaise * 0.4),
          paidOn: addDays(report.reportDate, 3),
          note: "Part payment",
        });
      }

      debts.push(debt);
    }
  }

  return debts.sort((a, b) => (a.debtDate < b.debtDate ? 1 : -1));
}

export function createDemoWorkspace(days = 21): {
  branches: Branch[];
  reports: DailyReport[];
  debts: Debt[];
} {
  const reports = buildDemoReports(days);
  return {
    branches: DEMO_BRANCHES,
    reports,
    debts: buildDemoDebts(reports),
  };
}
