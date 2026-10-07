'use client';

import Image from 'next/image';
import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Trophy,
  BarChart3,
  ChartScatter,
  ChevronDown,
  ChevronUp,
  Check,
  Filter,
  Search,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Rectangle,
  ScatterChart,
  Scatter,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import type { BarShapeProps } from 'recharts';
import { getModelLogoPath, getModelLogoClass, getProviderLabel, getModelProvider } from './utils';
import type { ExplorerResults } from '../lib/results.types';
type BenchModel = {
  id: string;
  name: string;
  score: number;
  breakdown?: Record<string, number>;
};

const OVERALL_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const DEFAULT_CHART_MODELS = 10;

function overallScoreBarShape(props: BarShapeProps) {
  return (
    <Rectangle
      {...props}
      className={props.index === 0 ? 'chart-bar-top' : 'chart-bar'}
      fillOpacity={props.index === 0 ? 1 : 0.72 - props.index * 0.05}
      radius={OVERALL_BAR_RADIUS}
    />
  );
}

const RANK_COLORS = ['var(--accent)', 'var(--rank-2)', 'var(--rank-3)'];

function trackCellStyle(value: number) {
  const pct = 4 + (Math.max(0, Math.min(100, value)) / 100) * 26;
  return {
    background: `color-mix(in srgb, var(--accent) ${pct.toFixed(1)}%, transparent)`,
    color: value >= 60 ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}

type SortDir = 'asc' | 'desc';
type SortKey = string;

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <div className="flex flex-col leading-none opacity-30">
        <ChevronUp className="w-3 h-3 -mb-1" />
        <ChevronDown className="w-3 h-3" />
      </div>
    );
  }
  return dir === 'asc' ? (
    <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
  ) : (
    <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
  );
}

