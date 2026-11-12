'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getModelLogoClass, getModelLogoPath, getModelProvider } from './utils';

/**
 * Cost vs accuracy, drawn as plain SVG so hover is predictable: every line has a wide
 * invisible hit stroke, hover is resolved from the element under the pointer (no
 * enter/leave races), and a click or tap pins a family so touch users get the same view.
 */

export type CostInput = { id: string; name: string; score: number; totalCost: number };

type ValuePoint = {
  id: string;
  name: string;
  familyKey: string;
  effort: string | null;
  cost: number;
  score: number;
};

type ValueFamily = {
  key: string;
  name: string;
  logoPath: string | null;
  points: ValuePoint[];
  best: number;
  color: string;
};

type CostScale = 'log' | 'linear';

const DEFAULT_VALUE_FAMILIES = 8;
const LABEL_GAP = 24;
const LABEL_COLUMN = 236;
const SIDE_LEGEND_MIN_WIDTH = 760;

// Each lab keeps one hue; its families step through lightness and a small hue drift so lines stay distinct.
// `neutral` labs (monochrome brands) get a lightness lift so they read as near-white on the dark surface.
const LAB_HUES: Record<string, { hue: number; chroma: number; neutral?: boolean }> = {
  anthropic: { hue: 42, chroma: 1 },
  google: { hue: 155, chroma: 0.9 },
  openai: { hue: 255, chroma: 0.55, neutral: true },
  'x-ai': { hue: 292, chroma: 1 },
  'z-ai': { hue: 222, chroma: 0.9 },
  qwen: { hue: 340, chroma: 0.9 },
  meta: { hue: 262, chroma: 1 },
  'meta-llama': { hue: 262, chroma: 1 },
};
const SHADE_STEPS = [
  { dl: 0, dh: 0 },
  { dl: -0.1, dh: 30 },
  { dl: 0.07, dh: -26 },
  { dl: -0.17, dh: 56 },
  { dl: 0.12, dh: -50 },
];

function familyColor(provider: string, shade: number) {
  const lab = LAB_HUES[provider] ?? { hue: 75, chroma: 0.25, neutral: true };
  const step = SHADE_STEPS[shade % SHADE_STEPS.length];
  const base = lab.neutral ? 'var(--lab-l) + 0.12' : 'var(--lab-l)';
  return `oklch(calc(${base} + ${step.dl}) calc(var(--lab-c) * ${lab.chroma}) ${lab.hue + step.dh})`;
}

// "GPT-6 Astra [high]" -> one family ("GPT-6 Astra"), drawn as a single line across effort levels.
function modelFamily(model: { id: string; name: string }) {
  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(model.name);
  const provider = getModelProvider(model.id);
  const name = match ? match[1] : model.name;
  return { key: `${provider}:${name}`, name, effort: match ? match[2] : null, provider };
}

/** Variants of the strongest families, so the default chart shows whole lines rather than stray points. */
export function defaultValueSelection(models: { id: string; name: string; score: number }[]): Set<string> {
  const bestByFamily = new Map<string, number>();
  for (const m of models) {
    const key = modelFamily(m).key;
    bestByFamily.set(key, Math.max(bestByFamily.get(key) ?? 0, m.score));
  }
  const topFamilies = new Set(
    [...bestByFamily.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, DEFAULT_VALUE_FAMILIES)
      .map(([key]) => key)
  );
  return new Set(models.filter((m) => topFamilies.has(modelFamily(m).key)).map((m) => m.id));
}

// Points no cheaper model beats on accuracy, in cost order.
function paretoFrontier(points: ValuePoint[]): ValuePoint[] {
  const byCost = [...points].sort((a, b) => a.cost - b.cost || b.score - a.score);
  let best = -Infinity;
  return byCost.filter((p) => {
    if (p.score <= best) return false;
    best = p.score;
    return true;
  });
}

function logCostTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let exp = Math.floor(Math.log10(min)); exp <= Math.ceil(Math.log10(max)); exp += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** exp;
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
}

function linearCostTicks(max: number): number[] {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => Number((i * step).toPrecision(6)));
}

function formatCost(v: number) {
  if (v === 0) return '$0';
  if (v >= 0.01 && v < 1) return `$${v.toFixed(2)}`;
  return `$${Number(v.toPrecision(2))}`;
}

