/**
 * PDF export for the admin sales report.
 *
 * Drawn with jsPDF's vector API rather than a screenshot of the dashboard so
 * the file stays sharp at any zoom and needs no layout measurement. The module
 * is imported lazily from the export card, keeping jsPDF out of the admin
 * route's initial bundle.
 *
 * Layout is deliberately split in two: page one is the visual summary (hero
 * numbers, daily bars, payment-mix donut, monthly trend) and the appendix that
 * follows is the audit trail (branch comparison, daily ledger, notes, review).
 */
import type { jsPDF as JsPdf } from "jspdf";
import { formatDateLabel, formatWeekdayShort } from "./format";
import { SECTION_META } from "./report";
import type { SectionKey } from "./report";
import type { RangeSales } from "./sales-analytics";

const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT = PAGE_WIDTH - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 12;

const INK: RGB = [18, 76, 71];
const INK_DEEP: RGB = [12, 45, 43];
const INK_SOFT: RGB = [66, 122, 114];
const SAGE: RGB = [139, 172, 159];
const TEXT: RGB = [33, 41, 42];
const MUTED: RGB = [118, 126, 124];
const BORDER: RGB = [228, 224, 213];
const PAPER: RGB = [250, 248, 242];
const CREAM: RGB = [246, 241, 229];
const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [190, 142, 52];
const GOLD_DEEP: RGB = [152, 107, 28];
const RED: RGB = [176, 58, 44];
const RED_SOFT: RGB = [251, 235, 232];

/** One colour per payment mode, so the donut and its legend always agree. */
const MODE_COLORS: Record<SectionKey, RGB> = {
  cash: INK,
  online: [82, 137, 129],
  finance: GOLD,
  debt: [193, 107, 69],
  exchange: SAGE,
  cheque: [95, 119, 141],
  store_use: [159, 133, 89],
  others: [181, 183, 172],
};

/**
 * Advance money added to a sale day. It is part of Total Sale but is not one of
 * the eight payment modes, so it gets its own slice instead of being folded
 * into a mode it did not come through.
 */
const ADVANCE_COLOR: RGB = [124, 96, 138];

type MixKey = SectionKey | "advance";

function mixColor(key: MixKey): RGB {
  return key === "advance" ? ADVANCE_COLOR : MODE_COLORS[key];
}

type RGB = [number, number, number];

type DocState = {
  doc: JsPdf;
  y: number;
};

type Cell =
  | string
  | { value: string; color?: RGB; bold?: boolean; align?: "left" | "right" };

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

function shortDate(date: string): string {
  return formatDateLabel(date).replace(/,?\s*\d{4}$/, "");
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

/** Small uppercase label with a little letter-spacing, used for eyebrows. */
function eyebrow(
  doc: JsPdf,
  value: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: RGB;
    align?: "left" | "right" | "center";
    spacing?: number;
  } = {},
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(opts.size ?? 6.2);
  const spacing = opts.spacing ?? 0.7;
  const align = opts.align ?? "left";
  doc.setCharSpace(spacing);
  setColor(doc, opts.color ?? MUTED, "text");
  // jsPDF aligns on the unspaced width but still paints the trailing spacing,
  // so a right-aligned letterspaced label would creep off the page edge.
  const shift =
    align === "right"
      ? value.length * spacing
      : align === "center"
        ? (value.length * spacing) / 2
        : 0;
  doc.text(value, x - shift, y, { align });
  doc.setCharSpace(0);
}

/** Draws text at the largest size that still fits, down to `min`. */
function fitText(
  doc: JsPdf,
  value: string,
  maxWidth: number,
  size: number,
  min: number,
): number {
  let current = size;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(current);
  while (current > min && doc.getTextWidth(value) > maxWidth) {
    current -= 0.5;
    doc.setFontSize(current);
  }
  return current;
}

