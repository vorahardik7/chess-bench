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
          ? 'bg-[var(--accent-light)] border-[var(--accent-border)] text-[var(--accent)]'
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
type ValuePoint = { id: string; name: string; cost: number; score: number; onFrontier: boolean };

// A model is on the frontier when no cheaper model scores at least as well.
function splitByFrontier(points: Omit<ValuePoint, 'onFrontier'>[]): ValuePoint[] {
  const byCost = [...points].sort((a, b) => a.cost - b.cost || b.score - a.score);
  let best = -Infinity;
  return byCost.map((p) => {
    const onFrontier = p.score > best;
    if (onFrontier) best = p.score;
    return { ...p, onFrontier };
  });
}

function costTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let exp = Math.floor(Math.log10(min)); exp <= Math.ceil(Math.log10(max)); exp += 1) {
    for (const m of [1, 3]) {
      const v = m * 10 ** exp;
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
}

function formatCostTick(v: number) {
  if (v >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(v >= 0.1 ? 1 : 2)}`;
}

function ValueDot(props: { cx?: number; cy?: number; payload?: ValuePoint }) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return <g />;
  if (!payload.onFrontier) {
    return <circle cx={cx} cy={cy} r={4.5} className="value-dot" />;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={6.5} className="value-dot-frontier" />
      <text x={cx + 10} y={cy - 8} fontSize={11} fontWeight={600} className="chart-label">
        {payload.name}
      </text>
    </g>
  );
}

function ValueTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ValuePoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div
      className="rounded-lg px-3.5 py-2.5 text-sm"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-pop)' }}
    >
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{point.name}</div>
      <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 font-mono text-xs">
        <span style={{ color: 'var(--text-tertiary)' }}>Accuracy</span>
        <span className="text-right" style={{ color: 'var(--text-primary)' }}>{point.score.toFixed(1)}%</span>
        <span style={{ color: 'var(--text-tertiary)' }}>Total cost</span>
        <span className="text-right" style={{ color: 'var(--text-primary)' }}>${point.cost.toFixed(4)}</span>
      </div>
      {point.onFrontier && (
        <div className="mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          Best accuracy at this price or lower
        </div>
      )}
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
    return { leaderboard: new Set(byScore), overall: new Set(topTen), value: new Set(topTen) };
  });
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
    const points = modelsByScore.flatMap((m) => {
      const cost = results.models.find((r) => r.id === m.id)?.summary.totalCost;
      return typeof cost === 'number' && cost > 0 ? [{ id: m.id, name: m.name, cost, score: m.score }] : [];
    });
    const all = splitByFrontier(points);
    const costs = all.map((p) => p.cost);
    const yMin = all.length ? Math.max(0, Math.floor((Math.min(...all.map((p) => p.score)) - 5) / 10) * 10) : 0;
    const domain: [number, number] = costs.length
      ? [Math.min(...costs) / 1.4, Math.max(...costs) * 1.4]
      : [0.01, 1];
    return {
      frontier: all.filter((p) => p.onFrontier),
      others: all.filter((p) => !p.onFrontier),
      domain,
      ticks: costTicks(domain[0], domain[1]),
      yTicks: Array.from(
        { length: 11 - yMin / 10 },
        (_, i) => yMin + i * 10
      ),
      yMin,
    };
  }, [modelsByScore, results.models]);

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
                  : 'Total run cost against accuracy for each selected model'}
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

        {activeTab === 'value' && valueData.frontier.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="inline-flex items-center gap-2">
              <svg width="28" height="10" aria-hidden="true">
                <line x1="0" y1="5" x2="28" y2="5" className="frontier-line" />
                <circle cx="14" cy="5" r="4" className="value-dot-frontier" />
              </svg>
              Best value: no cheaper selected model scores higher
            </span>
            <span className="inline-flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" className="value-dot" />
              </svg>
              Other selected models (hover for details)
            </span>
          </div>
        )}

        {activeTab !== 'leaderboard' && (
          <div className="w-full overflow-x-auto">
          <div
            className="h-[min(70dvh,700px)] min-h-[420px] w-full"
            style={{ minWidth: activeTab === 'overall' ? Math.max(640, overallData.length * 64) : 640 }}
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
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 24, right: 110, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="cost"
                      name="Total cost"
                      scale="log"
                      domain={valueData.domain}
                      ticks={valueData.ticks}
                      tickFormatter={formatCostTick}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      allowDataOverflow
                      label={{ value: 'Total cost to run the benchmark (log scale)', position: 'insideBottom', offset: -16, className: 'chart-text', fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="score"
                      name="Accuracy"
                      width={48}
                      domain={[valueData.yMin, 100]}
                      ticks={valueData.yTicks}
                      interval={0}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<ValueTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter data={valueData.others} shape={ValueDot} isAnimationActive={false} />
                    <Scatter
                      data={valueData.frontier}
                      shape={ValueDot}
                      line={{ className: 'frontier-line' }}
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
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
            `Up and to the left is better. Best value is worked out from the models currently selected.${
              valueData.frontier.length + valueData.others.length < modelsByScore.length
                ? ' Models without cost data are left out.'
                : ''
            }`}
        </div>
      </section>
    </div>
  );
}
