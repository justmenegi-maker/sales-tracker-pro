/**
 * PDF export for the admin sales report.
 *
 * Drawn with jsPDF's vector API rather than a screenshot of the dashboard so
 * the file stays sharp at any zoom and needs no layout measurement. The module
 * is imported lazily from the export card, keeping jsPDF out of the admin
 * route's initial bundle.
 */
import type { jsPDF as JsPdf } from "jspdf";
import { formatDateLabel, formatWeekdayShort } from "./format";
import { SECTION_META } from "./report";
import type { RangeSales } from "./sales-analytics";

const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 12;

const INK: RGB = [31, 94, 89];
const INK_DARK: RGB = [23, 48, 49];
const TEXT: RGB = [32, 41, 44];
const MUTED: RGB = [108, 117, 118];
const BORDER: RGB = [224, 221, 211];
const PAPER: RGB = [250, 248, 243];
const AMBER: RGB = [168, 116, 30];
const AMBER_SOFT: RGB = [251, 244, 226];
const RED: RGB = [163, 52, 42];
const GREEN_SOFT: RGB = [233, 241, 237];

type RGB = [number, number, number];

type DocState = {
  doc: JsPdf;
  y: number;
};

export type SalesPdfInput = {
  range: RangeSales;
  /** "All branches" or the selected branch name. */
  scopeLabel: string;
  generatedAt?: Date;
};

const rupee = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rupeeExact = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "Rs 1,24,500" — jsPDF's built-in fonts have no ₹ glyph. */
function money(paise: number): string {
  return `Rs ${rupee.format(Math.round(paise / 100))}`;
}

function moneyExact(paise: number): string {
  return `Rs ${rupeeExact.format(paise / 100)}`;
}

