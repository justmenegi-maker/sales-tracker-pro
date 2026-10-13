import { formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Small, dependency-free area chart.
 *
 * Recharts is available in the project, but a plain SVG keeps the trend
 * readable during static export (no client-only measuring, no layout shift) and
 * works with the existing design tokens.
 */
export function TrendChart({
  points,
  height = 200,
  className,
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
  className?: string;
}) {
  if (points.length === 0) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg border border-dashed text-sm text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        No reports in this range yet.
      </div>
    );
  }

  const width = 720;
  const padding = { top: 18, right: 12, bottom: 26, left: 12 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(...points.map((point) => point.value), 1);
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padding.left + index * stepX;
    const y = padding.top + innerHeight * (1 - point.value / max);
    return { x, y, ...point };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${coords[0].x.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;

  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Peak {formatINRCompact(max)}</span>
        <span>{points.length} days</span>
      </div>
      <svg
        role="img"
        aria-label="Daily total sale trend"
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerHeight * (1 - ratio)}
            y2={padding.top + innerHeight * (1 - ratio)}
            stroke="var(--border)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill="url(#trend-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === coords.length - 1 ? 4 : 2.5}
              fill="var(--card)"
              stroke="var(--chart-1)"
              strokeWidth="2"
            />
            {index % labelEvery === 0 || index === coords.length - 1 ? (
              <text
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 11 }}
              >
                {point.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