// ============================================================================
// MULTI-SELECT DROPDOWN FOR CHART FILTERING
// ============================================================================
function MultiSelectDropdown({
  selected,
  options,
  onChange,
  totalCount,
  label = 'Filter models',
}: {
  selected: Set<string>;
  options: { id: string; label: string }[];
  onChange: (selected: Set<string>) => void;
  totalCount: number;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const toggleItem = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onChange(newSelected);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const [selectedLabIds, setSelectedLabIds] = useState<Set<string>>(() => new Set());

  // Build the list of labs present in the options.
  const labs = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((o) => {
      const provider = getModelProvider(o.id);
      if (provider && !map.has(provider)) {
        map.set(provider, getProviderLabel(o.id));
      }
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [options]);

  const filteredOptions = useMemo(() => {
    return options.filter((o) => {
      const matchesLab = selectedLabIds.size === 0 || selectedLabIds.has(getModelProvider(o.id));
      if (!matchesLab) return false;
      if (normalizedQuery.length === 0) return true;
      return (
        o.label.toLowerCase().includes(normalizedQuery) ||
        o.id.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [options, normalizedQuery, selectedLabIds]);

  // "Select all" / "Clear" operate on the currently visible (filtered) options
  // so users can quickly toggle a subset they've searched or filtered for.
  const isScoped = normalizedQuery.length > 0 || selectedLabIds.size > 0;
  const selectAll = () => {
    const newSelected = new Set(selected);
    filteredOptions.forEach((o) => newSelected.add(o.id));
    onChange(newSelected);
  };

  const selectNone = () => {
    const newSelected = new Set(selected);
    filteredOptions.forEach((o) => newSelected.delete(o.id));
    onChange(newSelected);
  };

  const applyLabSelection = (labIds: Set<string>) => {
    setSelectedLabIds(labIds);
    onChange(
      new Set(
        options
          .filter((o) => labIds.size === 0 || labIds.has(getModelProvider(o.id)))
          .map((o) => o.id)
      )
    );
  };

  const toggleLab = (labId: string) => {
    const nextLabIds = selectedLabIds.size === 0 ? new Set<string>([labId]) : new Set(selectedLabIds);
    if (selectedLabIds.has(labId)) {
      nextLabIds.delete(labId);
    } else {
      nextLabIds.add(labId);
    }
    applyLabSelection(nextLabIds);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (isOpen) setQuery('');
          setIsOpen(!isOpen);
        }}
        className="flex h-9 items-center gap-2 px-3 rounded-lg text-[13px] font-medium transition-colors hover:border-[var(--text-tertiary)]"
        style={{
          background: 'var(--surface-raised)',
          border: `1px solid ${isOpen ? 'var(--accent-border)' : 'var(--border-strong)'}`,
          color: 'var(--text-primary)',
        }}
      >
        <Filter className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        <span>{label}</span>
        <span
          className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold"
          style={
            selected.size < totalCount
              ? { background: 'var(--accent-light)', color: 'var(--accent)' }
              : { background: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          {selected.size}/{totalCount}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 top-full mt-1 h-[min(26rem,calc(100vh-160px))] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg shadow-lg flex flex-col"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {/* Seamless search */}
            <div
              className="shrink-0 flex items-center gap-2 px-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Search
                className="w-4 h-4 shrink-0 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                data-seamless
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="flex-1 min-w-0 py-2.5 text-sm bg-transparent outline-none focus:outline-none focus-visible:outline-none placeholder:text-[var(--text-tertiary)]"
                style={{ color: 'var(--text-primary)' }}
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors hover:bg-[var(--border-subtle)]"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Lab filter chips */}
            {labs.length > 1 && (
              <div
                className="shrink-0 px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                    Labs
                  </div>
                  <button
                    type="button"
                    onClick={() => applyLabSelection(new Set())}
                    className="rounded px-1.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                    style={{ color: selectedLabIds.size === 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}
                  >
                    All labs
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {labs.map((lab) => (
                    <LabChip
                      key={lab.id}
                      active={selectedLabIds.has(lab.id)}
                      label={lab.label}
                      logo={getModelLogoPath(`${lab.id}/x`)}
                      onClick={() => toggleLab(lab.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex items-center gap-2 p-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isScoped ? 'Select shown' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isScoped ? 'Clear shown' : 'Clear'}
              </button>
            </div>

            {/* Options */}
            <div className="min-h-0 flex-1 p-1 overflow-y-auto overscroll-none custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  No matches found.
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isChecked = selected.has(option.id);
                  const logoPath = getModelLogoPath(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleItem(option.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0"
                        style={{
                          background: isChecked ? 'var(--accent)' : 'var(--surface)',
                          border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                        }}
                      >
                        {isChecked && <Check className="w-3 h-3" style={{ color: 'var(--on-accent)' }} />}
                      </div>
                      {logoPath && (
                        <Image
                          src={logoPath}
                          alt=""
                          width={16}
                          height={16}
                          className={`h-4 w-4 shrink-0 ${getModelLogoClass(logoPath)}`}
                          unoptimized
                        />
                      )}
                      <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{option.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LabChip({
  active,
  label,
  logo,
  onClick,
}: {
  active: boolean;
  label: string;
  logo?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
        active
          ? 'bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface))] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_0_1px_var(--accent-border)]'
          : 'bg-[var(--border-subtle)] border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {logo && (
        <Image
          src={logo}
          alt=""
          width={12}
          height={12}
          className={`h-3 w-3 ${getModelLogoClass(logo)}`}
          unoptimized
        />
      )}
      {label}
    </button>
  );
}

// ============================================================================
// CHART TOOLTIP
// ============================================================================
type ChartPayloadItem = { name?: string; value?: number | string; color?: string };
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg px-4 py-3" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-pop)' }}>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{label}</div>
      <div className="space-y-1">
        {payload.map((p, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: 'var(--accent)' }}
              />
              <span>{p.name}</span>
            </div>
            <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {typeof p.value === 'number' ? p.value.toFixed(2) : p.value ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
  [key: string]: unknown;
}) {
  const { x, y, width, value } = props;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;

  const xn = typeof x === 'number' ? x : Number(x);
  const yn = typeof y === 'number' ? y : Number(y);
  const wn = typeof width === 'number' ? width : Number(width);
  if (!Number.isFinite(xn) || !Number.isFinite(yn) || !Number.isFinite(wn)) return null;
  return (
    <text
      x={xn + wn / 2}
      y={yn - 8}
      className="chart-text"
      style={{ fontFamily: 'var(--font-app-mono)' }}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {typeof value === 'number' ? value.toFixed(1) : value}
    </text>
  );
}

// Custom XAxis tick with logo
function createCustomXAxisTick(nameToIdMap: Map<string, string>) {
  return function CustomXAxisTick(props: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: string; [key: string]: unknown };
    [key: string]: unknown;
  }) {
    const { x, y, payload } = props;
    if (!payload || !payload.value) return null;
    
    const modelName = payload.value as string;
    const modelId = nameToIdMap.get(modelName);
    const logoPath = modelId ? getModelLogoPath(modelId) : null;
    const xn = typeof x === 'number' ? x : Number(x);
    const yn = typeof y === 'number' ? y : Number(y);
    if (!Number.isFinite(xn) || !Number.isFinite(yn)) return null;
    
    return (
      <g transform={`translate(${xn},${yn})`}>
        <g transform="rotate(-40)">
          {logoPath && (
            <image
              href={logoPath}
              x={-20}
              y={-7}
              width={14}
              height={14}
              className={getModelLogoClass(logoPath)}
            />
          )}
          <text
            x={logoPath ? -4 : 0}
            y={0}
            dy={16}
            className="chart-text"
            fontSize={11}
            textAnchor="end"
          >
            {modelName}
          </text>
        </g>
      </g>
    );
  };
}

type ChartTab = 'leaderboard' | 'overall' | 'value';

// ============================================================================
// COST VS ACCURACY
// ============================================================================
type ValuePoint = {
  id: string;
  name: string;
  familyKey: string;
  effort: string | null;
  provider: string;
  cost: number;
  totalCost: number;
  score: number;
};

type ValueFamily = {
  key: string;
  name: string;
  provider: string;
  logoPath: string | null;
  points: ValuePoint[];
  best: number;
  colorClass: string;
  color: string;
};

type CostScale = 'log' | 'linear';

const DEFAULT_VALUE_FAMILIES = 8;
const LABEL_GAP = 26;
const LABEL_COLUMN_WIDTH = 268;

// Each lab keeps one hue; its families step through lightness and a small hue drift so lines stay distinct.
// `neutral` labs (monochrome brands) use a theme-specific lightness so they read as ink on light and white on dark.
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
  const base = lab.neutral ? 'var(--lab-l) + var(--lab-neutral-lift)' : 'var(--lab-l)';
  return `oklch(calc(${base} + ${step.dl}) calc(var(--lab-c) * ${lab.chroma}) ${lab.hue + step.dh})`;
}

// "GPT-6 Astra [high]" -> one family ("GPT-6 Astra"), drawn as a single line across effort levels.
function modelFamily(model: { id: string; name: string }) {
  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(model.name);
  const provider = getModelProvider(model.id);
  const name = match ? match[1] : model.name;
  return { key: `${provider}:${name}`, name, effort: match ? match[2] : null, provider };
}

// Variants of the strongest families, so the default chart shows whole lines rather than stray points.
function defaultValueSelection(models: ExplorerResults['models']): Set<string> {
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
  return `$${Number(v.toPrecision(2))}`;
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

function ValueOverlay({
  families,
  hovered,
  onHover,
}: {
  families: ValueFamily[];
  hovered: string | null;
  onHover: (key: string | null) => void;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || !Number.isFinite(plot.x + plot.width)) return null;

  const anchors = families.flatMap((family) => {
    const end = family.points[family.points.length - 1];
    const x = xScale(end.cost);
    const y = yScale(end.score);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ family, x: x as number, y: y as number, anchorY: y as number }] : [];
  });
  const labelX = plot.x + plot.width + 36;
  const placed = spreadLabels(anchors, plot.y + 8, plot.y + plot.height - 8);

  return (
    <g>
      <text x={plot.x + 14} y={plot.y + 18} className="value-better">
        ↖ Better
      </text>
      {placed.map(({ family, x, anchorY, y }) => {
        const dimmed = hovered !== null && hovered !== family.key;
        const active = hovered === family.key;
        return (
          <g
            key={family.key}
            className={`value-label ${family.colorClass}`}
            opacity={dimmed ? 0.28 : 1}
            onMouseEnter={() => onHover(family.key)}
            onMouseLeave={() => onHover(null)}
          >
            <path
              d={`M ${x + 9} ${anchorY} C ${(x + labelX) / 2} ${anchorY}, ${(x + labelX) / 2} ${y}, ${labelX - 10} ${y}`}
              className="value-leader"
            />
            <rect x={labelX - 8} y={y - 12} width={LABEL_COLUMN_WIDTH - 36} height={24} rx={6} className="value-label-bg" />
            {family.logoPath && (
              <image
                href={family.logoPath}
                x={labelX}
                y={y - 8}
                width={16}
                height={16}
                className={getModelLogoClass(family.logoPath)}
              />
            )}
            <text x={labelX + (family.logoPath ? 24 : 0)} y={y} dominantBaseline="central" className="value-label-name" fontWeight={active ? 650 : 560}>
              {family.name.length > 22 ? `${family.name.slice(0, 21)}…` : family.name}
            </text>
            <text x={labelX + LABEL_COLUMN_WIDTH - 52} y={y} dominantBaseline="central" textAnchor="end" className="value-label-score">
              {family.best.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ValueTooltip({
  active,
  payload,
  familiesByKey,
}: {
  active?: boolean;
  payload?: { payload?: ValuePoint }[];
  familiesByKey: Map<string, ValueFamily>;
}) {
  const point = payload?.[0]?.payload;
  const family = point?.familyKey ? familiesByKey.get(point.familyKey) : undefined;
  if (!active || !point || !family) return null;
  const rows = [
    ['Accuracy', `${point.score.toFixed(1)}%`],
    ['Cost per puzzle', `$${point.cost.toFixed(4)}`],
    ['Full run', `$${point.totalCost.toFixed(2)}`],
  ];
  return (
    <div className={`value-tooltip min-w-[220px] overflow-hidden rounded-xl text-sm ${family.colorClass}`}>
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: 'currentColor', boxShadow: '0 0 0 3px color-mix(in oklch, currentColor 22%, transparent)' }} />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{family.name}</span>
        {point.effort && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: 'color-mix(in oklch, currentColor 16%, transparent)' }}
          >
            {point.effort}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-3.5 pb-3 pt-2.5 text-[12.5px]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
            <span className="text-right font-mono font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
  const segment = (active: boolean) => ({
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12), inset 0 0 0 1px var(--border)' : undefined,
  });
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPareto(!showPareto)}
        aria-pressed={showPareto}
        className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[12.5px] font-medium transition-colors hover:text-[var(--text-primary)]"
        style={{
          background: showPareto ? 'var(--accent-light)' : 'var(--surface-raised)',
          border: `1px solid ${showPareto ? 'var(--accent-border)' : 'var(--border)'}`,
          color: showPareto ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        <svg width="18" height="10" aria-hidden="true">
          <path d="M1 9 L7 4 L17 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" strokeLinecap="round" />
        </svg>
        Pareto frontier
      </button>
      <div className="inline-flex h-8 items-center rounded-lg p-0.5" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
        {(['linear', 'log'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onScale(option)}
            aria-pressed={scale === option}
            className="h-full rounded-md px-3 text-[12.5px] font-medium capitalize transition-all"
            style={segment(scale === option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BENCHMARKS TAB
// ============================================================================
export default function BenchmarksTab({
  results,
}: {
  results: ExplorerResults;
}) {
  const models = useMemo<BenchModel[]>(
    () =>
      results.models.map((model) => ({
        id: model.id,
        name: model.name,
        score: model.score,
        breakdown: model.breakdown,
      })),
    [results.models]
  );
  const puzzles = useMemo<Array<{ level: string }>>(
    () => results.puzzles.map((puzzle) => ({ level: puzzle.level })),
    [results.puzzles]
  );
  const [activeTab, setActiveTab] = useState<ChartTab>('leaderboard');
  const [selectedByTab, setSelectedByTab] = useState<Record<ChartTab, Set<string>>>(() => {
    const byScore = [...results.models].sort((a, b) => b.score - a.score).map((model) => model.id);
    const topTen = byScore.slice(0, DEFAULT_CHART_MODELS);
    return { leaderboard: new Set(byScore), overall: new Set(topTen), value: defaultValueSelection(results.models) };
  });
  const [costScale, setCostScale] = useState<CostScale>('log');
  const [showPareto, setShowPareto] = useState(false);
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null);
  const [queryByTab, setQueryByTab] = useState<Record<ChartTab, string>>({ leaderboard: '', overall: '', value: '' });
  const selectedModels = selectedByTab[activeTab];
  const searchQuery = queryByTab[activeTab];
  const setSelectedModels = (next: Set<string>) => setSelectedByTab((prev) => ({ ...prev, [activeTab]: next }));
  const setSearchQuery = (next: string) => setQueryByTab((prev) => ({ ...prev, [activeTab]: next }));
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const modelFilterOptions = useMemo(() => {
    return [...models]
      .sort((a, b) => b.score - a.score)
      .filter((m) =>
        normalizedQuery.length === 0
          ? true
          : m.name.toLowerCase().includes(normalizedQuery) || m.id.toLowerCase().includes(normalizedQuery)
      )
      .map((m) => ({ id: m.id, label: m.name }));
  }, [models, normalizedQuery]);

  const modelsByScore = useMemo(() => {
    return [...models]
      .filter((m) => selectedModels.has(m.id))
      .filter((m) =>
        normalizedQuery.length === 0
          ? true
          : m.name.toLowerCase().includes(normalizedQuery) || m.id.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.score - a.score);
  }, [models, normalizedQuery, selectedModels]);

  const overallData = useMemo(() => {
    return modelsByScore.map((m) => ({
      name: m.name,
      score: Math.round(m.score * 10) / 10,
      id: m.id,
    }));
  }, [modelsByScore]);

  const valueData = useMemo(() => {
    const points: ValuePoint[] = modelsByScore.flatMap((m) => {
      const summary = results.models.find((r) => r.id === m.id)?.summary;
      if (!summary || summary.totalCost <= 0 || summary.total <= 0) return [];
      const family = modelFamily(m);
      return [{
        id: m.id,
        name: m.name,
        familyKey: family.key,
        effort: family.effort,
        provider: family.provider,
        cost: summary.totalCost / summary.total,
        totalCost: summary.totalCost,
        score: m.score,
      }];
    });

    const byFamily = new Map<string, ValueFamily>();
    for (const point of points) {
      const family = byFamily.get(point.familyKey) ?? {
        key: point.familyKey,
        name: modelFamily(point).name,
        provider: point.provider,
        logoPath: getModelLogoPath(point.id),
        points: [],
        best: 0,
        colorClass: '',
        color: '',
      };
      family.points.push(point);
      family.best = Math.max(family.best, point.score);
      byFamily.set(point.familyKey, family);
    }
    const families = [...byFamily.values()].sort((a, b) => b.best - a.best);
    const shadeByLab = new Map<string, number>();
    families.forEach((family, i) => {
      family.points.sort((a, b) => a.cost - b.cost);
      const shade = shadeByLab.get(family.provider) ?? 0;
      shadeByLab.set(family.provider, shade + 1);
      family.colorClass = `fam-${i}`;
      family.color = familyColor(family.provider, shade);
    });

    const costs = points.map((p) => p.cost);
    const scores = points.map((p) => p.score);
    const minCost = costs.length ? Math.min(...costs) : 0.001;
    const maxCost = costs.length ? Math.max(...costs) : 0.1;
    const logDomain: [number, number] = [minCost / 1.3, maxCost * 1.3];
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
      colorCss: families.map((f) => `.value-chart .${f.colorClass}{color:${f.color}}`).join('\n'),
      frontier: paretoFrontier(points),
      xDomain: costScale === 'log' ? logDomain : ([0, linearTicks[linearTicks.length - 1]] as [number, number]),
      xTicks: costScale === 'log' ? logCostTicks(logDomain[0], logDomain[1]) : linearTicks,
      yDomain: [yMin, yMax] as [number, number],
      yTicks: Array.from({ length: (yMax - yMin) / yStep + 1 }, (_, i) => yMin + i * yStep),
    };
  }, [costScale, modelsByScore, results.models]);

  const costByModel = useMemo(() => {
    return new Map(
      results.models.map((model) => [
        model.id,
        {
          totalCost: model.summary.totalCost,
          totalPromptTokens: model.summary.totalPromptTokens,
          totalCompletionTokens: model.summary.totalCompletionTokens,
        },
      ])
    );
  }, [results.models]);

  const modelNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    models.forEach((m) => {
      map.set(m.name, m.id);
    });
    return map;
  }, [models]);

  const CustomXAxisTickWithLogo = useMemo(
    () => createCustomXAxisTick(modelNameToIdMap),
    [modelNameToIdMap]
  );

  const tabs = [
    { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { key: 'overall', label: 'Overall', icon: BarChart3 },
    { key: 'value', label: 'Cost vs accuracy', icon: ChartScatter },
  ] as const;

  const trackIds = useMemo(() => {
    const ids = new Set<string>();
    puzzles.forEach((p) => {
      ids.add(p.level);
    });
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [puzzles]);

  const trackDescription = (id: string) => {
    switch (id) {
      case 'mateIn1':
      case 'mate1': return 'Force checkmate in one move.';
      case 'mateIn2':
      case 'mate2': return 'Force checkmate in two moves (3 plies).';
      case 'fork': return 'Attack two or more enemy pieces at once.';
      case 'pin': return 'A piece is stuck because moving it loses a more valuable piece.';
      case 'hangingPiece': return 'Win an undefended enemy piece.';
      default: return 'Track-level accuracy.';
    }
  };

  const trackLabel = (id: string) => {
    const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(id);
    if (mateMatch) return `Mate ${mateMatch[1]}`;
    return id
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const trackSortKey = (id: string) => `track:${id}`;

  const leaderboardModels = useMemo(() => {
    const models = [...modelsByScore];

    const getNumeric = (m: BenchModel): number => {
      switch (sortKey) {
        case 'score':
          return m.score;
        case 'totalCost': {
          const row = costByModel.get(m.id);
          if (typeof row?.totalCost === 'number') return row.totalCost;
          return sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        }
        case 'totalTokens': {
          const row = costByModel.get(m.id);
          if (typeof row?.totalPromptTokens === 'number' && typeof row?.totalCompletionTokens === 'number') {
            return row.totalPromptTokens + row.totalCompletionTokens;
          }
          return sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        }
        case 'name':
          return 0;
        default:
          if (sortKey.startsWith('track:')) {
            const track = sortKey.slice('track:'.length);
            return m.breakdown?.[track] ?? 0;
          }
          return 0;
      }
    };

    models.sort((a, b) => {
      if (sortKey === 'name') {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const va = getNumeric(a);
      const vb = getNumeric(b);
      const cmp = va === vb ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return models;
  }, [costByModel, modelsByScore, sortDir, sortKey]);

  const selectedCostTotals = useMemo(() => {
    let totalCost = 0;
    let totalTokens = 0;
    for (const model of modelsByScore) {
      const row = costByModel.get(model.id);
      if (!row) continue;
      if (typeof row.totalCost === 'number') totalCost += row.totalCost;
      if (typeof row.totalPromptTokens === 'number' && typeof row.totalCompletionTokens === 'number') {
        totalTokens += row.totalPromptTokens + row.totalCompletionTokens;
      }
    }
    return { totalCost, totalTokens };
  }, [costByModel, modelsByScore]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    if (key === 'name') {
      setSortDir('asc');
    } else {
      setSortDir('desc');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Benchmarks Section */}
      <section
        id="benchmarks"
        className="rounded-xl p-4 sm:p-5 scroll-mt-8"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold leading-tight tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
              {activeTab === 'leaderboard' ? 'Standings' : activeTab === 'overall' ? 'Overall accuracy' : 'Cost vs accuracy'}
            </h2>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {activeTab === 'leaderboard'
                ? 'Every model, ranked by exact-line accuracy'
                : activeTab === 'overall'
                  ? 'Share of puzzles each selected model solved'
                  : 'What each point of accuracy costs. Up and to the left is better'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[160px] sm:flex-none sm:min-w-[220px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: 'var(--text-secondary)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                aria-label="Search models"
                className="h-9 w-full rounded-lg pl-9 pr-3 text-[13px] transition-colors placeholder:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] focus:border-[var(--accent-border)] focus:outline-none"
                style={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <MultiSelectDropdown
              key={activeTab}
              selected={selectedModels}
              options={modelFilterOptions}
              onChange={setSelectedModels}
              totalCount={models.length}
              label="Filter models"
            />

            <div
              className="flex h-9 items-center rounded-lg p-1 gap-0.5"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    aria-pressed={isActive}
                    className={`flex h-full items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                      isActive ? '' : 'hover:bg-[var(--row-hover)] hover:text-[var(--text-primary)]'
                    }`}
                    style={{
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                      boxShadow: isActive ? 'inset 0 0 0 1px var(--accent-border)' : undefined,
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'leaderboard' && (
          <div className="w-full">
            {leaderboardModels.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No models match this search or filter.
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-4 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{leaderboardModels.length}</span> models
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
                      style={{ background: 'var(--accent-light)', border: '1px solid var(--accent-border)', color: 'var(--text-secondary)' }}
                    >
                      Total cost
                      <span className="font-mono text-[13px] font-semibold normal-case tracking-normal" style={{ color: 'var(--accent)' }}>
                        ${selectedCostTotals.totalCost.toFixed(2)}
                      </span>
                    </span>
                    <span
                      className="hidden sm:inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
                      style={{ background: 'var(--accent-light)', border: '1px solid var(--accent-border)', color: 'var(--text-secondary)' }}
                    >
                      Total tokens
                      <span className="font-mono text-[13px] font-semibold normal-case tracking-normal" style={{ color: 'var(--accent)' }}>
                        {selectedCostTotals.totalTokens.toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-[12.5px] uppercase tracking-[0.06em] [&_th]:py-3 [&_button:hover]:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
                        <th className="px-4 py-2.5 text-left font-semibold w-[60px]">Rank</th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Model
                            <SortIcon active={sortKey === 'name'} dir={sortDir} />
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('score')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Accuracy
                            <SortIcon active={sortKey === 'score'} dir={sortDir} />
                          </button>
                        </th>
                        {trackIds.map((trackId) => (
                          <th key={trackId} className="px-4 py-2.5 text-right font-semibold hidden md:table-cell">
                            <button
                              type="button"
                              onClick={() => toggleSort(trackSortKey(trackId))}
                              className="inline-flex items-center gap-2 transition-colors"
                              title={`${trackLabel(trackId)}: ${trackDescription(trackId)}`}
                            >
                              {trackLabel(trackId)}
                              <SortIcon active={sortKey === trackSortKey(trackId)} dir={sortDir} />
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-right font-semibold hidden lg:table-cell" style={{ background: 'var(--column-highlight)', color: 'var(--accent)' }}>
                          <button
                            type="button"
                            onClick={() => toggleSort('totalCost')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Total Cost
                            <SortIcon active={sortKey === 'totalCost'} dir={sortDir} />
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold hidden lg:table-cell" style={{ background: 'var(--column-highlight)', color: 'var(--accent)' }}>
                          <button
                            type="button"
                            onClick={() => toggleSort('totalTokens')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Total Tokens
                            <SortIcon active={sortKey === 'totalTokens'} dir={sortDir} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardModels.map((model, idx) => {
                        const modelCost = costByModel.get(model.id);
                        const rankColor = RANK_COLORS[idx] ?? 'var(--text-tertiary)';
                        const logoPath = getModelLogoPath(model.id);
                        return (
                          <tr
                            key={model.id}
                            className="transition-colors even:bg-[var(--row-alt)] hover:bg-[var(--row-hover)]"
                            style={{ borderTop: '1px solid var(--border-subtle)' }}
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono text-sm font-semibold tabular-nums" style={{ color: rankColor }}>
                                {String(idx + 1).padStart(2, '0')}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {logoPath && (
                                  <Image
                                    src={logoPath}
                                    alt=""
                                    width={16}
                                    height={16}
                                    className={`h-4 w-4 flex-shrink-0 ${getModelLogoClass(logoPath)}`}
                                    unoptimized
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate max-w-[420px]" style={{ color: 'var(--text-primary)' }}>
                                    {model.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <div className="hidden sm:block h-1 w-16 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, model.score))}%`,
                                      background: idx === 0 ? 'var(--accent-strong)' : 'var(--accent)',
                                    }}
                                  />
                                </div>
                                <span className="w-14 font-mono text-sm font-semibold tabular-nums" style={{ color: idx < 3 ? 'var(--accent)' : 'var(--text-primary)' }}>
                                  {model.score.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            {trackIds.map((trackId) => {
                              const value = model.breakdown?.[trackId] ?? 0;
                              return (
                                <td key={trackId} className="px-3 py-3 text-right hidden md:table-cell">
                                  <span className="inline-flex min-w-[3.25rem] justify-center rounded px-2 py-0.5 font-mono text-xs tabular-nums" style={trackCellStyle(value)}>
                                    {value}%
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right hidden lg:table-cell" style={{ background: 'var(--column-highlight)' }}>
                              <div className="font-mono text-[13px] font-medium tabular-nums" style={{ color: 'var(--accent)' }}>
                                {typeof modelCost?.totalCost === 'number' ? `$${modelCost.totalCost.toFixed(4)}` : '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right hidden lg:table-cell" style={{ background: 'var(--column-highlight)' }}>
                              <div className="font-mono text-[13px] font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                {typeof modelCost?.totalCompletionTokens === 'number' && typeof modelCost?.totalPromptTokens === 'number'
                                  ? (modelCost.totalPromptTokens + modelCost.totalCompletionTokens).toLocaleString()
                                  : '—'}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'value' && (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 pl-1">
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              Accuracy <span style={{ color: 'var(--text-tertiary)' }}>· exact-line solve rate</span>
            </div>
            <ChartControls showPareto={showPareto} onPareto={setShowPareto} scale={costScale} onScale={setCostScale} />
          </div>
        )}

        {activeTab !== 'leaderboard' && (
          <div className="w-full overflow-x-auto">
          <div
            className={`w-full ${activeTab === 'value' ? 'h-[min(78dvh,780px)] min-h-[560px]' : 'h-[min(70dvh,700px)] min-h-[420px]'}`}
            style={{ minWidth: activeTab === 'overall' ? Math.max(640, overallData.length * 64) : 820 }}
          >
          {overallData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No models selected. Use the filter to pick models to chart.
            </div>
          ) : (
            <>
              {activeTab === 'overall' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overallData} margin={{ top: 28, right: 16, left: 28, bottom: 4 }} barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      tick={CustomXAxisTickWithLogo as any}
                      tickLine={false}
                      interval={0}
                      height={136}
                    />
                    <YAxis
                      width={48}
                      domain={[0, 100]}
                      ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                      interval={0}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="score"
                      name="Score (%)"
                      radius={OVERALL_BAR_RADIUS}
                      maxBarSize={72}
                      shape={overallScoreBarShape}
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <LabelList dataKey="score" content={CustomLabel as any} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'value' && (
                <div className="value-chart h-full w-full" data-hovering={hoveredFamily ? '' : undefined}>
                  <style>{valueData.colorCss}</style>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 8, right: LABEL_COLUMN_WIDTH, left: 4, bottom: 36 }}
                      onMouseLeave={() => setHoveredFamily(null)}
                    >
                      <CartesianGrid strokeDasharray="1 7" strokeLinecap="round" vertical={false} className="value-grid" />
                      <XAxis
                        type="number"
                        dataKey="cost"
                        name="Cost per puzzle"
                        scale={costScale}
                        domain={valueData.xDomain}
                        ticks={valueData.xTicks}
                        interval={0}
                        tickFormatter={formatCost}
                        tick={{ fontSize: 12.5, className: 'value-tick' }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={14}
                        allowDataOverflow
                        label={{
                          value: `Cost per puzzle  ·  USD${costScale === 'log' ? ', log scale' : ''}`,
                          position: 'insideBottom',
                          offset: -30,
                          className: 'value-axis-title',
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="score"
                        name="Accuracy"
                        width={52}
                        domain={valueData.yDomain}
                        ticks={valueData.yTicks}
                        interval={0}
                        tick={{ fontSize: 12.5, className: 'value-tick' }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        content={<ValueTooltip familiesByKey={valueData.familiesByKey} />}
                        cursor={false}
                        isAnimationActive={false}
                        offset={18}
                      />
                      {showPareto && (
                        <Scatter
                          data={valueData.frontier}
                          shape={() => <g />}
                          line={{ className: 'frontier-line' }}
                          tooltipType="none"
                          isAnimationActive={false}
                        />
                      )}
                      {valueData.families.map((family) => {
                        const dimmed = hoveredFamily !== null && hoveredFamily !== family.key;
                        const highlighted = hoveredFamily === family.key;
                        const endId = family.points[family.points.length - 1].id;
                        return (
                          <Scatter
                            key={family.key}
                            name={family.name}
                            data={family.points}
                            line={{
                              className: `value-line ${family.colorClass}`,
                              stroke: 'currentColor',
                              strokeWidth: highlighted ? 3.25 : 2.5,
                              strokeOpacity: dimmed ? 0.12 : 1,
                              strokeLinecap: 'round',
                              strokeLinejoin: 'round',
                            }}
                            onMouseEnter={() => setHoveredFamily(family.key)}
                            shape={(props: { cx?: number; cy?: number; payload?: ValuePoint }) => {
                              const { cx, cy, payload } = props;
                              if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                              const isEnd = payload?.id === endId;
                              const r = (isEnd ? 5.5 : 4.25) + (highlighted ? 1 : 0);
                              return (
                                <g className={`value-dot ${family.colorClass}`} opacity={dimmed ? 0.15 : 1}>
                                  {(isEnd || highlighted) && <circle cx={cx} cy={cy} r={r + 5} className="value-halo" />}
                                  <circle cx={cx} cy={cy} r={r} className="value-point" />
                                  {highlighted && payload?.effort && (
                                    <text x={cx} y={cy - r - 10} textAnchor="middle" className="value-effort">
                                      {payload.effort}
                                    </text>
                                  )}
                                </g>
                              );
                            }}
                            isAnimationActive={false}
                          />
                        );
                      })}
                      <ValueOverlay families={valueData.families} hovered={hoveredFamily} onHover={setHoveredFamily} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
          </div>
        </div>
        )}

        <div className="mt-4 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          {activeTab === 'overall' &&
            `Overall score = average across tested puzzle tracks. Showing ${overallData.length} of ${models.length} models; the top ${DEFAULT_CHART_MODELS} are selected by default.`}
          {activeTab === 'leaderboard' && 'Accuracy counts only exact matches of the expected move line. Track cells are shaded by score.'}
          {activeTab === 'value' &&
            `Each line joins one model’s reasoning-effort settings; hover it to see which is which. Labels show each family’s best accuracy.${
              valueData.points.length < modelsByScore.length ? ' Models without cost data are left out.' : ''
            }`}
        </div>
      </section>
    </div>
  );
}
