'use client';

import Image from 'next/image';
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { getModelLogoPath, getModelLogoClass } from './utils';
import ModelFilterDropdown from './ModelFilterDropdown';
import { countBaseModels } from '../lib/models';
import type { ExplorerResults } from '../lib/results.types';

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
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set([...results.models].sort((a, b) => b.score - a.score).map((model) => model.id))
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
    const sorted = [...modelsByScore];

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

    sorted.sort((a, b) => {
      if (sortKey === 'name') {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const va = getNumeric(a);
      const vb = getNumeric(b);
      const cmp = va === vb ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [costByModel, modelsByScore, sortDir, sortKey]);

  const selectedBaseModelCount = useMemo(
    () => countBaseModels(leaderboardModels),
    [leaderboardModels]
  );

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
              Standings
            </h2>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              Every model run, ranked by puzzles solved
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
            <ModelFilterDropdown
              selected={selectedModels}
              options={modelFilterOptions}
              onChange={setSelectedModels}
              totalCount={models.length}
              label="Filter models"
            />
          </div>
        </div>

        <div className="w-full">
          {leaderboardModels.length === 0 ? (
            <div className="h-[320px] flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No models match this search or filter.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{selectedBaseModelCount}</span>{' '}
                  {selectedBaseModelCount === 1 ? 'model' : 'models'}
                  <span className="mx-1.5 opacity-50">·</span>
                  <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{leaderboardModels.length}</span>{' '}
                  {leaderboardModels.length === 1 ? 'run' : 'runs'}
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

        <div className="mt-3 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          Accuracy is the share of puzzles solved, judged move by move as on Lichess. Tactic columns show the percent solved, shaded by score.
        </div>
      </section>
    </div>
  );
}