function compactMoney(paise: number): string {
  const value = paise / 100;
  if (value >= 10_000_000) return `Rs ${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `Rs ${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `Rs ${Math.round(value / 1_000)}k`;
  return `Rs ${Math.round(value)}`;
}

function percent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function generatedLabel(date: Date): string {
  const day = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${day}, ${time}`;
}

function setColor(doc: JsPdf, color: RGB, kind: "text" | "fill" | "draw") {
  if (kind === "text") doc.setTextColor(color[0], color[1], color[2]);
  else if (kind === "fill") doc.setFillColor(color[0], color[1], color[2]);
  else doc.setDrawColor(color[0], color[1], color[2]);
}

function text(
  doc: JsPdf,
  value: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    style?: "normal" | "bold" | "italic";
    color?: RGB;
    align?: "left" | "right" | "center";
    maxWidth?: number;
  } = {},
) {
  doc.setFont("helvetica", opts.style ?? "normal");
  doc.setFontSize(opts.size ?? 9);
  setColor(doc, opts.color ?? TEXT, "text");
  const lines = opts.maxWidth
    ? doc.splitTextToSize(value, opts.maxWidth)
    : [value];
  doc.text(lines, x, y, { align: opts.align ?? "left" });
  return lines.length * ((opts.size ?? 9) * 0.42);
}

function clip(doc: JsPdf, value: string, maxWidth: number): string {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function panel(
  doc: JsPdf,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: RGB = [255, 255, 255],
) {
  setColor(doc, fill, "fill");
  setColor(doc, BORDER, "draw");
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, 2.4, 2.4, "FD");
}

function sectionHeading(state: DocState, title: string, hint?: string) {
  const { doc } = state;
  text(doc, title, MARGIN, state.y, {
    size: 10.5,
    style: "bold",
    color: INK_DARK,
  });
  if (hint) {
    text(doc, hint, PAGE_WIDTH - MARGIN, state.y, {
      size: 8,
      color: MUTED,
      align: "right",
    });
  }
  state.y += 5;
}

/** Draws the running header on pages after the first. */
function addPage(state: DocState, runningTitle: string) {
  const { doc } = state;
  doc.addPage();
  state.y = 22;
  setColor(doc, INK, "fill");
  doc.rect(0, 0, PAGE_WIDTH, 12, "F");
  text(doc, "SK TAPRI", MARGIN, 8, {
    size: 8,
    style: "bold",
    color: [255, 255, 255],
  });
  text(doc, runningTitle, PAGE_WIDTH - MARGIN, 8, {
    size: 7.5,
    color: [229, 237, 234],
    align: "right",
  });
}

function ensureSpace(state: DocState, height: number, runningTitle: string) {
  if (state.y + height <= FOOTER_Y - 4) return;
  addPage(state, runningTitle);
}

function drawTable(
  state: DocState,
  runningTitle: string,
  columns: Array<{ label: string; width: number; align?: "left" | "right" }>,
  rows: string[][],
  options: { emptyText?: string; zebra?: boolean } = {},
) {
  const { doc } = state;
  const rowHeight = 6;

  const header = () => {
    setColor(doc, PAPER, "fill");
    setColor(doc, BORDER, "draw");
    doc.rect(MARGIN, state.y, CONTENT_WIDTH, 7, "FD");
    let x = MARGIN + 2.5;
    for (const column of columns) {
      text(doc, column.label.toUpperCase(), x, state.y + 4.7, {
        size: 6.6,
        style: "bold",
        color: MUTED,
      });
      x += column.width;
    }
    state.y += 7;
  };

  header();

  if (rows.length === 0) {
    text(doc, options.emptyText ?? "No data in this range.", MARGIN + 2.5, state.y + 5, {
      size: 8.5,
      color: MUTED,
    });
    state.y += 10;
    return;
  }

  rows.forEach((row, index) => {
    if (state.y + rowHeight > FOOTER_Y - 4) {
      addPage(state, runningTitle);
      header();
    }

    if (options.zebra !== false && index % 2 === 1) {
      setColor(doc, [252, 251, 248], "fill");
      doc.rect(MARGIN, state.y, CONTENT_WIDTH, rowHeight, "F");
    }

    let x = MARGIN + 2.5;
    columns.forEach((column, columnIndex) => {
      const value = row[columnIndex] ?? "";
      const single = columnIndex === 0
        ? clip(doc, value, column.width - 3)
        : value;
      if (column.align === "right") {
        text(doc, single, x + column.width - 3, state.y + 4.1, {
          size: 8,
          color: TEXT,
          align: "right",
        });
      } else {
        text(doc, single, x, state.y + 4.1, { size: 8, color: TEXT });
      }
      x += column.width;
    });

    setColor(doc, BORDER, "draw");
    doc.setLineWidth(0.15);
    doc.line(MARGIN, state.y + rowHeight, MARGIN + CONTENT_WIDTH, state.y + rowHeight);
    state.y += rowHeight;
  });

  state.y += 2;
}

function drawHeader(state: DocState, input: SalesPdfInput) {
  const { doc } = state;
  const { range, scopeLabel, generatedAt = new Date() } = input;

  setColor(doc, INK, "fill");
  doc.rect(0, 0, PAGE_WIDTH, 38, "F");

  doc.setFont("times", "bold");
  doc.setFontSize(21);
  doc.setTextColor(255, 255, 255);
  doc.text("SK TAPRI", MARGIN, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(212, 228, 222);
  doc.text("SALES PERFORMANCE REPORT", MARGIN, 23.5);
  doc.text(
    `${formatDateLabel(range.startDate)}  to  ${formatDateLabel(range.endDate)}`,
    MARGIN,
    29.5,
  );

  text(doc, "Generated", PAGE_WIDTH - MARGIN, 15, {
    size: 7,
    color: [212, 228, 222],
    align: "right",
  });
  text(doc, generatedLabel(generatedAt), PAGE_WIDTH - MARGIN, 20, {
    size: 8.5,
    style: "bold",
    color: [255, 255, 255],
    align: "right",
  });
  text(
    doc,
    range.voidedCount > 0
      ? `${scopeLabel} · ${range.voidedCount} voided excluded`
      : scopeLabel,
    PAGE_WIDTH - MARGIN,
    29.5,
    {
      size: 8,
      color: [236, 243, 240],
      align: "right",
    },
  );

  state.y = 46;
}

function drawSummaryCards(state: DocState, range: RangeSales) {
  const { doc } = state;
  const gap = 4;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const height = 26;
  const cards = [
    {
      label: "TOTAL SALE",
      value: money(range.totalPaise),
      hint: `${range.reportCount} report${range.reportCount === 1 ? "" : "s"} in range`,
      tone: INK,
    },
    {
      label: "AVG / FILED DAY",
      value: money(range.averagePerFiledDayPaise),
      hint: `${range.filedDays.length} day${range.filedDays.length === 1 ? "" : "s"} filed`,
      tone: TEXT,
    },
    {
      label: "BEST SALE DAY",
      value: range.bestDay ? money(range.bestDay.totalPaise) : "—",
      hint: range.bestDay ? formatDateLabel(range.bestDay.date) : "No sales filed",
      tone: AMBER,
    },
    {
      label: "LOWEST SALE DAY",
      value: range.lowestDay ? money(range.lowestDay.totalPaise) : "—",
      hint: range.lowestDay ? formatDateLabel(range.lowestDay.date) : "No sales filed",
      tone: TEXT,
    },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    panel(doc, x, state.y, width, height);
    setColor(doc, card.tone, "fill");
    doc.rect(x, state.y, 1.4, height, "F");
    text(doc, card.label, x + 4, state.y + 5.5, {
      size: 6.2,
      style: "bold",
      color: MUTED,
    });
    text(doc, card.value, x + 4, state.y + 12.5, {
      size: 11,
      style: "bold",
      color: card.tone,
    });
    text(doc, card.hint, x + 4, state.y + 19.5, {
      size: 7,
      color: MUTED,
    });
  });

  state.y += height + 10;
}

function drawDailyChart(state: DocState, range: RangeSales) {
  const { doc } = state;
  const { days, bestDay } = range;

  const height = 44;
  const labelGutter = 17;
  const plotX = MARGIN + labelGutter;
  const plotWidth = CONTENT_WIDTH - labelGutter - 4;
  const plotHeight = height;

  panel(doc, MARGIN, state.y, CONTENT_WIDTH, height + 26);
  text(doc, "Daily sales", MARGIN + 4, state.y + 6.5, {
    size: 9.5,
    style: "bold",
    color: INK_DARK,
  });
  text(doc, "Every day in range — gaps are days with no report", PAGE_WIDTH - MARGIN - 4, state.y + 6.5, {
    size: 7,
    color: MUTED,
    align: "right",
  });

  const top = state.y + 11;
  const bottom = top + plotHeight;
  const max = Math.max(...days.map((day) => day.totalPaise), 1);

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = bottom - plotHeight * ratio;
    setColor(doc, ratio === 0 ? BORDER : [236, 234, 227], "draw");
    doc.setLineWidth(ratio === 0 ? 0.4 : 0.2);
    doc.line(plotX, y, plotX + plotWidth, y);
    text(doc, compactMoney(max * ratio), plotX - 2.5, y + 1.6, {
      size: 5.8,
      color: MUTED,
      align: "right",
    });
  }

  const slot = plotWidth / days.length;
  const barWidth = Math.max(0.8, Math.min(4.4, slot * 0.62));
  const bestDate = bestDay?.date ?? null;

  days.forEach((day, index) => {
    const barHeight = (day.totalPaise / max) * plotHeight;
    const x = plotX + index * slot + (slot - barWidth) / 2;
    if (day.totalPaise <= 0) {
      setColor(doc, BORDER, "draw");
      doc.setLineWidth(0.4);
      doc.line(x, bottom - 0.6, x + barWidth, bottom - 0.6);
      return;
    }
    setColor(doc, day.date === bestDate ? AMBER : INK, "fill");
    doc.rect(x, bottom - barHeight, barWidth, barHeight, "F");
  });

  const labelEvery = Math.max(1, Math.ceil(days.length / 9));
  days.forEach((day, index) => {
    if (index % labelEvery !== 0 && index !== days.length - 1) return;
    const x = plotX + index * slot + slot / 2;
    text(doc, day.date.slice(8), x, bottom + 5, {
      size: 5.6,
      color: MUTED,
      align: "center",
    });
  });

  state.y += height + 26 + 4;
}

function drawDayCallouts(state: DocState, range: RangeSales) {
  const { doc } = state;
  const width = (CONTENT_WIDTH - 4) / 2;
  const height = 22;
  const items = [
    {
      title: "BEST SALE DAY",
      day: range.bestDay,
      fill: AMBER_SOFT,
      color: AMBER,
      note: range.bestDay
        ? `${percent(range.bestDay.totalPaise, range.totalPaise)} of range sale · ${formatWeekdayShort(range.bestDay.date)}`
        : "No reports filed in this range",
    },
    {
      title: "LOWEST SALE DAY",
      day: range.lowestDay,
      fill: GREEN_SOFT,
      color: INK,
      note: range.lowestDay
        ? `${percent(range.lowestDay.totalPaise, range.totalPaise)} of range sale · ${formatWeekdayShort(range.lowestDay.date)}`
        : "No reports filed in this range",
    },
  ];

  items.forEach((item, index) => {
    const x = MARGIN + index * (width + 4);
    panel(doc, x, state.y, width, height, item.fill);
    text(doc, item.title, x + 4, state.y + 5.5, {
      size: 6.4,
      style: "bold",
      color: item.color,
    });
    text(doc, item.day ? formatDateLabel(item.day.date) : "—", x + 4, state.y + 11.5, {
      size: 10,
      style: "bold",
      color: TEXT,
    });
    if (item.day) {
      text(doc, moneyExact(item.day.totalPaise), x + width - 4, state.y + 11.5, {
        size: 10,
        style: "bold",
        color: item.color,
        align: "right",
      });
    }
    text(doc, item.note, x + 4, state.y + 17.5, {
      size: 7,
      color: MUTED,
    });
  });

  state.y += height + 10;
}

function drawMonthlyChart(state: DocState, range: RangeSales) {
  const { doc } = state;
  const months = range.monthlyTrend;
  const rowHeight = 8;
  const height = months.length * rowHeight + 16;
  const labelWidth = 22;
  const amountWidth = 22;
  const trackX = MARGIN + labelWidth;
  const trackWidth = CONTENT_WIDTH - labelWidth - amountWidth - 8;
  const max = Math.max(...months.map((month) => month.totalPaise), 1);
  const currentMonth = months[months.length - 1]?.key;

  panel(doc, MARGIN, state.y, CONTENT_WIDTH, height);
  text(doc, "Monthly sales", MARGIN + 4, state.y + 6.5, {
    size: 9.5,
    style: "bold",
    color: INK_DARK,
  });
  text(doc, "Last six months in scope", PAGE_WIDTH - MARGIN - 4, state.y + 6.5, {
    size: 7,
    color: MUTED,
    align: "right",
  });

  months.forEach((month, index) => {
    const y = state.y + 12 + index * rowHeight;
    const barHeight = 4;
    const barWidth = (month.totalPaise / max) * trackWidth;

    text(doc, month.label, MARGIN + 4, y + 3.6, {
      size: 7.4,
      style: month.key === currentMonth ? "bold" : "normal",
      color: month.key === currentMonth ? TEXT : MUTED,
    });

    setColor(doc, [241, 238, 231], "fill");
    doc.roundedRect(trackX, y, trackWidth, barHeight, 1, 1, "F");
    if (barWidth > 0.6) {
      setColor(doc, month.key === currentMonth ? AMBER : INK, "fill");
      doc.roundedRect(trackX, y, Math.max(1, barWidth), barHeight, 1, 1, "F");
    }

    text(doc, money(month.totalPaise), PAGE_WIDTH - MARGIN - 4, y + 3.7, {
      size: 7.4,
      style: "bold",
      color: TEXT,
      align: "right",
    });
  });

  state.y += height + 10;
}

function drawSectionMix(state: DocState, range: RangeSales) {
  const { doc } = state;
  const rows = SECTION_META.map((section) => {
    const amount = range.sectionTotals[section.key];
    return { label: section.label, amount };
  }).filter((row) => row.amount > 0);

  sectionHeading(state, "Where the money came from", "Share of Total Sale in range");

  if (rows.length === 0) {
    text(doc, "No section amounts recorded in this range.", MARGIN, state.y + 4, {
      size: 8.5,
      color: MUTED,
    });
    state.y += 10;
    return;
  }

  const trackWidth = 74;
  const trackX = MARGIN + 42;
  const rowHeight = 6.4;

  rows.forEach((row) => {
    ensureSpace(state, rowHeight, "Sales performance report");
    const share = range.totalPaise > 0 ? row.amount / range.totalPaise : 0;

    text(doc, row.label, MARGIN, state.y + 4, { size: 8, color: TEXT });
    setColor(doc, [241, 238, 231], "fill");
    doc.roundedRect(trackX, state.y + 1.6, trackWidth, 3.2, 1, 1, "F");
    if (share > 0) {
      setColor(doc, row.label === "Cash" ? INK : [104, 138, 130], "fill");
      doc.roundedRect(
        trackX,
        state.y + 1.6,
        Math.max(1.2, trackWidth * share),
        3.2,
        1,
        1,
        "F",
      );
    }
    text(doc, percent(row.amount, range.totalPaise), trackX + trackWidth + 4, state.y + 4, {
      size: 7.4,
      color: MUTED,
    });
    text(doc, money(row.amount), PAGE_WIDTH - MARGIN, state.y + 4, {
      size: 8,
      style: "bold",
      color: TEXT,
      align: "right",
    });
    state.y += rowHeight;
  });

  state.y += 6;
}

function drawBranchTable(state: DocState, range: RangeSales) {
  if (range.branchSlices.length < 2) return;

  sectionHeading(state, "Branch breakdown", "Ranked by Total Sale");

  drawTable(
    state,
    "Sales performance report",
    [
      { label: "Branch", width: CONTENT_WIDTH - 74 },
      { label: "Reports", width: 18, align: "right" },
      { label: "Share", width: 18, align: "right" },
      { label: "Total Sale", width: 38, align: "right" },
    ],
    range.branchSlices.map((branch) => [
      branch.branchName,
      String(branch.reports),
      percent(branch.totalPaise, range.totalPaise),
      money(branch.totalPaise),
    ]),
  );

  state.y += 4;
}

function drawDailyLedger(state: DocState, range: RangeSales) {
  sectionHeading(
    state,
    "Daily ledger",
    `${formatDateLabel(range.startDate)} – ${formatDateLabel(range.endDate)}`,
  );

  drawTable(
    state,
    "Sales performance report",
    [
      { label: "Date", width: 36 },
      { label: "Day", width: 20 },
      { label: "Filed", width: 22 },
      { label: "Reports", width: 24, align: "right" },
      { label: "Total Sale", width: 42, align: "right" },
      { label: "Share", width: 38, align: "right" },
    ],
    range.days.map((day) => [
      formatDateLabel(day.date),
      formatWeekdayShort(day.date),
      day.reports > 0 ? "Yes" : "Missing",
      day.reports > 0 ? String(day.reports) : "—",
      day.reports > 0 ? money(day.totalPaise) : "—",
      day.reports > 0 ? percent(day.totalPaise, range.totalPaise) : "—",
    ]),
    { emptyText: "No days in this range." },
  );
}

/** Notes the branch left with a filed report, shown next to the day's sale. */
function drawDailyNotes(state: DocState, range: RangeSales) {
  const withNotes = range.reports.filter(
    (summary) => (summary.report.note ?? "").trim().length > 0,
  );
  if (withNotes.length === 0) return;

  sectionHeading(
    state,
    "Daily notes",
    `${withNotes.length} day${withNotes.length === 1 ? "" : "s"} with a note`,
  );

  for (const summary of withNotes) {
    const note = (summary.report.note ?? "").trim();
    const lines = state.doc.splitTextToSize(note, CONTENT_WIDTH - 8) as string[];
    const height = 9 + lines.length * 3.6;
    ensureSpace(state, height + 3, "Sales performance report");
    panel(state.doc, MARGIN, state.y, CONTENT_WIDTH, height, PAPER);

    text(
      state.doc,
      `${formatDateLabel(summary.report.reportDate)} · ${summary.report.branchName}`,
      MARGIN + 4,
      state.y + 5,
      { size: 7.6, style: "bold", color: TEXT },
    );
    text(
      state.doc,
      moneyExact(summary.totalPaise),
      PAGE_WIDTH - MARGIN - 4,
      state.y + 5,
      { size: 7.6, style: "bold", color: TEXT, align: "right" },
    );
    text(state.doc, note, MARGIN + 4, state.y + 9, {
      size: 7.4,
      color: TEXT,
      maxWidth: CONTENT_WIDTH - 8,
    });
    state.y += height + 2.5;
  }

  state.y += 3;
}

function drawReviewSummary(state: DocState, range: RangeSales) {
  const counts = { pending: 0, ok: 0, concern: 0 };
  for (const summary of range.reports) counts[summary.report.reviewStatus] += 1;

  sectionHeading(state, "Daily report review", "Admin check status for this range");

  const { doc } = state;
  const gap = 4;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const cards = [
    { label: "TICKED OK", value: counts.ok, color: INK },
    { label: "CONCERNS", value: counts.concern, color: RED },
    { label: "AWAITING REVIEW", value: counts.pending, color: AMBER },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    panel(doc, x, state.y, width, 16);
    text(doc, card.label, x + 3.5, state.y + 5, {
      size: 6.2,
      style: "bold",
      color: MUTED,
    });
    text(doc, String(card.value), x + 3.5, state.y + 12, {
      size: 12,
      style: "bold",
      color: card.color,
    });
  });
  state.y += 22;

  const concerns = range.reports.filter(
    (summary) => summary.report.reviewStatus === "concern",
  );
  if (concerns.length > 0) {
    text(doc, "Flagged concerns", MARGIN, state.y, {
      size: 8.5,
      style: "bold",
      color: TEXT,
    });
    state.y += 4;

    for (const summary of concerns) {
      const note = summary.report.reviewNote ?? "No note recorded";
      const lines = doc.splitTextToSize(note, CONTENT_WIDTH - 8) as string[];
      const height = 9 + lines.length * 3.6;
      ensureSpace(state, height, "Sales performance report");
      panel(doc, MARGIN, state.y, CONTENT_WIDTH, height, AMBER_SOFT);

      const label = `${formatDateLabel(summary.report.reportDate)} · ${summary.report.branchName}`;
      text(doc, label, MARGIN + 4, state.y + 5, {
        size: 7.6,
        style: "bold",
        color: TEXT,
      });
      text(doc, moneyExact(summary.totalPaise), PAGE_WIDTH - MARGIN - 4, state.y + 5, {
        size: 7.6,
        style: "bold",
        color: TEXT,
        align: "right",
      });
      text(doc, note, MARGIN + 4, state.y + 9, {
        size: 7.4,
        color: TEXT,
        maxWidth: CONTENT_WIDTH - 8,
      });
      state.y += height + 2.5;
    }
    state.y += 3;
  }

  const pending = range.reports.filter(
    (summary) => summary.report.reviewStatus === "pending",
  );
  if (pending.length > 0) {
    const pendingLabel = pending
      .map(
        (summary) =>
          `${formatDateLabel(summary.report.reportDate)} (${summary.report.branchName})`,
      )
      .join("  ·  ");
    const wrapped = doc.splitTextToSize(pendingLabel, CONTENT_WIDTH) as string[];
    ensureSpace(state, 10 + wrapped.length * 3.4, "Sales performance report");

    text(
      doc,
      `${pending.length} report${pending.length === 1 ? "" : "s"} still awaiting review:`,
      MARGIN,
      state.y + 2,
      { size: 8, color: MUTED },
    );
    state.y += 5;
    text(doc, pendingLabel, MARGIN, state.y + 3, {
      size: 7.4,
      color: TEXT,
      maxWidth: CONTENT_WIDTH,
    });
    state.y += wrapped.length * 3.4 + 6;
  }
}

function drawFooters(doc: JsPdf) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    setColor(doc, BORDER, "draw");
    doc.setLineWidth(0.25);
    doc.line(MARGIN, FOOTER_Y - 3, PAGE_WIDTH - MARGIN, FOOTER_Y - 3);
    text(doc, "SK Tapri · sales report", MARGIN, FOOTER_Y, {
      size: 6.8,
      color: MUTED,
    });
    text(doc, `Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, FOOTER_Y, {
      size: 6.8,
      color: MUTED,
      align: "right",
    });
  }
}

