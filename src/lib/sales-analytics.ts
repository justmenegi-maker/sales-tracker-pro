/**
 * Analytics for the admin sales export.
 *
 * Everything here is pure and derived from `summarizeReports` output, so the
 * PDF, the preview tiles and the tests all read the same numbers. Totals are
 * always integer paise; nothing in this module formats money.
 */
import { addDays } from "./format";
import type { ReportSummary, SectionKey } from "./report";

export type DailySalePoint = {
  date: string;
  totalPaise: number;
  reports: number;
};

export type MonthlySalePoint = {
  /** yyyy-mm */
  key: string;
  /** "Oct 2026" */
  label: string;
  totalPaise: number;
  reports: number;
};

export type BranchSaleSlice = {
  branchId: string;
  branchName: string;
  totalPaise: number;
  reports: number;
};

export type RangeSales = {
  startDate: string;
  endDate: string;
  /** Every day in the range, zero-filled, so gaps are visible. */
  days: DailySalePoint[];
  /** Days that actually had at least one report filed. */
  filedDays: DailySalePoint[];
  totalPaise: number;
  reportCount: number;
  averagePerFiledDayPaise: number;
  /**
   * Best and lowest are taken over filed days only. A day with no report is a
   * missing filing, not a zero-sale day, and must not win "lowest".
   */
  bestDay: DailySalePoint | null;
  lowestDay: DailySalePoint | null;
  branchSlices: BranchSaleSlice[];
  sectionTotals: Record<SectionKey, number>;
  /**
   * Money paid out on the same active reports. Kept beside `totalPaise` and
   * never inside it, exactly like the report form: `totalPaise - expensePaise`
   * is the cash actually left in hand for the range.
   */
  expensePaise: number;
  /** Last six months ending with the range's end month. */
  monthlyTrend: MonthlySalePoint[];
  /** Reports in range that were voided and therefore excluded. */
  voidedCount: number;
  /** Active reports in range, oldest first, for the review appendix. */
  reports: ReportSummary[];
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function emptySections(): Record<SectionKey, number> {
  return {
    cash: 0,
    online: 0,
    finance: 0,
    debt: 0,
    exchange: 0,
    cheque: 0,
    store_use: 0,
    others: 0,
  };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const label = MONTH_LABELS[month - 1];
  return label && year ? `${label} ${year}` : key;
}

/** Shift a yyyy-mm key by whole months. */
export function shiftMonth(key: string, months: number): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/** First day of the month containing `date`. */
export function startOfMonth(date: string): string {
  return `${monthKey(date)}-01`;
}

/** Last day of the month containing `date`. */
export function endOfMonth(date: string): string {
  const next = shiftMonth(monthKey(date), 1);
  const [year, month] = next.split("-").map(Number);
  return addDays(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`,
    -1,
  );
}

/** Daily/monthly series covering last six months ending in the range's month. */
function monthlyTrendFor(
  summaries: ReportSummary[],
  endDate: string,
  months = 6,
): MonthlySalePoint[] {
  const endMonth = monthKey(endDate);
  const keys: string[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    keys.push(shiftMonth(endMonth, -offset));
  }

  const byMonth = new Map<string, { totalPaise: number; reports: number }>();
  for (const key of keys) byMonth.set(key, { totalPaise: 0, reports: 0 });

  for (const summary of summaries) {
    if (summary.report.status !== "active") continue;
    const key = monthKey(summary.report.reportDate);
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    bucket.totalPaise += summary.totalPaise;
    bucket.reports += 1;
  }

  return keys.map((key) => ({
    key,
    label: monthLabel(key),
    totalPaise: byMonth.get(key)?.totalPaise ?? 0,
    reports: byMonth.get(key)?.reports ?? 0,
  }));
}

/**
 * Build every number the PDF and the export preview need.
 *
 * `summaries` may span more than the requested range: the six-month trend is
 * read from the same list, which keeps the export to one pass over the reports.
 */
export function buildRangeSales(
  summaries: ReportSummary[],
  startDate: string,
  endDate: string,
): RangeSales {
  const validRange = startDate <= endDate;
  const start = validRange ? startDate : endDate;
  const end = validRange ? endDate : startDate;

  const inRange: ReportSummary[] = [];
  let voidedCount = 0;

  for (const summary of summaries) {
    const date = summary.report.reportDate;
    if (date < start || date > end) continue;
    if (summary.report.status !== "active") {
      voidedCount += 1;
      continue;
    }
    inRange.push(summary);
  }

  const byDate = new Map<string, DailySalePoint>();
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    byDate.set(cursor, { date: cursor, totalPaise: 0, reports: 0 });
  }

  const branchSlices = new Map<string, BranchSaleSlice>();
  const sectionTotals = emptySections();
  let totalPaise = 0;
  let expensePaise = 0;
  let reportCount = 0;

  for (const summary of inRange) {
    const date = summary.report.reportDate;
    const point = byDate.get(date);
    if (point) {
      point.totalPaise += summary.totalPaise;
      point.reports += 1;
    }

    totalPaise += summary.totalPaise;
    expensePaise += summary.expensePaise;
    reportCount += 1;

    for (const key of Object.keys(sectionTotals) as SectionKey[]) {
      sectionTotals[key] += summary.sections[key];
    }

    const branch = branchSlices.get(summary.report.branchId) ?? {
      branchId: summary.report.branchId,
      branchName: summary.report.branchName,
      totalPaise: 0,
      reports: 0,
    };
    branch.totalPaise += summary.totalPaise;
    branch.reports += 1;
    branchSlices.set(summary.report.branchId, branch);
  }

  const days = [...byDate.values()];
  const filedDays = days.filter((day) => day.reports > 0);

  let bestDay: DailySalePoint | null = null;
  let lowestDay: DailySalePoint | null = null;
  for (const day of filedDays) {
    if (!bestDay || day.totalPaise > bestDay.totalPaise) bestDay = day;
    if (!lowestDay || day.totalPaise < lowestDay.totalPaise) lowestDay = day;
  }

  return {
    startDate: start,
    endDate: end,
    days,
    filedDays,
    totalPaise,
    reportCount,
    averagePerFiledDayPaise:
      filedDays.length > 0 ? Math.round(totalPaise / filedDays.length) : 0,
    bestDay,
    lowestDay,
    branchSlices: [...branchSlices.values()].sort(
      (a, b) => b.totalPaise - a.totalPaise,
    ),
    sectionTotals,
    expensePaise,
    monthlyTrend: monthlyTrendFor(summaries, end),
    voidedCount,
    reports: [...inRange].sort((a, b) =>
      a.report.reportDate < b.report.reportDate ? -1 : 1,
    ),
  };
}

/**
 * Performance context for one report, used by the admin review sheet.
 *
 * The "usual" figure is the same branch's average over the seven days before
 * the report (filed days only, excluding the report itself). Returning null
 * keeps the UI honest when there is nothing to compare against yet.
 */
export type ReportContext = {
  typicalPaise: number | null;
  sampleDays: number;
  previousDay: DailySalePoint | null;
  changeVsTypical: number | null;
  bestInRange: DailySalePoint | null;
  lowestInRange: DailySalePoint | null;
};

export function reportContext(
  summaries: ReportSummary[],
  current: ReportSummary,
): ReportContext {
  const report = current.report;
  const previousDate = addDays(report.reportDate, -1);
  const windowStart = addDays(report.reportDate, -7);

  const byDate = new Map<string, DailySalePoint>();

  for (const summary of summaries) {
    if (summary.report.status !== "active") continue;
    if (summary.report.branchId !== report.branchId) continue;
    if (summary.report.reportDate >= report.reportDate) continue;

    const date = summary.report.reportDate;
    const point = byDate.get(date) ?? { date, totalPaise: 0, reports: 0 };
    point.totalPaise += summary.totalPaise;
    point.reports += 1;
    byDate.set(date, point);
  }

  let bestInRange: DailySalePoint | null = null;
  let lowestInRange: DailySalePoint | null = null;
  for (const point of byDate.values()) {
    if (point.date < windowStart || point.date > previousDate) continue;
    if (!bestInRange || point.totalPaise > bestInRange.totalPaise) bestInRange = point;
    if (!lowestInRange || point.totalPaise < lowestInRange.totalPaise) lowestInRange = point;
  }

  const windowTotals = [...byDate.values()].filter(
    (point) => point.date >= windowStart && point.date <= previousDate,
  );
  const typicalPaise =
    windowTotals.length > 0
      ? Math.round(
          windowTotals.reduce((sum, point) => sum + point.totalPaise, 0) /
            windowTotals.length,
        )
      : null;

  return {
    typicalPaise,
    sampleDays: windowTotals.length,
    previousDay: byDate.get(previousDate) ?? null,
    changeVsTypical:
      typicalPaise && typicalPaise > 0
        ? Math.round(((current.totalPaise - typicalPaise) / typicalPaise) * 100)
        : null,
    bestInRange,
    lowestInRange,
  };
}