function clip(doc: JsPdf, value: string, maxWidth: number): string {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function hairline(
  doc: JsPdf,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGB = BORDER,
  width = 0.2,
) {
  setColor(doc, color, "draw");
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

function panel(
  doc: JsPdf,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: RGB = WHITE,
  border: RGB = BORDER,
  radius = 3,
) {
  setColor(doc, fill, "fill");
  setColor(doc, border, "draw");
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, radius, radius, "FD");
}

/** Soft decorative circle; resets to fully opaque afterwards. */
function tintCircle(
  doc: JsPdf,
  x: number,
  y: number,
  radius: number,
  opacity: number,
  color: RGB = WHITE,
) {
  doc.setGState(doc.GState({ opacity }));
  setColor(doc, color, "fill");
  doc.circle(x, y, radius, "F");
  doc.setGState(doc.GState({ opacity: 1 }));
}

/**
 * Filled pie wedge built from a triangle fan.
 *
 * jsPDF has no arc primitive, so a fan of small triangles is the cheapest
 * vector-correct way to paint a slice at any zoom.
 */
function wedge(
  doc: JsPdf,
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  color: RGB,
) {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.05) return;
  const steps = Math.max(2, Math.ceil(sweep / 4));
  setColor(doc, color, "fill");
  let previous = (startDeg * Math.PI) / 180;
  for (let step = 1; step <= steps; step += 1) {
    const next = ((startDeg + (sweep * step) / steps) * Math.PI) / 180;
    doc.triangle(
      cx,
      cy,
      cx + radius * Math.cos(previous),
      cy + radius * Math.sin(previous),
      cx + radius * Math.cos(next),
      cy + radius * Math.sin(next),
      "F",
    );
    previous = next;
  }
}

function sectionHeading(state: DocState, title: string, hint?: string) {
  const { doc } = state;
  state.y += 3;
  setColor(doc, GOLD, "fill");
  doc.rect(MARGIN, state.y - 2.6, 1.8, 1.8, "F");
  text(doc, title, MARGIN + 4, state.y, {
    size: 10.5,
    style: "bold",
    color: INK_DEEP,
  });
  if (hint) {
    text(doc, hint, RIGHT, state.y, {
      size: 7,
      color: MUTED,
      align: "right",
    });
  }  hairline(doc, MARGIN, state.y + 2.6, RIGHT, state.y + 2.6);
  state.y += 7;
}

/** Draws the running header on pages after the first. */
function addPage(state: DocState, runningTitle: string) {
  const { doc } = state;
  doc.addPage();
  state.y = 20;
  setColor(doc, INK_DEEP, "fill");
  doc.rect(0, 0, PAGE_WIDTH, 11, "F");
  setColor(doc, GOLD, "fill");
  doc.rect(MARGIN, 4.4, 1.6, 1.6, "F");
  text(doc, "SK TAPRI", MARGIN + 3.6, 7.4, {
    size: 7.2,
    style: "bold",
    color: WHITE,
  });
  text(doc, runningTitle, RIGHT, 7.4, {
    size: 6.8,
    color: [199, 220, 212],
    align: "right",
  });
}

function ensureSpace(state: DocState, height: number, runningTitle: string) {
  if (state.y + height <= FOOTER_Y - 6) return;
  addPage(state, runningTitle);
}

function drawTable(
  state: DocState,
  runningTitle: string,
  columns: Array<{
    label: string;
    width: number;
    align?: "left" | "right";
  }>,
  rows: Cell[][],
  options: { emptyText?: string; zebra?: boolean } = {},
) {
  const { doc } = state;
  const rowHeight = 6.3;
  const headerHeight = 7.2;

  const header = () => {
    setColor(doc, CREAM, "fill");
    doc.rect(MARGIN, state.y, CONTENT_WIDTH, headerHeight, "F");
    setColor(doc, GOLD, "fill");
    doc.rect(MARGIN, state.y, CONTENT_WIDTH, 0.5, "F");
    let x = MARGIN + 3;
    for (const column of columns) {
      eyebrow(doc, column.label, x, state.y + 5, {
        size: 6,
        color: MUTED,
        spacing: 0.5,
        align: column.align === "right" ? "right" : "left",
      });
      x += column.width;
    }
    state.y += headerHeight;
  };

  header();

  if (rows.length === 0) {
    text(
      doc,
      options.emptyText ?? "No data in this range.",
      MARGIN + 3,
      state.y + 5.4,
      { size: 8.2, color: MUTED },
    );
    state.y += 11;
    return;
  }

  rows.forEach((row, index) => {
    if (state.y + rowHeight > FOOTER_Y - 6) {
      addPage(state, runningTitle);
      header();
    }

    if (options.zebra !== false && index % 2 === 1) {
      setColor(doc, [252, 250, 245], "fill");
      doc.rect(MARGIN, state.y, CONTENT_WIDTH, rowHeight, "F");
    }

    let x = MARGIN + 3;
    columns.forEach((column, columnIndex) => {
      const raw = row[columnIndex] ?? "";
      const cell: Exclude<Cell, string> =
        typeof raw === "string" ? { value: raw } : raw;
      const align = cell.align ?? column.align ?? "left";
      const value =
        align === "right"
          ? cell.value
          : clip(doc, cell.value, column.width - 4);
      text(doc, value, align === "right" ? x + column.width - 3 : x, state.y + 4.3, {
        size: 7.8,
        style: cell.bold ? "bold" : "normal",
        color: cell.color ?? TEXT,
        align,
      });
      x += column.width;
    });

    hairline(doc, MARGIN, state.y + rowHeight, RIGHT, state.y + rowHeight);
    state.y += rowHeight;
  });

  state.y += 2;
}