/** A value tag pinned to an axis, filled with the series color. Width is estimated from the mono glyph width. */
function AxisTag({ x, y, text, color, anchor }: { x: number; y: number; text: string; color: string; anchor: 'end' | 'middle' }) {
  const width = text.length * 7 + 11;
  // Kept inside the SVG so a wide value never clips at the left edge.
  const left = Math.max(1, anchor === 'end' ? x - width : x - width / 2);
  return (
    <g className="value-axis-tag" style={{ color }}>
      <rect x={left} y={y - 10.5} width={width} height={21} rx={5} fill="currentColor" />
      <text x={left + width / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11.5}>
        {text}
      </text>
    </g>
  );
}

// Push overlapping labels apart while keeping each as close to its line end as possible.
function spreadLabels<T extends { y: number }>(items: T[], top: number, bottom: number): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y).map((item) => ({ ...item }));
  for (let i = 1; i < sorted.length; i += 1) {
    sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + LABEL_GAP);
  }
  const last = sorted.length - 1;
  if (last >= 0) sorted[last].y = Math.min(sorted[last].y, bottom);
  for (let i = last - 1; i >= 0; i -= 1) {
    sorted[i].y = Math.min(sorted[i].y, sorted[i + 1].y - LABEL_GAP);
  }
  for (let i = 0; i < sorted.length; i += 1) {
    sorted[i].y = Math.max(sorted[i].y, i === 0 ? top : sorted[i - 1].y + LABEL_GAP);
  }
  return sorted;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function ChartControls({
  showPareto,
  onPareto,
  scale,
  onScale,
}: {
  showPareto: boolean;
  onPareto: (v: boolean) => void;
  scale: CostScale;
  onScale: (v: CostScale) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPareto(!showPareto)}
        aria-pressed={showPareto}
        className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-medium transition-colors hover:text-[var(--text-primary)]"
        style={{
          background: showPareto ? 'var(--accent-light)' : 'var(--surface-raised)',
          borderColor: showPareto ? 'var(--accent-border)' : 'var(--border)',
          color: showPareto ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        <svg width="18" height="10" aria-hidden="true">
          <path d="M1 9 L7 4 L17 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" strokeLinecap="round" />
        </svg>
        Pareto frontier
      </button>
      <div
        role="group"
        aria-label="Cost axis scale"
        className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-0.5"
      >
        {(['linear', 'log'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onScale(option)}
            aria-pressed={scale === option}
            className="h-full rounded-md px-3 text-[12.5px] font-medium capitalize transition-colors"
            style={{
              background: scale === option ? 'var(--surface)' : 'transparent',
              color: scale === option ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: scale === option ? 'inset 0 0 0 1px var(--border)' : undefined,
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CostChart({ models, onReset }: { models: CostInput[]; onReset?: () => void }) {
  const [scale, setScale] = useState<CostScale>('log');
  const [showPareto, setShowPareto] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hoverPointId, setHoverPointId] = useState<string | null>(null);
  const [wrapRef, size] = useElementSize<HTMLDivElement>();

  const data = useMemo(() => {
    const points: ValuePoint[] = models.flatMap((m) => {
      if (m.totalCost <= 0) return [];
      const family = modelFamily(m);
      return [{
        id: m.id,
        name: m.name,
        familyKey: family.key,
        effort: family.effort,
        cost: m.totalCost,
        score: m.score,
      }];
    });

    const byFamily = new Map<string, ValueFamily & { provider: string }>();
    for (const point of points) {
      const meta = modelFamily(point);
      const family = byFamily.get(point.familyKey) ?? {
        key: point.familyKey,
        name: meta.name,
        provider: meta.provider,
        logoPath: getModelLogoPath(point.id),
        points: [],
        best: 0,
        color: '',
      };
      family.points.push(point);
      family.best = Math.max(family.best, point.score);
      byFamily.set(point.familyKey, family);
    }
    const families = [...byFamily.values()].sort((a, b) => b.best - a.best);
    const shadeByLab = new Map<string, number>();
    for (const family of families) {
      family.points.sort((a, b) => a.cost - b.cost);
      const shade = shadeByLab.get(family.provider) ?? 0;
      shadeByLab.set(family.provider, shade + 1);
      family.color = familyColor(family.provider, shade);
    }

    const costs = points.map((p) => p.cost);
    const scores = points.map((p) => p.score);
    const minCost = costs.length ? Math.min(...costs) : 0.001;
    const maxCost = costs.length ? Math.max(...costs) : 0.1;
    const logDomain: [number, number] = [minCost / 1.35, maxCost * 1.35];
    const linearTicks = linearCostTicks(maxCost * 1.05);
    const lo = scores.length ? Math.min(...scores) : 0;
    const hi = scores.length ? Math.max(...scores) : 100;
    const yStep = hi - lo > 40 ? 10 : 5;
    const yMin = Math.max(0, Math.floor((lo - 1.5) / yStep) * yStep);
    const yMax = Math.min(100, Math.ceil((hi + 1.5) / yStep) * yStep);

    return {
      points,
      families,
      familiesByKey: new Map(families.map((f) => [f.key, f])),
      pointsById: new Map(points.map((p) => [p.id, p])),
      frontier: paretoFrontier(points),
      xDomain: scale === 'log' ? logDomain : ([0, linearTicks[linearTicks.length - 1]] as [number, number]),
      xTicks: scale === 'log' ? logCostTicks(logDomain[0], logDomain[1]) : linearTicks,
      yDomain: [yMin, yMax] as [number, number],
      yTicks: Array.from({ length: Math.round((yMax - yMin) / yStep) + 1 }, (_, i) => yMin + i * yStep),
    };
  }, [models, scale]);

  // A pinned family that was filtered out shouldn't keep the rest dimmed.
  const pinnedKey = pinned && data.familiesByKey.has(pinned) ? pinned : null;
  const activeKey = hovered ?? pinnedKey;
  const sideLegend = size.width >= SIDE_LEGEND_MIN_WIDTH;
  const margin = { top: 14, right: sideLegend ? LABEL_COLUMN : 18, bottom: 72, left: 54 };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: Math.max(0, size.width - margin.left - margin.right),
    h: Math.max(0, size.height - margin.top - margin.bottom),
  };

  const [x0, x1] = data.xDomain;
  const [y0, y1] = data.yDomain;
  const xScale = (v: number) => {
    if (scale === 'log') {
      const t = (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0));
      return plot.x + t * plot.w;
    }
    return plot.x + ((v - x0) / (x1 - x0 || 1)) * plot.w;
  };
  const yScale = (v: number) => plot.y + plot.h - ((v - y0) / (y1 - y0 || 1)) * plot.h;
  const linePath = (pts: ValuePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.cost).toFixed(1)} ${yScale(p.score).toFixed(1)}`).join(' ');

  // Resolve hover from whatever is under the pointer, so moving between a line, its
  // points and its label never flickers through an empty state.
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const familyKey = target.closest('[data-family]')?.getAttribute('data-family') ?? null;
    const pointId = target.closest('[data-point]')?.getAttribute('data-point') ?? null;
    if (familyKey !== hovered) setHovered(familyKey);
    if (pointId !== hoverPointId) setHoverPointId(pointId);
  };
  const clearHover = () => {
    setHovered(null);
    setHoverPointId(null);
  };
  const togglePin = (key: string | null) => setPinned((current) => (key === null || current === key ? null : key));

  // Drop tick labels that would collide on narrow plots (roughly 52px per "$0.50").
  const visibleXTicks = data.xTicks
    .filter((t) => {
      const x = xScale(t);
      return x >= plot.x - 1 && x <= plot.x + plot.w + 1;
    })
    .reduce<number[]>((kept, t) => {
      const last = kept[kept.length - 1];
      if (last === undefined || xScale(t) - xScale(last) >= 52) kept.push(t);
      return kept;
    }, []);

  const hoverPoint = hoverPointId ? data.pointsById.get(hoverPointId) : undefined;
  const hoverFamily = hoverPoint ? data.familiesByKey.get(hoverPoint.familyKey) : undefined;
  // Draw the active family last so it sits above the others.
  const ordered = activeKey
    ? [...data.families.filter((f) => f.key !== activeKey), ...data.families.filter((f) => f.key === activeKey)]
    : data.families;

  const labels = sideLegend
    ? spreadLabels(
        data.families.map((family) => {
          const end = family.points[family.points.length - 1];
          return { family, x: xScale(end.cost), anchorY: yScale(end.score), y: yScale(end.score) };
        }),
        plot.y + 10,
        plot.y + plot.h - 4
      )
    : [];
  const labelX = plot.x + plot.w + 30;

  if (data.points.length === 0) {
    return (
      <div className="flex h-[clamp(320px,calc(100dvh-26rem),600px)] flex-col items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]">
        {models.length === 0 ? 'No models selected.' : 'None of the selected models have cost data.'}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
          >
            Restore default selection
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          Accuracy <span className="text-[var(--text-tertiary)]">vs total run cost</span>
        </p>
        <ChartControls showPareto={showPareto} onPareto={setShowPareto} scale={scale} onScale={setScale} />
      </div>

      <div ref={wrapRef} className="value-chart relative h-[clamp(320px,calc(100dvh-26rem),600px)] w-full select-none" onPointerLeave={clearHover}>
        {plot.w > 40 && plot.h > 40 && (
          <svg
            width={size.width}
            height={size.height}
            className="block touch-manipulation"
            role="img"
            aria-label={`Accuracy against total run cost for ${data.families.length} model families`}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onClick={(e) => togglePin((e.target as Element).closest('[data-family]')?.getAttribute('data-family') ?? null)}
          >
            {/* Y grid + labels */}
            {data.yTicks.map((t) => (
              <g key={`y${t}`}>
                <line x1={plot.x} x2={plot.x + plot.w} y1={yScale(t)} y2={yScale(t)} stroke="var(--value-grid)" strokeDasharray="2 6" strokeLinecap="round" />
                <text x={plot.x - 12} y={yScale(t)} textAnchor="end" dominantBaseline="central" className="value-tick" fontSize={12}>
                  {t}%
                </text>
              </g>
            ))}

            {/* X axis */}
            <line x1={plot.x} x2={plot.x + plot.w} y1={plot.y + plot.h} y2={plot.y + plot.h} stroke="var(--chart-axis)" />
            {visibleXTicks.map((t) => {
              const x = xScale(t);
              return (
                <g key={`x${t}`}>
                  <line x1={x} x2={x} y1={plot.y + plot.h} y2={plot.y + plot.h + 5} stroke="var(--chart-axis)" />
                  <text x={x} y={plot.y + plot.h + 24} textAnchor="middle" className="value-tick" fontSize={12}>
                    {formatCost(t)}
                  </text>
                </g>
              );
            })}
            <text x={plot.x + plot.w / 2} y={plot.y + plot.h + 58} textAnchor="middle" className="value-axis-title">
              Total run cost (USD{scale === 'log' ? ', log scale' : ''})
            </text>
            <text x={plot.x + 12} y={plot.y + 16} className="value-better">
              ↖ Better
            </text>

            {showPareto && data.frontier.length > 1 && <path d={linePath(data.frontier)} className="frontier-line" />}

            {/* Crosshair: guides from the hovered point to both axes, under the series so the dot stays on top. */}
            {hoverPoint && hoverFamily && (
              <g key={`guides-${hoverPoint.id}`} className="value-crosshair" style={{ color: hoverFamily.color }} pointerEvents="none">
                <line
                  x1={xScale(hoverPoint.cost)}
                  x2={xScale(hoverPoint.cost)}
                  y1={yScale(hoverPoint.score)}
                  y2={plot.y + plot.h}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeWidth={1.25}
                  strokeDasharray="3 4"
                />
                <line
                  x1={plot.x}
                  x2={xScale(hoverPoint.cost)}
                  y1={yScale(hoverPoint.score)}
                  y2={yScale(hoverPoint.score)}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeWidth={1.25}
                  strokeDasharray="3 4"
                />
              </g>
            )}

            {ordered.map((family) => {
              const active = activeKey === family.key;
              const dimmed = activeKey !== null && !active;
              const d = linePath(family.points);
              const endId = family.points[family.points.length - 1].id;
              return (
                <g
                  key={family.key}
                  data-family={family.key}
                  style={{ color: family.color, opacity: dimmed ? 0.16 : 1, transition: 'opacity 150ms' }}
                  className="cursor-pointer"
                >
                  {family.points.length > 1 && (
                    <>
                      <path d={d} fill="none" stroke="currentColor" strokeWidth={active ? 3 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
                      {/* Wide invisible stroke: the line is hoverable along its whole length. */}
                      <path d={d} fill="none" stroke="transparent" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
                    </>
                  )}
                  {family.points.map((p, i) => {
                    const cx = xScale(p.cost);
                    const cy = yScale(p.score);
                    // Effort labels go above; flip one below when a sibling point sits right on top of it.
                    const crowded = family.points.some(
                      (q, j) => j < i && Math.hypot(xScale(q.cost) - cx, yScale(q.score) - cy) < 30
                    );
                    const isEnd = p.id === endId;
                    const r = (isEnd ? 5 : 4) + (active ? 1 : 0);
                    return (
                      <g key={p.id} data-point={p.id}>
                        {(isEnd || active) && <circle cx={cx} cy={cy} r={r + 5} fill="currentColor" fillOpacity={0.16} />}
                        <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="var(--surface)" strokeWidth={2} />
                        <circle cx={cx} cy={cy} r={12} fill="transparent" />
                        {active && p.effort && (
                          <text x={cx} y={crowded ? cy + r + 17 : cy - r - 9} textAnchor="middle" className="value-effort">
                            {p.effort}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Right-hand labels, one per family; hover or focus highlights it, click pins it. */}
            {labels.map(({ family, x, anchorY, y }) => {
              const active = activeKey === family.key;
              const dimmed = activeKey !== null && !active;
              return (
                <g
                  key={`label-${family.key}`}
                  data-family={family.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={pinnedKey === family.key}
                  aria-label={`${family.name}, best ${family.best.toFixed(1)}%`}
                  onFocus={() => setHovered(family.key)}
                  onBlur={() => setHovered(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      togglePin(family.key);
                    }
                  }}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--accent)]"
                  style={{ color: family.color, opacity: dimmed ? 0.35 : 1, transition: 'opacity 150ms' }}
                >
                  <path
                    d={`M ${x + 9} ${anchorY} C ${(x + labelX) / 2} ${anchorY}, ${(x + labelX) / 2} ${y}, ${labelX - 10} ${y}`}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={active ? 0.6 : 0.22}
                    strokeWidth={1.25}
                    strokeDasharray="1 3.5"
                    strokeLinecap="round"
                  />
                  <rect
                    x={labelX - 8}
                    y={y - 12}
                    width={LABEL_COLUMN - 40}
                    height={24}
                    rx={6}
                    fill="currentColor"
                    fillOpacity={active ? 0.12 : 0}
                    stroke="transparent"
                    strokeWidth={1.5}
                  />
                  {family.logoPath && (
                    <image href={family.logoPath} x={labelX} y={y - 8} width={16} height={16} className={getModelLogoClass(family.logoPath)} />
                  )}
                  <text
                    x={labelX + (family.logoPath ? 23 : 0)}
                    y={y}
                    dominantBaseline="central"
                    fill="currentColor"
                    fontSize={13}
                    fontWeight={active ? 650 : 550}
                  >
                    {family.name.length > 20 ? `${family.name.slice(0, 19)}…` : family.name}
                  </text>
                  <text x={labelX + LABEL_COLUMN - 56} y={y} dominantBaseline="central" textAnchor="end" className="value-label-score">
                    {family.best.toFixed(1)}%
                  </text>
                </g>
              );
            })}

            {/* Axis value tags for the hovered point, on top of the tick labels they cover. */}
            {hoverPoint && hoverFamily && (
              <g key={`tags-${hoverPoint.id}`} className="value-crosshair" pointerEvents="none">
                <AxisTag
                  x={plot.x - 4}
                  y={yScale(hoverPoint.score)}
                  text={`${hoverPoint.score.toFixed(1)}%`}
                  color={hoverFamily.color}
                  anchor="end"
                />
                <AxisTag
                  x={xScale(hoverPoint.cost)}
                  y={plot.y + plot.h + 20}
                  text={`$${hoverPoint.cost.toFixed(2)}`}
                  color={hoverFamily.color}
                  anchor="middle"
                />
              </g>
            )}
          </svg>
        )}

        {hoverPoint && hoverFamily && (
          <div
            className="value-tooltip pointer-events-none absolute z-20 min-w-[210px] rounded-xl text-sm"
            style={{
              left: xScale(hoverPoint.cost),
              top: yScale(hoverPoint.score),
              transform: `translate(${xScale(hoverPoint.cost) > size.width - 260 ? 'calc(-100% - 16px)' : '16px'}, ${
                yScale(hoverPoint.score) > size.height - 130 ? 'calc(-100% - 8px)' : '-50%'
              })`,
              color: hoverFamily.color,
            }}
          >
            <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: 'currentColor' }} />
              <span className="font-semibold text-[var(--text-primary)]">{hoverFamily.name}</span>
              {hoverPoint.effort && (
                <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'color-mix(in oklch, currentColor 16%, transparent)' }}>
                  {hoverPoint.effort}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-[var(--border-subtle)] px-3.5 pt-2.5 pb-3 text-[12.5px]">
              {[
                ['Accuracy', `${hoverPoint.score.toFixed(1)}%`],
                ['Total cost', `$${hoverPoint.cost.toFixed(2)}`],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--text-tertiary)]">{label}</dt>
                  <dd className="text-right font-mono font-medium tabular-nums text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Narrow screens: the label column becomes a tappable legend under the plot. */}
      {!sideLegend && size.width > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.families.map((family) => {
            const active = activeKey === family.key;
            return (
              <button
                key={family.key}
                type="button"
                aria-pressed={pinnedKey === family.key}
                onClick={() => togglePin(family.key)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors"
                style={{
                  color: family.color,
                  borderColor: active ? 'currentColor' : 'var(--border)',
                  background: active ? 'color-mix(in oklch, currentColor 12%, transparent)' : 'var(--surface-raised)',
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />
                <span className="text-[var(--text-primary)]">{family.name}</span>
                <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{family.best.toFixed(1)}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
