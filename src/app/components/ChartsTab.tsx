'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import CostChart, { defaultValueSelection, familyColor } from './CostChart';
import ModelFilterDropdown from './ModelFilterDropdown';
import { getModelLogoClass, getModelLogoPath } from './utils';
import { parseModelFamily } from '../lib/models';
import type { ExplorerResults, ModelView } from '../lib/results.types';

const EFFORT_ORDER = ['low', 'medium', 'high'] as const;
type EffortKey = (typeof EFFORT_ORDER)[number];

const TRACK_ORDER = ['mateIn1', 'mate1', 'mateIn2', 'mate2', 'fork', 'pin', 'hangingPiece'];

const TRACK_META: Record<string, { label: string; description: string; color: string }> = {
  mateIn1: { label: 'Mate in 1', description: 'Checkmate in one move', color: 'var(--track-mate1)' },
  mate1: { label: 'Mate in 1', description: 'Checkmate in one move', color: 'var(--track-mate1)' },
  mateIn2: { label: 'Mate in 2', description: 'Forced mate in two moves', color: 'var(--track-mate2)' },
  mate2: { label: 'Mate in 2', description: 'Forced mate in two moves', color: 'var(--track-mate2)' },
  fork: { label: 'Fork', description: 'Attack two pieces at once', color: 'var(--track-fork)' },
  pin: { label: 'Pin', description: 'Immobilize a defended piece', color: 'var(--track-pin)' },
  hangingPiece: { label: 'Hanging', description: 'Capture an undefended piece', color: 'var(--track-hanging)' },
};

function trackInfo(id: string) {
  if (TRACK_META[id]) return TRACK_META[id];
  const label = id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, description: 'Tactic accuracy', color: 'var(--accent)' };
}

type FamilyScalingRow = {
  key: string;
  name: string;
  provider: string;
  logoPath: string | null;
  color: string;
  best: number;
  min: number;
  delta: number | null;
  efforts: Partial<Record<EffortKey, { score: number; id: string }>>;
  singleScore: number | null;
};