function drawHeader(state: DocState, input: SalesPdfInput) {
  const { doc } = state;
  const { range, scopeLabel, generatedAt = new Date() } = input;

  setColor(doc, INK_DEEP, "fill");
  doc.rect(0, 0, PAGE_WIDTH, 42, "F");

  // Soft brand shapes: drawn past the page edge, so the page itself clips them.
  tintCircle(doc, 184, 0, 30, 0.09);
  tintCircle(doc, 205, 33, 22, 0.07);
  tintCircle(doc, 150, 44, 18, 0.06, GOLD);

  setColor(doc, GOLD, "fill");
  doc.rect(0, 41.2, PAGE_WIDTH, 0.8, "F");

  // Monogram
  setColor(doc, WHITE, "fill");
  doc.roundedRect(MARGIN, 12.5, 12, 12, 2.6, 2.6, "F");
  text(doc, "SK", MARGIN + 6, 20.7, {
    size: 8.4,
    style: "bold",
    color: INK_DEEP,
    align: "center",
  });

  text(doc, "SK TAPRI", MARGIN + 16, 19.5, {
    size: 17,
    style: "bold",
    color: WHITE,
  });
  eyebrow(doc, "DAILY SALES REPORT", MARGIN + 16, 25, {
    size: 6.3,
    color: [186, 212, 203],
    spacing: 1.1,
  });
  text(doc, "Point of sale · all figures in INR", MARGIN + 16, 31.4, {
    size: 7,
    color: [166, 198, 189],
  });

  const rangeLabel = `${formatDateLabel(range.startDate)}  —  ${formatDateLabel(range.endDate)}`;
  text(doc, rangeLabel, RIGHT, 18.4, {
    size: 10.5,
    style: "bold",
    color: WHITE,
    align: "right",
  });
  eyebrow(
    doc,
    range.voidedCount > 0
      ? `${scopeLabel} · ${range.voidedCount} VOIDED EXCLUDED`
      : scopeLabel,
    RIGHT,
    24.4,
    { size: 6.2, color: [231, 205, 150], spacing: 0.7, align: "right" },
  );
  text(doc, `Generated ${generatedLabel(generatedAt)}`, RIGHT, 31.4, {
    size: 6.8,
    color: [166, 198, 189],
    align: "right",
  });

  state.y = 50;
}

