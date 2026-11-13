'use client';

import Image from 'next/image';
import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Trophy,
  ChartScatter,
  ChevronDown,
  ChevronUp,
  Check,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { getModelLogoPath, getModelLogoClass, getProviderLabel, getModelProvider } from './utils';
import type { ExplorerResults } from '../lib/results.types';
import CostChart, { defaultValueSelection } from './CostChart';
type BenchModel = {
  id: string;
  name: string;
  score: number;
  breakdown?: Record<string, number>;
};

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
            className="absolute left-0 right-auto sm:left-auto sm:right-0 z-50 top-full mt-1 h-[min(26rem,calc(100vh-160px))] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg shadow-lg flex flex-col"
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

type ChartTab = 'leaderboard' | 'value';

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
    return { leaderboard: new Set(byScore), value: defaultValueSelection(results.models) };
  });
  const [queryByTab, setQueryByTab] = useState<Record<ChartTab, string>>({ leaderboard: '', value: '' });
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

  // Rank by accuracy across every model, so it stays put when the table is sorted or filtered.
  // Ties share a rank (1, 2, 2, 4).
  const rankById = useMemo(() => {
    const sorted = [...models].sort((a, b) => b.score - a.score);
    const ranks = new Map<string, number>();
    sorted.forEach((m, i) => {
      const prev = sorted[i - 1];
      ranks.set(m.id, prev && prev.score === m.score ? ranks.get(prev.id)! : i + 1);
    });
    return ranks;
  }, [models]);

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

  const costInputs = useMemo(
    () =>
      modelsByScore.flatMap((m) => {
        const summary = results.models.find((r) => r.id === m.id)?.summary;
        return summary
          ? [{
              id: m.id,
              name: m.name,
              score: m.score,
              totalCost: summary.totalCost,
              avgLatencyMs: summary.avgLatencyMs,
              avgCompletionTokens: summary.avgCompletionTokens,
            }]
          : [];
      }),
    [modelsByScore, results.models]
  );

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

  const tabs = [
    { key: 'leaderboard', label: 'Table', icon: Trophy },
    { key: 'value', label: 'Efficiency', icon: ChartScatter },
  ] as const;

  const trackIds = useMemo(() => {
    const ids = new Set<string>();
    puzzles.forEach((p) => {
      ids.add(p.level);
    });
    const order = ['mateIn1', 'mate1', 'mateIn2', 'mate2', 'fork', 'pin', 'hangingPiece'];
    const rank = (id: string) => (order.indexOf(id) + 1) || order.length + 1;
    return Array.from(ids).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
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
    if (mateMatch) return `Mate in ${mateMatch[1]}`;
    if (id === 'hangingPiece') return 'Hanging';
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

  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;

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
              {activeTab === 'leaderboard' ? 'Standings' : 'Efficiency'}
            </h2>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {activeTab === 'leaderboard'
                ? 'Every model, ranked by puzzles solved'
                : 'What each point of accuracy costs in money, time or tokens. Up and to the left is better'}
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
              className="flex h-9 w-full items-center gap-0.5 rounded-lg p-1 sm:w-auto"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
              role="group"
              aria-label="View"
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
                    className={`flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors sm:flex-none ${
                      isActive ? '' : 'hover:bg-[var(--row-hover)] hover:text-[var(--text-primary)]'
                    }`}
                    style={{
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                      boxShadow: isActive ? 'inset 0 0 0 1px var(--accent-border)' : undefined,
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
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
                      className="inline-flex items-baseline gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Total cost
                      <span className="font-mono text-[13px] font-semibold normal-case tracking-normal" style={{ color: 'var(--text-primary)' }}>
                        ${selectedCostTotals.totalCost.toFixed(2)}
                      </span>
                    </span>
                    <span
                      className="hidden sm:inline-flex items-baseline gap-1.5 border-l border-[var(--border)] pl-3 pr-1 text-[11px] font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Total tokens
                      <span className="font-mono text-[13px] font-semibold normal-case tracking-normal" style={{ color: 'var(--text-primary)' }}>
                        {selectedCostTotals.totalTokens.toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-[12.5px] uppercase tracking-[0.06em] [&_th]:py-3 [&_button:hover]:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
                        <th scope="col" className="px-3 sm:px-4 py-2.5 text-left font-semibold w-[44px] sm:w-[60px]">#</th>
                        <th scope="col" aria-sort={ariaSort('name')} className="px-4 py-2.5 text-left font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-2 transition-colors"
                          >
                            Model
                            <SortIcon active={sortKey === 'name'} dir={sortDir} />
                          </button>
                        </th>
                        <th scope="col" aria-sort={ariaSort('score')} className="px-4 py-2.5 pr-6 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('score')}
                            className="inline-flex flex-row-reverse items-center gap-1.5 transition-colors"
                          >
                            Accuracy
                            <SortIcon active={sortKey === 'score'} dir={sortDir} />
                          </button>
                        </th>
                        {trackIds.map((trackId) => (
                          <th key={trackId} scope="col" aria-sort={ariaSort(trackSortKey(trackId))} className="w-[92px] px-2 py-2.5 text-center font-semibold hidden md:table-cell whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleSort(trackSortKey(trackId))}
                              className="relative inline-flex items-center transition-colors"
                              title={`${trackLabel(trackId)}: ${trackDescription(trackId)}`}
                            >
                              {trackLabel(trackId)}
                              <span className="absolute top-1/2 -right-4 -translate-y-1/2">
                                <SortIcon active={sortKey === trackSortKey(trackId)} dir={sortDir} />
                              </span>
                            </button>
                          </th>
                        ))}
                        <th scope="col" aria-sort={ariaSort('totalCost')} className="w-[120px] pl-6 pr-4 py-2.5 text-right font-semibold hidden lg:table-cell whitespace-nowrap" style={{ background: 'var(--column-highlight)' }}>
                          <button
                            type="button"
                            onClick={() => toggleSort('totalCost')}
                            className="inline-flex flex-row-reverse items-center gap-1.5 transition-colors"
                          >
                            Total Cost
                            <SortIcon active={sortKey === 'totalCost'} dir={sortDir} />
                          </button>
                        </th>
                        <th scope="col" aria-sort={ariaSort('totalTokens')} className="w-[136px] px-4 py-2.5 text-right font-semibold hidden lg:table-cell whitespace-nowrap" style={{ background: 'var(--column-highlight)' }}>
                          <button
                            type="button"
                            onClick={() => toggleSort('totalTokens')}
                            className="inline-flex flex-row-reverse items-center gap-1.5 transition-colors"
                          >
                            Total Tokens
                            <SortIcon active={sortKey === 'totalTokens'} dir={sortDir} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardModels.map((model) => {
                        const modelCost = costByModel.get(model.id);
                        const rank = rankById.get(model.id) ?? 0;
                        const rankColor = RANK_COLORS[rank - 1] ?? 'var(--text-tertiary)';
                        const logoPath = getModelLogoPath(model.id);
                        return (
                          <tr
                            key={model.id}
                            className="transition-colors even:bg-[var(--row-alt)] hover:bg-[var(--row-hover)]"
                            style={{ borderTop: '1px solid var(--border-subtle)' }}
                          >
                            <td className="px-3 sm:px-4 py-3">
                              <div className="font-mono text-sm font-semibold tabular-nums" style={{ color: rankColor }}>
                                {String(rank).padStart(2, '0')}
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
                                  <div className="text-sm font-medium break-words sm:truncate sm:max-w-[420px]" style={{ color: 'var(--text-primary)' }}>
                                    {model.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 pr-6 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <div className="hidden sm:block h-1 w-16 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, model.score))}%`,
                                      background: rank === 1 ? 'var(--accent-strong)' : 'var(--accent)',
                                    }}
                                  />
                                </div>
                                <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums" style={{ color: rank <= 3 ? 'var(--accent)' : 'var(--text-primary)' }}>
                                  {model.score.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            {trackIds.map((trackId) => {
                              const value = model.breakdown?.[trackId] ?? 0;
                              return (
                                <td key={trackId} className="px-2 py-3 text-center hidden md:table-cell">
                                  <span
                                    className="inline-block w-[3.25rem] rounded py-0.5 text-center font-mono text-xs tabular-nums"
                                    style={trackCellStyle(value)}
                                    title={`${trackLabel(trackId)}: ${value}% solved`}
                                  >
                                    {value.toFixed(1)}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="pl-6 pr-4 py-3 text-right font-mono text-[13px] tabular-nums hidden lg:table-cell" style={{ background: 'var(--column-highlight)', color: 'var(--text-secondary)' }}>
                              {typeof modelCost?.totalCost === 'number' ? `$${modelCost.totalCost.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums hidden lg:table-cell" style={{ background: 'var(--column-highlight)', color: 'var(--text-secondary)' }}>
                              {typeof modelCost?.totalCompletionTokens === 'number' && typeof modelCost?.totalPromptTokens === 'number'
                                ? (modelCost.totalPromptTokens + modelCost.totalCompletionTokens).toLocaleString()
                                : '—'}
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
          <CostChart
            models={costInputs}
            onReset={() => setSelectedModels(defaultValueSelection(results.models))}
          />
        )}

        {activeTab === 'leaderboard' && (
          <div className="mt-3 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
            Accuracy is the share of puzzles solved, judged move by move as on Lichess. Tactic columns show the percent solved, shaded by score.
          </div>
        )}
      </section>
    </div>
  );
}
