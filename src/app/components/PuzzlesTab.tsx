'use client';

import { useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import Image from 'next/image';
import ChessBoard, { ARROW_COLORS } from './ChessBoard';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import type { ExplorerResults, ModelView, PuzzleAttemptView } from '../lib/results.types';
import { getDisplayFen, getModelLogoClass, getModelLogoPath } from './utils';
import { parseStatusLabel } from '../lib/parse-status';

function InfoTip({ text, label = 'More info' }: { text: string; label?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();

  const show = () => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 224;
    // Flip above the trigger when there isn't room below.
    const above = rect.bottom + 72 > window.innerHeight;
    setPos({
      above,
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
    });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={pos ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (pos ? hide() : show())}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <Info className="h-3 w-3" />
      </button>
      {pos && (
        <span
          id={tipId}
          role="tooltip"
          className={`fixed z-[9999] w-56 rounded-md px-3 py-2 text-[12px] leading-[18px] font-normal normal-case tracking-normal pointer-events-none ${pos.above ? '-translate-y-full' : ''}`}
          style={{ boxShadow: 'var(--shadow-pop)', background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)', top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </>
  );
}

type ModelOption = { id: string; label: string; sublabel?: string };

// ============================================================================
// CUSTOM DROPDOWN COMPONENT
// ============================================================================
function CustomDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  searchPlaceholder = 'Search...',
}: {
  value: string;
  options: { id: string; label: string; sublabel?: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
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
    if (!isOpen || !searchable) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen, searchable]);

  const selected = options.find((o) => o.id === value);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!searchable || normalizedQuery.length === 0) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(normalizedQuery) ||
        o.sublabel?.toLowerCase().includes(normalizedQuery) ||
        o.id.toLowerCase().includes(normalizedQuery)
    );
  }, [options, searchable, normalizedQuery]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (isOpen) setQuery('');
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-colors"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {selected?.label ?? placeholder}
          </div>
          {selected?.sublabel && (
            <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{selected.sublabel}</div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
            className="absolute z-50 top-full mt-1 w-full max-h-[min(22rem,calc(100vh-180px))] overflow-hidden rounded-lg shadow-lg flex flex-col"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {searchable && (
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
                  placeholder={searchPlaceholder}
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
            )}
            <div className="overflow-y-auto overscroll-none custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  No matches found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{
                      background: value === option.id ? 'var(--accent-light)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (value !== option.id) e.currentTarget.style.background = 'var(--border-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = value === option.id ? 'var(--accent-light)' : 'transparent';
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {option.label}
                      </div>
                      {option.sublabel && (
                        <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {option.sublabel}
                        </div>
                      )}
                    </div>
                    {value === option.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const TRACK_DESCRIPTIONS: Record<string, string> = {
  mateIn1: 'Force checkmate in one move.',
  mateIn2: 'Force checkmate in two moves (3 plies).',
  mate1: 'Force checkmate in one move.',
  mate2: 'Force checkmate in two moves (3 plies).',
  fork: 'Attack two or more enemy pieces at once.',
  pin: 'A piece is stuck because moving it loses a more valuable piece.',
  hangingPiece: 'Win an undefended enemy piece.',
};

function getTrackDescription(level: string): string {
  const known = TRACK_DESCRIPTIONS[level];
  if (known) return known;
  const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(level);
  if (mateMatch) {
    const n = Number(mateMatch[1]);
    return `Force checkmate in ${n} move${n === 1 ? '' : 's'}.`;
  }
  return 'Find the best tactical line.';
}

function formatTrackLabel(level: string): string {
  if (level in TRACK_DESCRIPTIONS) {
    if (level === 'hangingPiece') return 'Hanging Piece';
    return level === 'mate1' || level === 'mateIn1'
      ? 'Mate in 1'
      : level === 'mate2' || level === 'mateIn2'
      ? 'Mate in 2'
      : level.charAt(0).toUpperCase() + level.slice(1);
  }
  const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(level);
  if (mateMatch) return `Mate in ${mateMatch[1]}`;
  return level
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function trackBadge(colorVar: string) {
  return {
    background: `color-mix(in srgb, var(${colorVar}) 13%, transparent)`,
    color: `var(${colorVar})`,
  };
}

function getPuzzleDescription(level: string, fen: string, requiredPlies: number): string {
  const side = fen.includes(' w ') ? 'White' : 'Black';
  const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(level);
  if (mateMatch) {
    return `${side} to move and find checkmate in ${mateMatch[1]} move${mateMatch[1] === '1' ? '' : 's'}.`;
  }
  return `${side} to move and find the best ${requiredPlies}-ply line (${formatTrackLabel(level)}).`;
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

type LineToken = { san: string; uci: string };

function toTokens(san: string | null | undefined, uci: string): LineToken[] {
  const uciTokens = uci.trim() ? uci.trim().split(/\s+/) : [];
  const sanTokens = san?.trim() ? san.trim().split(/\s+/) : [];
  const useSan = sanTokens.length === uciTokens.length;
  return uciTokens.map((u, i) => ({ san: useSan ? sanTokens[i] : u, uci: u }));
}

/**
 * Solution and model answer side by side, one row per ply. The model's own moves
 * get a turn number and a verdict; opponent replies are dimmed. From the first ply
 * that differs from the solution, the model column is marked so a wrong answer
 * shows where it went off.
 */
function MoveComparison({
  expected,
  model,
  modelState,
  modelColor,
  badge,
}: {
  expected: LineToken[];
  model: LineToken[];
  /** 'ready' shows the model column; otherwise a placeholder fills it. */
  modelState: 'ready' | 'loading' | 'unavailable';
  modelColor: string;
  badge?: React.ReactNode;
}) {
  const ready = modelState === 'ready';
  const firstMiss = (() => {
    if (!ready) return -1;
    const i = model.findIndex((m, idx) => m.uci !== expected[idx]?.uci);
    if (i >= 0) return i;
    return model.length < expected.length ? model.length : -1;
  })();
  const rows = Math.max(expected.length, ready ? model.length : 0, 1);
  const placeholder = modelState === 'loading' ? 'Loading…' : '—';

  const cell = (token: LineToken | undefined, reply: boolean) =>
    token ? (
      <span className="flex min-w-0 items-baseline gap-2" title={token.uci}>
        <span
          className="font-mono text-[15px] font-medium whitespace-nowrap"
          style={{ color: reply ? 'var(--text-secondary)' : 'var(--text-primary)' }}
        >
          {token.san}
        </span>
        {token.san !== token.uci && (
          <span className="truncate font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {token.uci}
          </span>
        )}
      </span>
    ) : null;

  return (
    <div className="overflow-hidden rounded-lg" style={{ boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}>
      <div
        className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-x-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-tertiary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span aria-hidden="true" />
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-3 rounded-full" style={{ background: ARROW_COLORS.expected }} />
          Solution
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="h-1 w-3 shrink-0 rounded-full" style={{ background: modelColor }} />
          Model
        </span>
        <span aria-hidden="true" />
      </div>
      <ol>
        {Array.from({ length: rows }, (_, i) => {
          const reply = i % 2 === 1;
          const exp = expected[i];
          const mod = ready ? model[i] : undefined;
          const isFirstMiss = i === firstMiss;
          const afterMiss = firstMiss >= 0 && i > firstMiss;
          const ok = ready && !reply && (firstMiss < 0 || i < firstMiss);
          return (
            <li
              key={i}
              className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-x-2 px-3 py-1.5"
              style={{
                borderTop: i > 0 && !reply ? '1px solid var(--border-subtle)' : undefined,
                background: isFirstMiss ? 'var(--danger-light)' : undefined,
              }}
            >
              <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {reply ? '' : `${i / 2 + 1}.`}
              </span>
              {cell(exp, reply) ?? <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
              <span className="min-w-0" style={{ opacity: afterMiss ? 0.6 : 1 }}>
                {!ready ? (
                  i === 0 && <span className="font-mono text-sm" style={{ color: 'var(--text-tertiary)' }}>{placeholder}</span>
                ) : mod && (isFirstMiss || afterMiss) ? (
                  <span className="font-mono text-[15px] font-medium whitespace-nowrap" style={{ color: 'var(--danger)' }} title={mod.uci}>
                    {mod.san}
                  </span>
                ) : mod ? (
                  cell(mod, reply)
                ) : isFirstMiss ? (
                  <span className="text-[13px] italic" style={{ color: 'var(--danger)' }}>
                    {i === 0 ? 'No move given' : 'Stopped'}
                  </span>
                ) : null}
              </span>
              <span className="flex justify-end">
                {ok && <Check className="h-3.5 w-3.5" style={{ color: 'var(--success)' }} aria-label="Matches solution" />}
                {isFirstMiss && <X className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} aria-label="Differs from solution" />}
              </span>
            </li>
          );
        })}
      </ol>
      {badge && (
        <div className="px-3 py-2 text-[12px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
          {badge}
        </div>
      )}
    </div>
  );
}

/** Splits a multi-turn reply ("[Turn 1]\n…\n\n[Turn 2]\n…") into its turns. */
function splitTurns(raw: string): { turn: string; text: string }[] | null {
  if (!/^\s*\[Turn \d+\]/.test(raw)) return null;
  const parts = raw.trim().split(/^\[Turn (\d+)\][ \t]*$/m);
  const turns: { turn: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    turns.push({ turn: parts[i], text: (parts[i + 1] ?? '').trim() });
  }
  return turns.length > 0 ? turns : null;
}

function RawOutput({ text, truncated }: { text: string; truncated: boolean }) {
  const turns = splitTurns(text);
  const boxStyle = { background: 'var(--background)', boxShadow: 'inset 0 0 0 1px var(--border-subtle)' };
  if (!turns) {
    return (
      <pre
        className="custom-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg px-3 py-2.5 font-mono text-[12.5px] leading-relaxed"
        style={{ ...boxStyle, color: 'var(--text-secondary)' }}
      >
        {text}
        {truncated && '…'}
      </pre>
    );
  }
  return (
    <ol className="custom-scrollbar max-h-48 overflow-y-auto rounded-lg" style={boxStyle}>
      {turns.map(({ turn, text: body }, i) => (
        <li
          key={turn + i}
          className="flex items-start gap-3 px-3 py-2"
          style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}
        >
          <span
            className="mt-px shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ background: 'var(--surface-raised)', color: 'var(--text-tertiary)', boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}
          >
            Turn {turn}
          </span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {body || <span style={{ color: 'var(--text-tertiary)' }}>(empty)</span>}
            {truncated && i === turns.length - 1 && '…'}
          </pre>
        </li>
      ))}
    </ol>
  );
}

// ============================================================================
// PUZZLES TAB
// ============================================================================
export default function PuzzlesTab({
  results,
}: {
  results: ExplorerResults;
}) {
  const visiblePuzzles = results.puzzles;
  const models = results.models;
  const hasPuzzles = visiblePuzzles.length > 0;
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [loadedAttempts, setLoadedAttempts] = useState<Record<string, Record<string, PuzzleAttemptView>>>({});

  const puzzleIndexById = useMemo(() => {
    const map = new Map<string, number>();
    visiblePuzzles.forEach((puzzle, index) => map.set(puzzle.id, index));
    return map;
  }, [visiblePuzzles]);

  const modelOptions = useMemo<ModelOption[]>(
    () =>
      models.map((model) => ({
        id: model.id,
        label: model.name,
        sublabel: model.sublabel,
      })),
    [models]
  );

  const availableLevels = useMemo(() => {
    const out = Array.from(new Set(visiblePuzzles.map((p) => p.level)));
    out.sort((a, b) => formatTrackLabel(a).localeCompare(formatTrackLabel(b)));
    return out;
  }, [visiblePuzzles]);

  const levelOptions = useMemo(() => {
    return [
      { id: 'all', label: 'All Puzzle Types'},
      ...availableLevels.map((level) => ({
        id: level,
        label: formatTrackLabel(level),
        sublabel: getTrackDescription(level),
      })),
    ];
  }, [availableLevels]);

  const filteredPuzzles = useMemo(() => {
    return levelFilter === 'all' ? visiblePuzzles : visiblePuzzles.filter((p) => p.level === levelFilter);
  }, [visiblePuzzles, levelFilter]);

  const activePuzzleId = useMemo(() => {
    if (filteredPuzzles.length === 0) return selectedPuzzleId;
    return filteredPuzzles.some((p) => p.id === selectedPuzzleId) ? selectedPuzzleId : filteredPuzzles[0].id;
  }, [filteredPuzzles, selectedPuzzleId]);

  const selectedPuzzle = useMemo(() => {
    return visiblePuzzles.find((p) => p.id === activePuzzleId);
  }, [visiblePuzzles, activePuzzleId]);

  const selectedIndex = useMemo(() => {
    if (filteredPuzzles.length === 0) return 0;
    const idx = filteredPuzzles.findIndex((p) => p.id === activePuzzleId);
    return idx >= 0 ? idx : 0;
  }, [filteredPuzzles, activePuzzleId]);

  const listRef = useRef<HTMLDivElement>(null);
  const [listEdges, setListEdges] = useState({ above: false, below: false, hiddenBelow: 0 });

  const measureList = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const above = el.scrollTop > 4;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    // Rows are a fixed height, so the remaining count is a cheap estimate from the first row.
    const row = el.querySelector<HTMLElement>('[data-puzzle-row]');
    const rowHeight = row ? row.offsetHeight + 2 : 0;
    const hiddenBelow = below && rowHeight > 0
      ? Math.max(1, Math.round((el.scrollHeight - el.scrollTop - el.clientHeight) / rowHeight))
      : 0;
    setListEdges((prev) =>
      prev.above === above && prev.below === below && prev.hiddenBelow === hiddenBelow
        ? prev
        : { above, below, hiddenBelow }
    );
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measureList();
    // Watch the rows too: font loading or a new filter changes content height, not the box.
    const observer = new ResizeObserver(measureList);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measureList, filteredPuzzles]);

  // A new filter starts from the top instead of mid-way down a shorter list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [levelFilter]);

  const scrollListBy = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ top: direction * el.clientHeight * 0.8, behavior: 'smooth' });
  };

  const selectPuzzleAt = (index: number, focusRow = false) => {
    const puzzle = filteredPuzzles[index];
    if (!puzzle) return;
    setSelectedPuzzleId(puzzle.id);
    // Keep the highlighted row clear of the fade and pill (scroll-padding on the list).
    // Instant, so rapid steps don't cancel each other's smooth scroll.
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-puzzle-id="${CSS.escape(puzzle.id)}"]`);
      row?.scrollIntoView({ block: 'nearest' });
      if (focusRow) row?.focus({ preventScroll: true });
    });
  };

  const goPrev = () => {
    if (filteredPuzzles.length === 0) return;
    selectPuzzleAt(Math.max(0, selectedIndex - 1));
  };

  const goNext = () => {
    if (filteredPuzzles.length === 0) return;
    selectPuzzleAt(Math.min(filteredPuzzles.length - 1, selectedIndex + 1));
  };

  const activeModelId = useMemo(() => {
    if (selectedModelId && modelOptions.some((option) => option.id === selectedModelId)) {
      return selectedModelId;
    }
    return modelOptions[0]?.id ?? '';
  }, [modelOptions, selectedModelId]);

  const selectedModel = useMemo<ModelView | undefined>(() => {
    return models.find((model) => model.id === activeModelId);
  }, [models, activeModelId]);

  const modelAttempts = useMemo(() => {
    if (!selectedModel) return undefined;
    if (Object.keys(selectedModel.attemptsByPuzzleId).length > 0) return selectedModel.attemptsByPuzzleId;
    return loadedAttempts[selectedModel.id];
  }, [selectedModel, loadedAttempts]);

  const [failedAttemptModels, setFailedAttemptModels] = useState<Record<string, boolean>>({});
  const attemptsFailed = selectedModel ? failedAttemptModels[selectedModel.id] === true : false;

  useEffect(() => {
    if (!selectedModel) return;
    if (Object.keys(selectedModel.attemptsByPuzzleId).length > 0) return;
    if (loadedAttempts[selectedModel.id] || failedAttemptModels[selectedModel.id]) return;
    const modelId = selectedModel.id;
    let cancelled = false;
    void fetch(`/api/model/${encodeURIComponent(modelId)}/attempts`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ attempts?: Record<string, PuzzleAttemptView> }>;
      })
      .then((data) => {
        if (cancelled) return;
        setLoadedAttempts((current) => ({ ...current, [modelId]: data.attempts ?? {} }));
      })
      .catch(() => {
        // The list still shows pass/fail from marks; the panel offers a retry.
        if (!cancelled) setFailedAttemptModels((current) => ({ ...current, [modelId]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModel, loadedAttempts, failedAttemptModels]);

  const retryAttempts = () => {
    if (!selectedModel) return;
    const modelId = selectedModel.id;
    setFailedAttemptModels((current) => {
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  };

  const selectedAttempt = useMemo<PuzzleAttemptView | undefined>(() => {
    if (!selectedPuzzle || !modelAttempts) return undefined;
    return modelAttempts[selectedPuzzle.id];
  }, [selectedPuzzle, modelAttempts]);

  const selectedMark = useMemo(() => {
    if (!selectedPuzzle || !selectedModel) return null;
    const index = puzzleIndexById.get(selectedPuzzle.id);
    if (index === undefined) return null;
    const mark = selectedModel.marks[index];
    return mark === '1' || mark === '0' ? mark : null;
  }, [selectedPuzzle, selectedModel, puzzleIndexById]);

  const selectedCorrect = selectedAttempt
    ? selectedAttempt.correctStrict
    : selectedMark === '1'
      ? true
      : selectedMark === '0'
        ? false
        : null;

  const verdict =
    selectedCorrect === true
      ? { label: 'Solved', color: 'var(--success)', bg: 'var(--success-light)', border: 'var(--success-border)' }
      : selectedCorrect === false
        ? { label: 'Missed', color: 'var(--danger)', bg: 'var(--danger-light)', border: 'var(--danger-border)' }
        : { label: 'No result', color: 'var(--text-tertiary)', bg: 'var(--surface-raised)', border: 'var(--border)' };
  const modelLogo = selectedModel ? getModelLogoPath(selectedModel.id) : null;

  const displayFen = useMemo(() => {
    if (!selectedPuzzle?.fen) return '';
    return getDisplayFen(selectedPuzzle.fen, selectedPuzzle.initialMove);
  }, [selectedPuzzle]);

  const selectedPuzzleExpected = selectedPuzzle?.expectedLine ?? '';

  const [showThinking, setShowThinking] = useState(false);

  type AttemptDetail = { rawOutput: string; thinkingText: string | null };
  const [detailCache, setDetailCache] = useState<Record<string, AttemptDetail>>({});
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [detailErrorKey, setDetailErrorKey] = useState<string | null>(null);
  const detailKey = selectedModel && selectedPuzzle ? `${selectedModel.id}::${selectedPuzzle.id}` : null;
  const detail = detailKey ? detailCache[detailKey] : undefined;
  const detailFailed = detailKey !== null && detailErrorKey === detailKey;
  const loadDetail = async () => {
    if (!detailKey || !selectedModel || !selectedPuzzle) return;
    if (detailCache[detailKey] || detailLoadingKey === detailKey) return;
    setDetailLoadingKey(detailKey);
    setDetailErrorKey(null);
    try {
      const res = await fetch(
        `/api/attempt/${encodeURIComponent(selectedModel.id)}/${encodeURIComponent(selectedPuzzle.id)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AttemptDetail;
      setDetailCache((c) => ({ ...c, [detailKey]: data }));
    } catch {
      setDetailErrorKey(detailKey);
    } finally {
      setDetailLoadingKey((cur) => (cur === detailKey ? null : cur));
    }
  };

  const boardShapes = useMemo<DrawShape[]>(() => {
    if (!selectedPuzzle) return [];
    const shapes: DrawShape[] = [];
    const initialMove = selectedPuzzle.initialMove?.trim();
    const expectedFirst = selectedPuzzleExpected.split(' ')[0]?.trim();
    const modelFirst = selectedAttempt?.parsedLine?.split(' ')[0]?.trim();
    if (initialMove && initialMove.length >= 4) {
      shapes.push({
        orig: initialMove.slice(0, 2) as Key,
        dest: initialMove.slice(2, 4) as Key,
        brush: 'blue',
      });
    }
    if (expectedFirst && expectedFirst.length >= 4) {
      shapes.push({
        orig: expectedFirst.slice(0, 2) as Key,
        dest: expectedFirst.slice(2, 4) as Key,
        brush: 'green',
      });
    }
    if (modelFirst && modelFirst.length >= 4 && modelFirst !== expectedFirst) {
      shapes.push({
        orig: modelFirst.slice(0, 2) as Key,
        dest: modelFirst.slice(2, 4) as Key,
        brush: 'red',
      });
    }
    return shapes;
  }, [selectedPuzzle, selectedPuzzleExpected, selectedAttempt]);

  const lastMoveSquares = useMemo<Key[] | undefined>(() => {
    const move = selectedPuzzle?.initialMove;
    if (!move || move.length < 4) return undefined;
    return [move.slice(0, 2) as Key, move.slice(2, 4) as Key];
  }, [selectedPuzzle]);

  const modelStats = useMemo(() => {
    if (!selectedModel) return { correct: 0, total: 0, pct: '0.0' };
    let total = 0;
    let correct = 0;
    for (const puzzle of filteredPuzzles) {
      const index = puzzleIndexById.get(puzzle.id);
      const mark = index === undefined ? undefined : selectedModel.marks[index];
      if (mark !== '1' && mark !== '0') continue;
      total += 1;
      if (mark === '1') correct += 1;
    }
    const pct = total === 0 ? 0 : (correct / total) * 100;
    return { correct, total, pct: pct.toFixed(1) };
  }, [filteredPuzzles, selectedModel, puzzleIndexById]);

  const levelBadgeStyle = (level: string) => {
    switch (level) {
      case 'mateIn1':
      case 'mate1': return trackBadge('--track-mate1');
      case 'mateIn2':
      case 'mate2': return trackBadge('--track-mate2');
      case 'fork': return trackBadge('--track-fork');
      case 'pin': return trackBadge('--track-pin');
      case 'hangingPiece': return trackBadge('--track-hanging');
      default: return { background: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div
      className="grid gap-4 xl:h-full xl:min-h-0 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:items-start xl:items-stretch"
    >
      {/* Sidebar */}
      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4 xl:static xl:h-full xl:min-h-0">
        <div
          className="flex flex-col rounded-xl overflow-visible xl:h-full xl:min-h-0 xl:flex-1"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="shrink-0 p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Puzzle Browser
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={filteredPuzzles.length === 0 || selectedIndex === 0}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30 hover:enabled:bg-[var(--border-subtle)] hover:enabled:text-[var(--text-primary)]"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title="Previous puzzle"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={filteredPuzzles.length === 0 || selectedIndex >= filteredPuzzles.length - 1}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30 hover:enabled:bg-[var(--border-subtle)] hover:enabled:text-[var(--text-primary)]"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title="Next puzzle"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Model</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span style={{ color: 'var(--text-primary)' }} className="font-semibold">
                    {modelStats.correct}/{modelStats.total}
                  </span>{' '}
                  <span
                    className="ml-1 rounded px-1.5 py-0.5 text-xs font-bold"
                    style={
                      parseFloat(modelStats.pct) >= 90
                        ? { background: 'var(--success-light)', color: 'var(--success)' }
                        : parseFloat(modelStats.pct) >= 70
                        ? { background: 'var(--accent-light)', color: 'var(--accent)' }
                        : { background: 'var(--danger-light)', color: 'var(--danger)' }
                    }
                  >
                    {modelStats.pct}%
                  </span>
                </div>
              </div>
              <CustomDropdown
                value={activeModelId}
                options={modelOptions}
                onChange={setSelectedModelId}
                placeholder="Choose a model..."
                searchable
                searchPlaceholder="Search models..."
              />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <CustomDropdown
                value={levelFilter}
                options={levelOptions}
                onChange={setLevelFilter}
                placeholder="Filter by puzzle type..."
              />
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {levelFilter === 'all'
                    ? `All ${availableLevels.length} tactics, mixed together.`
                    : getTrackDescription(levelFilter)}
              </div>

              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>
                  <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{filteredPuzzles.length}</span> puzzles
                </span>
                <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {filteredPuzzles.length === 0 ? '—' : `${selectedIndex + 1} / ${filteredPuzzles.length}`}
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col xl:flex-1 xl:min-h-0">
            <div
              ref={listRef}
              onScroll={measureList}
              onKeyDown={(e) => {
                if (e.metaKey || e.ctrlKey || e.altKey || filteredPuzzles.length === 0) return;
                const last = filteredPuzzles.length - 1;
                const target =
                  e.key === 'ArrowDown' || e.key === 'j' ? Math.min(last, selectedIndex + 1)
                  : e.key === 'ArrowUp' || e.key === 'k' ? Math.max(0, selectedIndex - 1)
                  : e.key === 'Home' ? 0
                  : e.key === 'End' ? last
                  : null;
                if (target === null) return;
                e.preventDefault();
                selectPuzzleAt(target, true);
              }}
              style={{ scrollPaddingBlock: '2.25rem 3rem' }}
              className="custom-scrollbar max-h-56 overflow-x-hidden overflow-y-auto px-2 py-2 sm:max-h-72 lg:max-h-[calc(100dvh-26rem)] lg:min-h-64 xl:absolute xl:inset-0 xl:max-h-none xl:min-h-0"
            >
              {filteredPuzzles.length === 0 ? (
                <div className="p-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>No puzzles match this filter.</div>
              ) : (
                <div className="space-y-0.5" role="group" aria-label="Puzzles. Use arrow keys to move between them.">
                  {filteredPuzzles.map((puzzle, idx) => {
                    const active = activePuzzleId === puzzle.id;
                    const markIndex = puzzleIndexById.get(puzzle.id);
                    const mark = markIndex === undefined ? undefined : selectedModel?.marks[markIndex];
                    const dotColor = mark === '1' ? 'var(--success)' : mark === '0' ? 'var(--danger)' : 'var(--border-strong)';
                    const markLabel = mark === '1' ? 'solved' : mark === '0' ? 'missed' : 'no result';
                    return (
                      <button
                        key={puzzle.id}
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        tabIndex={active ? 0 : -1}
                        data-puzzle-row
                        data-puzzle-id={puzzle.id}
                        onClick={() => setSelectedPuzzleId(puzzle.id)}
                        aria-label={`Puzzle ${idx + 1}, ${formatTrackLabel(puzzle.level)}${puzzle.rating != null ? `, rated ${puzzle.rating}` : ''}, ${markLabel}`}
                        className={`group relative flex w-full items-center gap-2.5 rounded-md border py-2 pr-2.5 pl-3 text-left transition-colors ${
                          active
                            ? 'bg-[var(--accent-light)] border-[var(--accent-border)]'
                            : 'border-transparent hover:bg-[var(--surface-raised)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: dotColor, boxShadow: mark === '1' || mark === '0' ? `0 0 0 3px color-mix(in srgb, ${dotColor} 16%, transparent)` : undefined }}
                        />
                        <span
                          className="w-9 shrink-0 font-mono text-[13px] font-semibold tabular-nums"
                          style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                        >
                          #{idx + 1}
                        </span>
                        <span
                          className="truncate rounded px-1.5 py-0.5 text-[11.5px] font-semibold"
                          style={levelBadgeStyle(puzzle.level)}
                        >
                          {formatTrackLabel(puzzle.level)}
                        </span>
                        {puzzle.rating != null && (
                          <span
                            className="ml-auto shrink-0 font-mono text-[11.5px] tabular-nums transition-colors group-hover:text-[var(--text-secondary)]"
                            style={{ color: active ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                          >
                            {puzzle.rating}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scroll affordances: soft edges, plus a count of rows still below. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-6 transition-opacity duration-200 ${listEdges.above ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to bottom, var(--surface), transparent)' }}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl transition-opacity duration-200 ${listEdges.below ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to top, var(--surface) 15%, transparent)' }}
            />
            <button
              type="button"
              onClick={() => scrollListBy(1)}
              tabIndex={-1}
              aria-hidden="true"
              className={`absolute right-3 bottom-2 z-10 inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] py-0.5 pr-2 pl-1.5 text-[11px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-pop)] transition-all duration-200 hover:border-[var(--accent-border)] hover:text-[var(--accent)] ${
                listEdges.below ? 'opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
              }`}
            >
              <ChevronDown className="h-3 w-3" />
              <span className="tabular-nums">{listEdges.hiddenBelow} more</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main panel */}
      <section className="flex min-w-0 flex-col xl:h-full xl:min-h-0">
        <div
          className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl xl:min-h-0 xl:flex-1"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="shrink-0 px-4 py-3 sm:px-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold leading-none tracking-[-0.015em] mr-1" style={{ color: 'var(--text-primary)' }}>
                    {hasPuzzles ? `Puzzle ${selectedIndex + 1}` : 'Puzzle Explorer'}
                  </h2>
                  {selectedPuzzle && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1"
                      style={levelBadgeStyle(selectedPuzzle.level)}
                    >
                      {formatTrackLabel(selectedPuzzle.level)}
                      <InfoTip label="About this tactic" text={getTrackDescription(selectedPuzzle.level)} />
                    </span>
                  )}
                  {selectedPuzzle?.rating != null && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                      Rating {selectedPuzzle.rating}
                      <InfoTip label="About puzzle rating" text="Puzzle difficulty on the Lichess rating scale. Higher is harder." />
                    </span>
                  )}
                  {selectedPuzzle?.ratingBucket && (
                    <span className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                      {selectedPuzzle.ratingBucket}
                      <InfoTip label="About rating bands" text="The difficulty band this puzzle was sampled from. Every band has the same number of puzzles." />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {selectedPuzzle
                    ? getPuzzleDescription(selectedPuzzle.level, displayFen, selectedPuzzle.requiredPlies ?? 1)
                    : 'Select a puzzle from the sidebar to explore board positions and model analysis.'}
                </div>
              </div>
            </div>
          </div>

          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4 xl:overflow-hidden xl:p-4">
            {!selectedPuzzle ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center max-w-xs px-6">
                  <div className="text-5xl mb-4 opacity-15 select-none">♟</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Select a puzzle
                  </div>
                  <div className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    Choose a puzzle from the sidebar to view the board position, expected solution, and model analysis.
                  </div>
                </div>
              </div>
            ) : (
              <div className="@container/stage flex min-w-0 flex-col xl:h-full xl:min-h-0">
                <div className="grid items-start gap-4 xl:h-full xl:min-h-0 xl:items-stretch @min-[680px]/stage:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] @min-[1000px]/stage:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
                {/* Board column */}
                <div className="flex min-h-0 min-w-0 flex-col">
                  <div className="@container/board mx-auto flex w-full max-w-[min(100%,68dvh)] flex-1 items-center justify-center xl:max-w-none xl:min-h-0 xl:[container-type:size]">
                    <div className="aspect-square w-full xl:w-[min(100cqw,100cqh)]">
                    <ChessBoard
                      fen={displayFen}
                      startFen={selectedPuzzle.fen ?? ''}
                      orientation={displayFen.includes(' b ') ? 'black' : 'white'}
                      shapes={boardShapes}
                      lastMove={lastMoveSquares}
                      replayKey={selectedPuzzle.id}
                    />
                    </div>
                  </div>
                  <div
                    className="mt-3 flex w-full shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    {selectedPuzzle.initialMove && (
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded-full" style={{ background: ARROW_COLORS.lastMove }} />
                        Last move
                        <span className="rounded px-1.5 py-0.5 font-mono text-xs" style={{ background: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                          {selectedPuzzle.initialMove}
                        </span>
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="h-1 w-6 rounded-full" style={{ background: ARROW_COLORS.expected }} />
                      Expected
                    </span>
                    {selectedAttempt && !selectedAttempt.correctStrict && selectedAttempt.parsedLine && (
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-6 rounded-full" style={{ background: ARROW_COLORS.model }} />
                        Model
                      </span>
                    )}
                  </div>
                </div>

                {/* Detail panel */}
                <div className="custom-scrollbar flex min-w-0 flex-col self-start overflow-hidden rounded-xl xl:h-full xl:self-stretch xl:overflow-y-auto" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {/* Model + verdict */}
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      boxShadow: `inset 0 2px 0 ${verdict.color}`,
                    }}
                  >
                    {modelLogo && (
                      <Image src={modelLogo} alt="" width={18} height={18} unoptimized className={`h-[18px] w-[18px] shrink-0 ${getModelLogoClass(modelLogo)}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }} title={selectedModel?.name}>
                        {selectedModel?.name ?? 'No model'}
                      </div>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2.5 pl-1.5 text-xs font-semibold"
                      style={{ background: verdict.bg, color: verdict.color, boxShadow: `inset 0 0 0 1px ${verdict.border}` }}
                      aria-live="polite"
                    >
                      {selectedCorrect === true ? <Check className="h-3.5 w-3.5" /> : selectedCorrect === false ? <X className="h-3.5 w-3.5" /> : <span className="w-1" />}
                      {verdict.label}
                    </span>
                  </div>

                  {attemptsFailed && !selectedAttempt && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs" style={{ background: 'var(--danger-light)', borderBottom: '1px solid var(--danger-border)', color: 'var(--text-secondary)' }} role="alert">
                      Couldn&apos;t load this model&apos;s answers.
                      <button type="button" onClick={retryAttempts} className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                        <RotateCw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  )}

                  {/* Moves comparison */}
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <MoveComparison
                      expected={toTokens(selectedAttempt?.expectedSanLine, selectedPuzzleExpected)}
                      model={selectedAttempt ? toTokens(selectedAttempt.sanLine, selectedAttempt.parsedLine ?? '') : []}
                      modelState={selectedAttempt ? 'ready' : attemptsFailed ? 'unavailable' : 'loading'}
                      modelColor={selectedCorrect === false ? ARROW_COLORS.model : ARROW_COLORS.expected}
                      badge={
                        selectedAttempt?.parseStatus && selectedAttempt.parseStatus !== 'ok' ? (
                          <span title={selectedAttempt.parseStatus}>
                            <span style={{ color: 'var(--text-tertiary)' }}>Parse: </span>
                            {parseStatusLabel(selectedAttempt.parseStatus)}
                          </span>
                        ) : undefined
                      }
                    />
                  </div>

                  {/* Usage stats */}
                  <dl className="grid grid-cols-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {[
                      ['Prompt', selectedAttempt ? selectedAttempt.usage.promptTokens.toLocaleString() : '—', 'tokens'],
                      ['Completion', selectedAttempt ? selectedAttempt.usage.completionTokens.toLocaleString() : '—', 'tokens'],
                      ['Latency', selectedAttempt ? formatLatency(selectedAttempt.latencyMs) : '—', ''],
                    ].map(([label, value, unit], i) => (
                      <div
                        key={label}
                        className="flex flex-col gap-1 px-4 py-3"
                        style={{ borderLeft: i > 0 ? '1px solid var(--border-subtle)' : undefined }}
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>{label}</dt>
                        <dd className="flex items-baseline gap-1 font-mono text-[15px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {value}
                          {unit && value !== '—' && <span className="font-sans text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {/* Raw output + thinking */}
                  <div className="px-4 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                        Raw output
                      </div>
                      {selectedAttempt?.rawOutputTruncated && !detail && (
                        <button
                          type="button"
                          onClick={loadDetail}
                          disabled={detailLoadingKey === detailKey}
                          className="text-xs hover:underline disabled:opacity-50"
                          style={{ color: 'var(--accent)' }}
                        >
                          {detailLoadingKey === detailKey ? 'Loading…' : 'Show full output'}
                        </button>
                      )}
                    </div>
                    <RawOutput
                      text={(detail?.rawOutput ?? selectedAttempt?.rawOutput) || (selectedAttempt ? '(empty reply)' : '—')}
                      truncated={Boolean(selectedAttempt?.rawOutputTruncated && !detail)}
                    />
                    {detailFailed && (
                      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }} role="alert">
                        Couldn&apos;t load the full reply.
                        <button type="button" onClick={loadDetail} className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                          <RotateCw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    )}
                    {selectedAttempt && selectedAttempt.thinkingChars > 0 && (
                      <>
                        <button
                          type="button"
                          aria-expanded={showThinking}
                          onClick={() => {
                            setShowThinking((prev) => {
                              const next = !prev;
                              if (next && !detail) void loadDetail();
                              return next;
                            });
                          }}
                          className="mt-2.5 flex items-center gap-1 text-[13px] font-medium hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showThinking ? '' : '-rotate-90'}`} />
                          Reasoning
                          <span className="font-mono text-[11.5px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
                            {selectedAttempt.thinkingChars.toLocaleString()} chars
                          </span>
                        </button>
                        {showThinking && (
                          <pre className="custom-scrollbar mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md px-3 py-2 font-mono text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)', background: 'var(--background)', boxShadow: 'inset 0 0 0 1px var(--border-subtle)' }}>
                            {detail?.thinkingText ?? (detailLoadingKey === detailKey ? 'Loading…' : detailFailed ? 'Unavailable.' : '')}
                          </pre>
                        )}
                      </>
                    )}
                  </div>

                  {/* Links */}
                  {selectedPuzzle.source?.url && (
                    <div className="mt-auto px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-raised)' }}>
                      <a
                        href={selectedPuzzle.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--surface)' }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View on Lichess
                        <span className="sr-only"> (opens in new tab)</span>
                      </a>
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