function drawKpis(state: DocState, range: RangeSales) {
  const { doc } = state;
  const y = state.y;
  const heroWidth = 78;
  const heroHeight = 36;

  setColor(doc, INK, "fill");
  doc.roundedRect(MARGIN, y, heroWidth, heroHeight, 3, 3, "F");
  tintCircle(doc, MARGIN + heroWidth - 4, y + heroHeight + 6, 18, 0.08);

  eyebrow(doc, "TOTAL SALE", MARGIN + 5, y + 6.6, {
    size: 6,
    color: [170, 203, 193],
    spacing: 0.9,
  });
  const total = money(range.totalPaise);
  text(doc, total, MARGIN + 5, y + 17, {
    size: fitText(doc, total, heroWidth - 10, 18, 11),
    style: "bold",
    color: WHITE,
  });
  hairline(
    doc,
    MARGIN + 5,
    y + 21.5,
    MARGIN + heroWidth - 5,
    y + 21.5,
    [67, 119, 111],
    0.2,
  );
  text(
    doc,
    `${range.reportCount} report${range.reportCount === 1 ? "" : "s"} · ${range.filedDays.length} day${range.filedDays.length === 1 ? "" : "s"} filed${range.advancePaise > 0 ? " · incl. advance" : ""}`,
    MARGIN + 5,
    y + 26.6,
    { size: 6.8, color: [190, 215, 207] },
  );
  text(
    doc,
    range.expensePaise > 0
      ? `Expenses ${money(range.expensePaise)} · Net ${money(range.totalPaise - range.expensePaise)}`
      : `Average ${money(range.averagePerFiledDayPaise)} per filed day`,
    MARGIN + 5,
    y + 31.6,
    {
      size: 6.8,
      style: range.expensePaise > 0 ? "bold" : "normal",
      color: range.expensePaise > 0 ? [242, 219, 166] : [190, 215, 207],
    },
  );

  const tileX = MARGIN + heroWidth + 4;
  const gap = 4;
  const tileWidth = (CONTENT_WIDTH - heroWidth - 4 - gap) / 2;
  const tileHeight = 16;
  const tiles = [
    {
      label: "AVG / FILED DAY",
      value: money(range.averagePerFiledDayPaise),
      hint: `${range.filedDays.length} day${range.filedDays.length === 1 ? "" : "s"} filed`,
      tone: INK,
    },
    {
      label: "REPORTS",
      value: String(range.reportCount),
      hint:
        range.voidedCount > 0
          ? `${range.voidedCount} voided excluded`
          : "No voids in range",
      tone: TEXT,
    },
    {
      label: "BEST SALE DAY",
      value: range.bestDay ? money(range.bestDay.totalPaise) : "—",
      hint: range.bestDay
        ? `${formatWeekdayShort(range.bestDay.date)} ${shortDate(range.bestDay.date)}`
        : "No sales filed",
      tone: GOLD_DEEP,
    },
    {
      label: "LOWEST SALE DAY",
      value: range.lowestDay ? money(range.lowestDay.totalPaise) : "—",
      hint: range.lowestDay
        ? `${formatWeekdayShort(range.lowestDay.date)} ${shortDate(range.lowestDay.date)}`
        : "No sales filed",
      tone: INK_SOFT,
    },
  ];

  tiles.forEach((tile, index) => {
    const x = tileX + (index % 2) * (tileWidth + gap);
    const tileY = y + Math.floor(index / 2) * (tileHeight + gap);
    panel(doc, x, tileY, tileWidth, tileHeight);
    setColor(doc, tile.tone, "fill");
    doc.rect(x, tileY + 3, 1.2, 4, "F");
    eyebrow(doc, tile.label, x + 4, tileY + 4.8, {
      size: 5.6,
      spacing: 0.4,
    });
    const value = tile.value;
    text(doc, value, x + 4, tileY + 11, {
      size: fitText(doc, value, tileWidth - 8, 9, 6.5),
      style: "bold",
      color: tile.tone,
    });
    text(doc, clip(doc, tile.hint, tileWidth - 8), x + 4, tileY + 14.4, {
      size: 5.8,
      color: MUTED,
    });
  });

  state.y = y + heroHeight + 7;
}