function ReasoningScalingCard({ models }: { models: ModelView[] }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const rows = useMemo<FamilyScalingRow[]>(() => {
    const byFamily = new Map<
      string,
      {
        key: string;
        name: string;
        provider: string;
        logoPath: string | null;
        efforts: Partial<Record<EffortKey, { score: number; id: string }>>;
        scores: number[];
      }
    >();

    for (const model of models) {
      const fam = parseModelFamily(model);
      const entry = byFamily.get(fam.key) ?? {
        key: fam.key,
        name: fam.name,
        provider: fam.provider,
        logoPath: getModelLogoPath(model.id),
        efforts: {},
        scores: [],
      };
      const effort = fam.effort?.toLowerCase();
      if (effort === 'low' || effort === 'medium' || effort === 'high') {
        entry.efforts[effort] = { score: model.score, id: model.id };
      }
      entry.scores.push(model.score);
      byFamily.set(fam.key, entry);
    }

    const sorted = [...byFamily.values()].sort(
      (a, b) => Math.max(...b.scores) - Math.max(...a.scores)
    );

    const shadeByLab = new Map<string, number>();
    return sorted.map((item) => {
      const shade = shadeByLab.get(item.provider) ?? 0;
      shadeByLab.set(item.provider, shade + 1);
      const best = Math.max(...item.scores);
      const min = Math.min(...item.scores);
      const presentEfforts = EFFORT_ORDER.filter((e) => item.efforts[e] !== undefined);
      const delta =
        presentEfforts.length >= 2
          ? item.efforts[presentEfforts[presentEfforts.length - 1]]!.score -
            item.efforts[presentEfforts[0]]!.score
          : null;
      return {
        key: item.key,
        name: item.name,
        provider: item.provider,
        logoPath: item.logoPath,
        color: familyColor(item.provider, shade),
        best,
        min,
        delta,
        efforts: item.efforts,
        singleScore: presentEfforts.length === 0 ? best : null,
      };
    });
  }, [models]);

  const hoveredRow = hoveredKey ? rows.find((r) => r.key === hoveredKey) ?? null : null;

  // Zoom the horizontal axis to the actual data range using evenly-spaced ticks that never collide.
  const { minTick, ticks } = useMemo(() => {
    if (rows.length === 0) return { minTick: 0, ticks: [0, 25, 50, 75, 100] };
    const lowest = Math.min(...rows.map((r) => r.min)) - 4;
    if (lowest >= 70) return { minTick: 70, ticks: [70, 80, 90, 100] };
    if (lowest >= 60) return { minTick: 60, ticks: [60, 70, 80, 90, 100] };
    if (lowest >= 40) return { minTick: 40, ticks: [40, 60, 80, 100] };
    if (lowest >= 20) return { minTick: 20, ticks: [20, 40, 60, 80, 100] };
    return { minTick: 0, ticks: [0, 25, 50, 75, 100] };
  }, [rows]);

  const toPct = (score: number) =>
    Math.max(0, Math.min(100, ((score - minTick) / (100 - minTick || 1)) * 100));

  return (
    <section
      className="flex flex-col rounded-xl p-5 sm:p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            Reasoning Effort Scaling
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">
            Accuracy from low to high reasoning per base model
          </p>
        </div>
        <div
          className="flex items-center gap-3.5 text-[11.5px] text-[var(--text-tertiary)]"
          aria-label="Reasoning effort legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border-[1.5px] border-[var(--accent)] bg-[var(--surface)]" />
            low
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full border border-[var(--accent)]"
              style={{ background: 'color-mix(in srgb, var(--accent) 45%, var(--surface))' }}
            />
            med
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            high
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 min-h-[240px] items-center justify-center text-sm text-[var(--text-tertiary)]">
          No models match the current filter.
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between">
          <div>
            {/* Shared percentage scale header */}
            <div className="mb-2 flex items-center gap-4 text-[11px] font-mono tabular-nums text-[var(--text-tertiary)]">
              <div className="w-[136px] sm:w-[158px] shrink-0" />
              <div className="relative flex-1 h-4">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                    style={{ left: `${toPct(tick)}%` }}
                  >
                    {tick}%
                  </span>
                ))}
              </div>
              <div className="w-[84px] sm:w-[94px] shrink-0 text-right">Best / Δ</div>
            </div>

            <div
              className="flex flex-col divide-y divide-[var(--border-subtle)]/80"
              onMouseLeave={() => setHoveredKey(null)}
            >
              {rows.map((row) => {
                const isHovered = hoveredKey === row.key;
                const dimmed = hoveredKey !== null && !isHovered;
                return (
                  <div
                    key={row.key}
                    onMouseEnter={() => setHoveredKey(row.key)}
                    className="flex items-center gap-4 rounded-md px-1.5 -mx-1.5 py-2.5 transition-[background-color,opacity]"
                    style={{
                      background: isHovered ? 'var(--row-hover)' : undefined,
                      opacity: dimmed ? 0.45 : 1,
                    }}
                  >
                    <div className="flex w-[136px] sm:w-[158px] shrink-0 items-center gap-2 min-w-0">
                      {row.logoPath && (
                        <Image
                          src={row.logoPath}
                          alt=""
                          width={15}
                          height={15}
                          className={`h-[15px] w-[15px] shrink-0 ${getModelLogoClass(row.logoPath)}`}
                          unoptimized
                        />
                      )}
                      <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                        {row.name}
                      </span>
                    </div>

                    {/* Zoomed horizontal dumbbell track */}
                    <div className="relative flex-1 h-5 flex items-center">
                      {ticks.slice(1, -1).map((tick) => (
                        <span
                          key={tick}
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0.5 bottom-0.5 w-px bg-[var(--border-subtle)]/70"
                          style={{ left: `${toPct(tick)}%` }}
                        />
                      ))}
                      <span
                        aria-hidden="true"
                        className="h-[1.5px] w-full rounded-full bg-[var(--border-subtle)]"
                      />
                      {row.best > row.min && (
                        <span
                          aria-hidden="true"
                          className="absolute h-[2.5px] rounded-full"
                          style={{
                            left: `${toPct(row.min)}%`,
                            width: `${Math.max(0.5, toPct(row.best) - toPct(row.min))}%`,
                            background: row.color,
                            opacity: 0.75,
                          }}
                        />
                      )}
                      {row.efforts.low && (
                        <span
                          title={`${row.name} [low]: ${row.efforts.low.score.toFixed(1)}%`}
                          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border-[1.75px]"
                          style={{
                            left: `${toPct(row.efforts.low.score)}%`,
                            borderColor: row.color,
                            background: 'var(--surface)',
                          }}
                        />
                      )}
                      {row.efforts.medium && (
                        <span
                          title={`${row.name} [medium]: ${row.efforts.medium.score.toFixed(1)}%`}
                          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border"
                          style={{
                            left: `${toPct(row.efforts.medium.score)}%`,
                            borderColor: row.color,
                            background: `color-mix(in oklch, ${row.color} 50%, var(--surface))`,
                          }}
                        />
                      )}
                      {row.efforts.high && (
                        <span
                          title={`${row.name} [high]: ${row.efforts.high.score.toFixed(1)}%`}
                          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                          style={{
                            left: `${toPct(row.efforts.high.score)}%`,
                            background: row.color,
                            boxShadow: `0 0 0 3px color-mix(in oklch, ${row.color} 20%, transparent)`,
                          }}
                        />
                      )}
                      {row.singleScore !== null && (
                        <span
                          title={`${row.name}: ${row.singleScore.toFixed(1)}%`}
                          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                          style={{ left: `${toPct(row.singleScore)}%`, background: row.color }}
                        />
                      )}
                    </div>

                    {/* Best score + effort gain */}
                    <div className="flex w-[84px] sm:w-[94px] shrink-0 items-baseline justify-end gap-1.5 font-mono tabular-nums">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {row.best.toFixed(1)}%
                      </span>
                      {row.delta !== null ? (
                        <span
                          className="w-10 text-right text-[11px] font-medium"
                          style={{
                            color:
                              row.delta > 0.05
                                ? 'var(--success)'
                                : row.delta < -0.05
                                  ? 'var(--danger)'
                                  : 'var(--text-tertiary)',
                          }}
                        >
                          {row.delta > 0 ? `+${row.delta.toFixed(1)}` : row.delta.toFixed(1)}
                        </span>
                      ) : (
                        <span className="w-10 text-right text-[11px] text-[var(--text-tertiary)]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive readout footer */}
          <div className="mt-4 flex min-h-[24px] items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-[12px] text-[var(--text-tertiary)]">
            {hoveredRow ? (
              <>
                <span className="font-medium text-[var(--text-secondary)] truncate">
                  {hoveredRow.name}
                </span>
                <div className="flex items-center gap-3.5 font-mono tabular-nums shrink-0">
                  {EFFORT_ORDER.map((eff) => {
                    const pt = hoveredRow.efforts[eff];
                    if (!pt) return null;
                    return (
                      <span key={eff}>
                        <span className="text-[var(--text-tertiary)]">{eff} </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {pt.score.toFixed(1)}%
                        </span>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <span>Hover any row for exact low, medium, and high scores.</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TacticBreakdownCard({
  models,
  puzzles,
}: {
  models: ModelView[];
  puzzles: ExplorerResults['puzzles'];
}) {
  const tacticRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const puzzle of puzzles) {
      counts.set(puzzle.level, (counts.get(puzzle.level) ?? 0) + 1);
    }
    const rank = (id: string) => TRACK_ORDER.indexOf(id) + 1 || TRACK_ORDER.length + 1;
    const ids = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

    return ids.map((id) => {
      const info = trackInfo(id);
      const entries = models
        .map((m) => ({ model: m, value: m.breakdown?.[id] }))
        .filter((e): e is { model: ModelView; value: number } => typeof e.value === 'number');

      if (entries.length === 0) {
        return {
          id,
          ...info,
          count: counts.get(id) ?? 0,
          avg: 0,
          min: 0,
          max: 0,
          topModel: null as ModelView | null,
        };
      }

      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      let topModel: ModelView | null = null;
      for (const e of entries) {
        sum += e.value;
        if (e.value < min) min = e.value;
        if (e.value > max) {
          max = e.value;
          topModel = e.model;
        }
      }
      return {
        id,
        ...info,
        count: counts.get(id) ?? 0,
        avg: sum / entries.length,
        min,
        max,
        topModel,
      };
    });
  }, [models, puzzles]);

  return (
    <section
      className="flex flex-col rounded-xl p-5 sm:p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            Accuracy by Tactic
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">
            Average accuracy and min–max spread across selected runs
          </p>
        </div>
        <div
          className="flex items-center gap-3.5 text-[11.5px] text-[var(--text-tertiary)]"
          aria-label="Tactic chart legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-3.5 rounded-full bg-[var(--accent)]" />
            avg
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-3.5 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--accent) 28%, transparent)' }}
            />
            range
          </span>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="flex flex-1 min-h-[240px] items-center justify-center text-sm text-[var(--text-tertiary)]">
          No models match the current filter.
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between divide-y divide-[var(--border-subtle)]/80">
          {tacticRows.map((row) => {
            const topLogo = row.topModel ? getModelLogoPath(row.topModel.id) : null;
            return (
              <div key={row.id} className="py-3.5 first:pt-1 last:pb-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium text-[var(--text-primary)]">
                    {row.label}
                  </span>
                  <div className="flex items-baseline gap-2.5 shrink-0 font-mono tabular-nums">
                    <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                      {row.avg.toFixed(1)}%
                    </span>
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">
                      {row.min.toFixed(0)}–{row.max.toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Clean slim bar: average fill + min-max spread */}
                <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                  <div
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{
                      left: `${Math.max(0, Math.min(100, row.min))}%`,
                      width: `${Math.max(0, Math.min(100, row.max) - Math.max(0, Math.min(100, row.min)))}%`,
                      background: `color-mix(in srgb, ${row.color} 24%, transparent)`,
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 left-0 rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, row.avg))}%`,
                      background: row.color,
                      opacity: 0.9,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 rounded-full"
                    style={{
                      left: `${Math.max(0, Math.min(100, row.max))}%`,
                      background: 'var(--text-primary)',
                      opacity: 0.75,
                    }}
                  />
                </div>

                {row.topModel && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-tertiary)]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {topLogo && (
                        <Image
                          src={topLogo}
                          alt=""
                          width={12}
                          height={12}
                          className={`h-3 w-3 shrink-0 ${getModelLogoClass(topLogo)}`}
                          unoptimized
                        />
                      )}
                      <span className="truncate text-[var(--text-secondary)]">
                        {row.topModel.name}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono tabular-nums" style={{ color: row.color }}>
                      {row.max.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ChartsTab({ results }: { results: ExplorerResults }) {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() =>
    defaultValueSelection(results.models)
  );
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const modelFilterOptions = useMemo(() => {
    return [...results.models]
      .sort((a, b) => b.score - a.score)
      .filter((m) =>
        normalizedQuery.length === 0
          ? true
          : m.name.toLowerCase().includes(normalizedQuery) ||
            m.id.toLowerCase().includes(normalizedQuery)
      )
      .map((m) => ({ id: m.id, label: m.name }));
  }, [results.models, normalizedQuery]);

  const filteredModels = useMemo(() => {
    return results.models
      .filter((m) => selectedModels.has(m.id))
      .filter((m) =>
        normalizedQuery.length === 0
          ? true
          : m.name.toLowerCase().includes(normalizedQuery) ||
            m.id.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.score - a.score);
  }, [results.models, selectedModels, normalizedQuery]);

  const costInputs = useMemo(
    () =>
      filteredModels.map((m) => ({
        id: m.id,
        name: m.name,
        score: m.score,
        totalCost: m.summary.totalCost,
        avgLatencyMs: m.summary.avgLatencyMs,
        avgCompletionTokens: m.summary.avgCompletionTokens,
      })),
    [filteredModels]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Primary Hero Chart: Efficiency Frontier */}
      <section
        id="charts"
        className="rounded-xl p-4 sm:p-6 scroll-mt-8"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="mb-5 flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              Efficiency Frontier
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              What each point of accuracy costs in money, time, or tokens. Up and to the left is better.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[160px] sm:flex-none sm:min-w-[210px]">
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
              totalCount={results.models.length}
              label="Filter models"
            />
          </div>
        </div>

        <CostChart
          models={costInputs}
          onReset={() => {
            setSearchQuery('');
            setSelectedModels(defaultValueSelection(results.models));
          }}
        />
      </section>

      {/* Secondary Analytics Grid: Effort Scaling + Tactic Breakdown */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 items-stretch">
        <ReasoningScalingCard models={filteredModels} />
        <TacticBreakdownCard models={filteredModels} puzzles={results.puzzles} />
      </div>
    </div>
  );
}
