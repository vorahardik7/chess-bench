'use client';

import Image from 'next/image';
import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Trophy,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Check,
  Filter,
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
} from 'recharts';
import type { BarShapeProps } from 'recharts';
import { getModelLogoPath } from './utils';
import type { ExplorerResults } from '../lib/results.types';
type BenchModel = {
  id: string;
  name: string;
  score: number;
  breakdown?: Record<string, number>;
};

const CHART_COLORS = {
  primary: '#2563eb',
  success: '#16a34a',
  info: '#3b82f6',
  warning: '#d97706',
  purple: '#7c3aed',
};

const OVERALL_BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];

function overallScoreBarShape(props: BarShapeProps) {
  const fill =
    props.index === 0
      ? CHART_COLORS.primary
      : `rgba(37, 99, 235, ${0.85 - props.index * 0.06})`;
  return <Rectangle {...props} fill={fill} radius={OVERALL_BAR_RADIUS} />;
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
  label = 'Filter models',
}: {
  selected: Set<string>;
  options: { id: string; label: string }[];
  onChange: (selected: Set<string>) => void;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleItem = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onChange(newSelected);
  };

  const selectAll = () => {
    onChange(new Set(options.map((o) => o.id)));
  };

  const selectNone = () => {
    onChange(new Set());
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        <Filter className="w-3.5 h-3.5" />
        <span>{label}</span>
        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          {selected.size}/{options.length}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 top-full mt-1 w-64 max-h-80 overflow-y-auto overscroll-none rounded-lg shadow-lg"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {/* Quick actions */}
            <div className="flex items-center gap-2 p-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Clear
              </button>
            </div>

            {/* Options */}
            <div className="p-1">
              {options.map((option) => {
                const isChecked = selected.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleItem(option.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                      style={{
                        background: isChecked ? 'var(--accent)' : 'var(--surface)',
                        border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                      }}
                    >
                      {isChecked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <div className="rounded-lg px-4 py-3 shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{label}</div>
      <div className="space-y-1">
        {payload.map((p, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: p.color ?? '#a3a3a3' }}
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
      fill="#5a6070"
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
              style={{ opacity: 0.7 }}
            />
          )}
          <text
            x={logoPath ? -4 : 0}
            y={0}
            dy={16}
            fill="#5a6070"
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
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'overall'>('leaderboard');
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set(results.models.map((model) => model.id))
  );
  const [searchQuery, setSearchQuery] = useState('');
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
        className="rounded-xl p-5 scroll-mt-8"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Benchmarks</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {activeTab === 'leaderboard'
                ? 'Sortable leaderboard across models'
                : 'Visual comparison across models'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="px-3 py-2 rounded-lg text-xs min-w-[180px] sm:min-w-[220px]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {/* Model filter dropdown */}
            <MultiSelectDropdown
              selected={selectedModels}
              options={modelFilterOptions}
              onChange={setSelectedModels}
              label="Filter models"
            />

            {/* Tabs as compact segment control */}
            <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--border-subtle)' }}>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                    style={{
                      background: activeTab === tab.key ? 'var(--surface)' : 'transparent',
                      color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      boxShadow: activeTab === tab.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <Icon className="w-3 h-3" />
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
                No benchmarks yet. Keep building the table layout, then plug data in later.
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-4 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--border-subtle)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{leaderboardModels.length}</span> models
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-1 rounded-md font-mono" style={{ color: 'var(--text-secondary)', background: '#eef2f7' }}>
                      Total Cost: {selectedCostTotals.totalCost.toFixed(4)}
                    </span>
                    <span className="text-[11px] px-2 py-1 rounded-md font-mono hidden sm:inline-block" style={{ color: 'var(--text-secondary)', background: '#eef2f7' }}>
                      Total Tokens: {selectedCostTotals.totalTokens.toLocaleString()}
                    </span>
                    <div className="text-[11px] hidden lg:block" style={{ color: 'var(--text-tertiary)' }}>
                      Click headers to sort
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider" style={{ color: '#64748b', background: '#f1f3f6', borderBottom: '2px solid var(--border)' }}>
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
                        <th className="px-4 py-2.5 text-right font-semibold hidden lg:table-cell">
                          <button
                            type="button"
                            onClick={() => toggleSort('totalCost')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Total Cost
                            <SortIcon active={sortKey === 'totalCost'} dir={sortDir} />
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold hidden lg:table-cell">
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
                        const rankColor =
                          idx === 0
                            ? '#b45309'
                            : idx === 1
                              ? '#475569'
                              : idx === 2
                                ? '#92400e'
                                : '#94a3b8';
                        return (
                          <tr
                            key={model.id}
                            className="transition-colors"
                            style={{
                              borderTop: '1px solid var(--border-subtle)',
                              background: idx % 2 === 0 ? '#ffffff' : '#f8f9fb',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2f7'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#f8f9fb'; }}
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono text-sm font-bold" style={{ color: rankColor }}>#{idx + 1}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {getModelLogoPath(model.id) && (
                                  <Image
                                    src={getModelLogoPath(model.id)!}
                                    alt=""
                                    width={16}
                                    height={16}
                                    className="w-4 h-4 flex-shrink-0 mr-1"
                                    style={{ opacity: 0.7 }}
                                    unoptimized
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="font-medium truncate max-w-[420px]" style={{ color: 'var(--text-primary)' }}>
                                    {model.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{model.score.toFixed(1)}%</div>
                            </td>
                            {trackIds.map((trackId) => (
                              <td key={trackId} className="px-4 py-3 text-right hidden md:table-cell">
                                <span className="inline-flex items-center justify-end px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: '#eef2f7', color: '#334155' }}>
                                  {model.breakdown?.[trackId] ?? 0}%
                                </span>
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right hidden lg:table-cell">
                              <div className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {typeof modelCost?.totalCost === 'number' ? modelCost.totalCost.toFixed(4) : '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right hidden lg:table-cell">
                              <div className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
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

        {activeTab !== 'leaderboard' && (
          <div className="w-full h-[400px]">
          {overallData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No benchmark scores yet. Charts will appear here once results are loaded.
            </div>
          ) : (
            <>
              {activeTab === 'overall' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overallData} margin={{ top: 30, right: 20, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      tick={CustomXAxisTickWithLogo as any}
                      axisLine={{ stroke: 'rgba(0,0,0,0.1)' }}
                      tickLine={false}
                      interval={0}
                      height={80}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: '#5a6070', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(0,0,0,0.1)' }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                    <Bar
                      dataKey="score"
                      name="Score (%)"
                      radius={OVERALL_BAR_RADIUS}
                      maxBarSize={50}
                      shape={overallScoreBarShape}
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <LabelList dataKey="score" content={CustomLabel as any} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

            </>
          )}
        </div>
        )}

        <div className="mt-4 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          {activeTab === 'overall' && 'Overall score = average across tested puzzle tracks.'}
          {activeTab === 'leaderboard' && 'Sort by accuracy and track-level breakdown; includes total cost and total tokens.'}
        </div>
      </section>
    </div>
  );
}