function drawDailyChart(state: DocState, range: RangeSales) {
  const { doc } = state;
  const { days, bestDay } = range;

  const height = 58;
  const top = state.y + 15;
  const plotHeight = 29;
  const bottom = top + plotHeight;
  const plotX = MARGIN + 16;
  const plotWidth = RIGHT - 5 - plotX;

  panel(doc, MARGIN, state.y, CONTENT_WIDTH, height);
  text(doc, "Daily sales", MARGIN + 5, state.y + 7.4, {
    size: 10.5,
    style: "bold",
    color: INK_DEEP,
  });
  text(
    doc,
    "Every day in range — gaps are days with no report",
    RIGHT - 5,
    state.y + 7.4,
    { size: 6.8, color: MUTED, align: "right" },
  );

  const max = Math.max(...days.map((day) => day.totalPaise), 1);

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = bottom - plotHeight * ratio;
    if (ratio === 0) {
      hairline(doc, plotX, y, plotX + plotWidth, y, BORDER, 0.4);
    } else {
      doc.setLineDashPattern([1.4, 1.6], 0);
      hairline(doc, plotX, y, plotX + plotWidth, y, [236, 233, 224], 0.2);
      doc.setLineDashPattern([], 0);
    }
    text(doc, compactMoney(max * ratio), plotX - 2.5, y + 1.5, {
      size: 5.6,
      color: MUTED,
      align: "right",
    });
  }

  const slot = plotWidth / days.length;
  const barWidth = Math.max(0.8, Math.min(4.6, slot * 0.62));
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
    setColor(doc, day.date === bestDate ? GOLD : INK, "fill");
    doc.roundedRect(
      x,
      bottom - barHeight,
      barWidth,
      Math.max(0.6, barHeight),
      0.7,
      0.7,
      "F",
    );
  });

  if (bestDay && bestDay.totalPaise > 0) {
    const barHeight = (bestDay.totalPaise / max) * plotHeight;
    if (barHeight < plotHeight - 5) {
      const index = days.findIndex((day) => day.date === bestDay.date);
      if (index >= 0) {
        text(
          doc,
          money(bestDay.totalPaise),
          plotX + index * slot + slot / 2,
          bottom - barHeight - 1.8,
          {
            size: 5.4,
            style: "bold",
            color: GOLD_DEEP,
            align: "center",
          },
        );
      }
    }
  }

  if (range.filedDays.length > 0) {
    const average = range.totalPaise / range.filedDays.length;
    const averageY = bottom - (average / max) * plotHeight;
    doc.setLineDashPattern([1.8, 1.4], 0);
    hairline(doc, plotX, averageY, plotX + plotWidth, averageY, SAGE, 0.35);
    doc.setLineDashPattern([], 0);
  }

  const labelEvery = Math.max(1, Math.ceil(days.length / 9));
  days.forEach((day, index) => {
    if (index % labelEvery !== 0 && index !== days.length - 1) return;
    text(doc, day.date.slice(8), plotX + index * slot + slot / 2, bottom + 5, {
      size: 5.6,
      color: MUTED,
      align: "center",
    });
  });

  // Legend
  const legendY = state.y + height - 4.6;
  const legend = [
    { color: INK, label: "Daily total" },
    { color: GOLD, label: "Best day" },
    { color: SAGE, label: "Average line" },
  ];
  let legendX = MARGIN + 5;
  for (const item of legend) {
    setColor(doc, item.color, "fill");
    doc.rect(legendX, legendY - 2, 2, 2, "F");
    text(doc, item.label, legendX + 3.2, legendY, {
      size: 6.2,
      color: MUTED,
    });
    legendX += 7.2 + doc.getTextWidth(item.label);
  }
  text(doc, `Peak ${money(max)}`, RIGHT - 5, legendY, {
    size: 6.2,
    color: MUTED,
    align: "right",
  });

  state.y += height + 6;
}