export function salesPdfFilename(range: RangeSales, scopeLabel: string): string {
  const scope = scopeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `sk-tapri-sales-${range.startDate}-to-${range.endDate}${scope ? `-${scope}` : ""}.pdf`;
}

/** Build the PDF without touching the download flow (also used by tests). */
export async function buildSalesPdf(
  input: SalesPdfInput,
): Promise<{ doc: JsPdf; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({
    title: `SK Tapri sales report ${input.range.startDate} to ${input.range.endDate}`,
    subject: "Monthly, weekly and custom sales report",
    author: "SK Tapri",
    creator: "SK Tapri daily sales",
  });

  const state: DocState = { doc, y: 46 };
  const runningTitle = `${formatDateLabel(input.range.startDate)} – ${formatDateLabel(input.range.endDate)} · ${input.scopeLabel}`;

  drawHeader(state, input);
  drawSummaryCards(state, input.range);
  drawDailyChart(state, input.range);
  drawDayCallouts(state, input.range);
  drawMonthlyChart(state, input.range);

  addPage(state, runningTitle);
  drawSectionMix(state, input.range);
  drawBranchTable(state, input.range);
  drawDailyLedger(state, input.range);
  drawDailyNotes(state, input.range);

  ensureSpace(state, 34, runningTitle);
  drawReviewSummary(state, input.range);

  drawFooters(doc);

  return {
    doc,
    filename: salesPdfFilename(input.range, input.scopeLabel),
  };
}

/**
 * Build the PDF and hand it to the browser's download flow.
 * Returns the file name so the caller can confirm what was saved.
 */
export async function downloadSalesPdf(
  input: SalesPdfInput,
): Promise<string> {
  const { doc, filename } = await buildSalesPdf(input);
  doc.save(filename);
  return filename;
}