function drawPaymentMix(state: DocState, range: RangeSales) {
  const { doc } = state;
  const height = 54;
  const top = state.y;

  panel(doc, MARGIN, top, CONTENT_WIDTH, height);
  text(doc, "Payment mix", MARGIN + 5, top + 7.4, {
    size: 10.5,
    style: "bold",
    color: INK_DEEP,
  });
  text(doc, "Share of Total Sale by mode", RIGHT - 5, top + 7.4, {
    size: 6.8,
    color: MUTED,
    align: "right",
  });

  const slices: Array<{ key: MixKey; label: string; amount: number }> = [
    ...SECTION_META.map((section) => ({
      key: section.key,
      label: section.label,
      amount: range.sectionTotals[section.key],
    })),
    {
      key: "advance" as const,
      label: "Advance added",
      amount: range.advancePaise,
    },
  ].filter((slice) => slice.amount > 0);

  const cx = MARGIN + 27;
  const cy = top + 31;
  const outer = 16.5;
  const inner = 10;

  if (range.totalPaise <= 0 || slices.length === 0) {
    setColor(doc, [236, 233, 224], "draw");
    doc.setLineWidth(5.5);
    doc.circle(cx, cy, outer - 2.75, "S");
    text(doc, "No sale", cx, cy + 1, {
      size: 6.4,
      color: MUTED,
      align: "center",
    });
  } else {
    let angle = -90;
    const gap = slices.length > 1 ? 1.8 : 0;
    slices.forEach((slice) => {
      const sweep = (slice.amount / range.totalPaise) * 360;
      wedge(
        doc,
        cx,
        cy,
        outer,
        angle + gap / 2,
        angle + sweep - gap / 2,
        mixColor(slice.key),
      );
      angle += sweep;
    });

    setColor(doc, WHITE, "fill");
    doc.circle(cx, cy, inner, "F");
    setColor(doc, [238, 234, 224], "draw");
    doc.setLineWidth(0.3);
    doc.circle(cx, cy, inner, "S");

    const center = compactMoney(range.totalPaise);
    text(doc, center, cx, cy + 1, {
      size: fitText(doc, center, inner * 1.8, 7.4, 5),
      style: "bold",
      color: INK_DEEP,
      align: "center",
    });
    text(doc, "TOTAL", cx, cy + 4.6, {
      size: 4.4,
      style: "bold",
      color: MUTED,
      align: "center",
    });
  }

  // Legend: two columns with as many rows as the slices need, so the ninth
  // slice (an advance added to a sale) still fits inside the panel.
  const legendX = MARGIN + 52;
  const columnWidth = (RIGHT - 5 - legendX) / 2;
  const rows = Math.max(1, Math.ceil(slices.length / 2));
  const rowHeight = Math.min(6.6, 27 / rows);
  const startY = top + 14.5;

  slices.forEach((slice, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = legendX + column * columnWidth;
    const y = startY + row * rowHeight;

    setColor(doc, mixColor(slice.key), "fill");
    doc.roundedRect(x, y - 2.4, 2.6, 2.6, 0.6, 0.6, "F");
    text(doc, clip(doc, slice.label, columnWidth - 32), x + 4.2, y, {
      size: 6.6,
      color: TEXT,
    });
    text(doc, percent(slice.amount, range.totalPaise), x + columnWidth - 22, y, {
      size: 6.2,
      color: MUTED,
      align: "right",
    });
    text(doc, money(slice.amount), x + columnWidth - 2, y, {
      size: 6.8,
      style: "bold",
      color: TEXT,
      align: "right",
    });
  });

  state.y += height + 6;
}

function drawMonthlyChart(state: DocState, range: RangeSales) {
  const { doc } = state;
  const months = range.monthlyTrend;
  const height = 52;
  const rowHeight = 6;
  const top = state.y;
  const labelX = MARGIN + 5;
  const trackX = MARGIN + 30;
  const amountWidth = 25;
  const trackWidth = RIGHT - 5 - amountWidth - trackX;
  const max = Math.max(...months.map((month) => month.totalPaise), 1);
  const currentMonth = months[months.length - 1]?.key;

  panel(doc, MARGIN, top, CONTENT_WIDTH, height);
  text(doc, "Monthly sales", MARGIN + 5, top + 7.4, {
    size: 10.5,
    style: "bold",
    color: INK_DEEP,
  });
  text(doc, "Last six months in scope", RIGHT - 5, top + 7.4, {
    size: 6.8,
    color: MUTED,
    align: "right",
  });

  hairline(doc, labelX, top + 10.4, RIGHT - 5, top + 10.4, [239, 236, 227], 0.2);

  months.forEach((month, index) => {
    const y = top + 14 + index * rowHeight;
    const barHeight = 3.2;
    const barWidth = (month.totalPaise / max) * trackWidth;
    const isCurrent = month.key === currentMonth;

    text(doc, month.label, labelX, y + 3.4, {
      size: 7,
      style: isCurrent ? "bold" : "normal",
      color: isCurrent ? TEXT : MUTED,
    });

    setColor(doc, [241, 238, 230], "fill");
    doc.roundedRect(trackX, y, trackWidth, barHeight, 1.2, 1.2, "F");
    if (barWidth > 0.8) {
      setColor(doc, isCurrent ? GOLD : INK, "fill");
      doc.roundedRect(trackX, y, Math.max(1.2, barWidth), barHeight, 1.2, 1.2, "F");
    }

    text(doc, money(month.totalPaise), RIGHT - 5, y + 3.4, {
      size: 7,
      style: "bold",
      color: isCurrent ? INK_DEEP : TEXT,
      align: "right",
    });
  });

  state.y += height;
}

function drawBranchBreakdown(state: DocState, range: RangeSales) {
  if (range.branchSlices.length < 2) return;

  sectionHeading(state, "Branch comparison", "Ranked by Total Sale in range");

  const { doc } = state;
  const max = Math.max(...range.branchSlices.map((branch) => branch.totalPaise), 1);

  range.branchSlices.forEach((branch, index) => {
    ensureSpace(state, 14, "Sales performance report");
    const y = state.y;

    text(doc, branch.branchName, MARGIN, y + 4.4, {
      size: 8.8,
      style: "bold",
      color: index === 0 ? INK_DEEP : TEXT,
    });
    text(doc, money(branch.totalPaise), RIGHT, y + 4.4, {
      size: 9.2,
      style: "bold",
      color: index === 0 ? INK_DEEP : TEXT,
      align: "right",
    });
    text(
      doc,
      `${branch.reports} report${branch.reports === 1 ? "" : "s"} · ${percent(branch.totalPaise, range.totalPaise)} of range sale`,
      MARGIN,
      y + 8.2,
      { size: 6.4, color: MUTED },
    );

    const trackY = y + 10;
    setColor(doc, [241, 238, 230], "fill");
    doc.roundedRect(MARGIN, trackY, CONTENT_WIDTH, 2.4, 1.2, 1.2, "F");
    setColor(doc, index === 0 ? GOLD : INK_SOFT, "fill");
    doc.roundedRect(
      MARGIN,
      trackY,
      Math.max(1.5, (branch.totalPaise / max) * CONTENT_WIDTH),
      2.4,
      1.2,
      1.2,
      "F",
    );

    state.y += 14;
  });

  state.y += 2;
}

function drawDailyLedger(state: DocState, range: RangeSales) {
  sectionHeading(
    state,
    "Daily ledger",
    `${formatDateLabel(range.startDate)}  –  ${formatDateLabel(range.endDate)}`,
  );

  drawTable(
    state,
    "Sales performance report",
    [
      { label: "Date", width: 36 },
      { label: "Day", width: 18 },
      { label: "Filed", width: 24 },
      { label: "Reports", width: 24, align: "right" },
      { label: "Total Sale", width: 42, align: "right" },
      { label: "Share", width: 38, align: "right" },
    ],
    range.days.map((day) => {
      const filed = day.reports > 0;
      return [
        formatDateLabel(day.date),
        formatWeekdayShort(day.date),
        {
          value: filed ? "Filed" : "Missing",
          color: filed ? INK_SOFT : GOLD_DEEP,
          bold: filed,
        },
        filed ? String(day.reports) : "—",
        {
          value: filed ? money(day.totalPaise) : "—",
          color: filed ? TEXT : MUTED,
          bold: filed,
        },
        filed ? percent(day.totalPaise, range.totalPaise) : "—",
      ];
    }),
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
    const lines = state.doc.splitTextToSize(note, CONTENT_WIDTH - 12) as string[];
    const height = 11 + lines.length * 3.6;
    ensureSpace(state, height + 3, "Sales performance report");
    panel(state.doc, MARGIN, state.y, CONTENT_WIDTH, height, PAPER);
    setColor(state.doc, GOLD, "fill");
    state.doc.rect(MARGIN, state.y + 2, 1.4, height - 4, "F");

    text(
      state.doc,
      `${formatDateLabel(summary.report.reportDate)} · ${summary.report.branchName}`,
      MARGIN + 5,
      state.y + 5.6,
      { size: 7.6, style: "bold", color: TEXT },
    );
    text(
      state.doc,
      moneyExact(summary.totalPaise),
      RIGHT - 5,
      state.y + 5.6,
      { size: 7.6, style: "bold", color: TEXT, align: "right" },
    );
    text(state.doc, note, MARGIN + 5, state.y + 9.8, {
      size: 7.4,
      color: TEXT,
      maxWidth: CONTENT_WIDTH - 12,
    });
    state.y += height + 2.5;
  }

  state.y += 4;
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
    { label: "AWAITING REVIEW", value: counts.pending, color: GOLD_DEEP },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    panel(doc, x, state.y, width, 18);
    setColor(doc, card.color, "fill");
    doc.roundedRect(x, state.y, width, 1.6, 0.8, 0.8, "F");
    eyebrow(doc, card.label, x + 4, state.y + 6, {
      size: 5.8,
      spacing: 0.4,
    });
    text(doc, String(card.value), x + 4, state.y + 13.4, {
      size: 12,
      style: "bold",
      color: card.color,
    });
  });
  state.y += 24;

  const concerns = range.reports.filter(
    (summary) => summary.report.reviewStatus === "concern",
  );
  if (concerns.length > 0) {
    text(doc, "Flagged concerns", MARGIN, state.y, {
      size: 8.6,
      style: "bold",
      color: TEXT,
    });
    state.y += 4.4;

    for (const summary of concerns) {
      const note = summary.report.reviewNote ?? "No note recorded";
      const lines = doc.splitTextToSize(note, CONTENT_WIDTH - 12) as string[];
      const height = 11 + lines.length * 3.6;
      ensureSpace(state, height, "Sales performance report");
      panel(doc, MARGIN, state.y, CONTENT_WIDTH, height, RED_SOFT);
      setColor(doc, RED, "fill");
      doc.rect(MARGIN, state.y + 2, 1.4, height - 4, "F");

      const label = `${formatDateLabel(summary.report.reportDate)} · ${summary.report.branchName}`;
      text(doc, label, MARGIN + 5, state.y + 5.6, {
        size: 7.6,
        style: "bold",
        color: TEXT,
      });
      text(doc, moneyExact(summary.totalPaise), RIGHT - 5, state.y + 5.6, {
        size: 7.6,
        style: "bold",
        color: TEXT,
        align: "right",
      });
      text(doc, note, MARGIN + 5, state.y + 9.8, {
        size: 7.4,
        color: TEXT,
        maxWidth: CONTENT_WIDTH - 12,
      });
      state.y += height + 2.5;
    }
    state.y += 4;
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
    const wrapped = doc.splitTextToSize(pendingLabel, CONTENT_WIDTH - 6) as string[];
    ensureSpace(state, 12 + wrapped.length * 3.4, "Sales performance report");

    text(
      doc,
      `${pending.length} report${pending.length === 1 ? "" : "s"} still awaiting review:`,
      MARGIN,
      state.y + 2,
      { size: 8, color: MUTED },
    );
    state.y += 5.4;
    text(doc, pendingLabel, MARGIN, state.y + 3, {
      size: 7.4,
      color: TEXT,
      maxWidth: CONTENT_WIDTH - 6,
    });
    state.y += wrapped.length * 3.4 + 6;
  }
}

function drawFooters(doc: JsPdf) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    hairline(doc, MARGIN, FOOTER_Y - 4, RIGHT, FOOTER_Y - 4);
    setColor(doc, GOLD, "fill");
    doc.rect(MARGIN, FOOTER_Y - 1.6, 1.6, 1.6, "F");
    text(doc, "SK TAPRI", MARGIN + 3.4, FOOTER_Y, {
      size: 6.6,
      style: "bold",
      color: INK_DEEP,
    });
    text(doc, "Daily sales report", MARGIN + 19, FOOTER_Y, {
      size: 6.6,
      color: MUTED,
    });
    text(doc, `Page ${page} of ${pages}`, RIGHT, FOOTER_Y, {
      size: 6.6,
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
  drawKpis(state, input.range);
  drawDailyChart(state, input.range);
  drawPaymentMix(state, input.range);
  drawMonthlyChart(state, input.range);

  addPage(state, runningTitle);
  drawBranchBreakdown(state, input.range);
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
