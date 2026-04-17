'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';
import ChessBoard from './ChessBoard';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import type { ExplorerResults, ModelView, PuzzleAttemptView } from '../lib/results.types';
import { getDisplayFen } from './utils';

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  const show = () => {
    const el = iconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 104, window.innerWidth - 216)),
    });
  };

  const hide = () => setPos(null);

  return (
    <span className="inline-flex items-center" onMouseEnter={show} onMouseLeave={hide}>
      <Info ref={iconRef} className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
      {pos && (
        <span
          className="fixed w-52 px-2.5 py-1.5 rounded-md text-[11px] leading-snug font-normal z-[9999] shadow-lg pointer-events-none"
          style={{ background: 'var(--text-primary)', color: 'var(--background)', top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </span>
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
}: {
  value: string;
  options: { id: string; label: string; sublabel?: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
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

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
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
            className="absolute z-50 top-full mt-1 w-full max-h-[min(22rem,calc(100vh-180px))] overflow-y-auto overscroll-none rounded-lg shadow-lg custom-scrollbar"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
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
            ))}
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
      ? 'Mate 1'
      : level === 'mate2' || level === 'mateIn2'
      ? 'Mate 2'
      : level.charAt(0).toUpperCase() + level.slice(1);
  }
  const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(level);
  if (mateMatch) return `Mate ${mateMatch[1]}`;
  return level
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPuzzleDescription(level: string, fen: string, requiredPlies: number): string {
  const side = fen.includes(' w ') ? 'White' : 'Black';
  const mateMatch = /^(?:mateIn|mate)(\d+)$/i.exec(level);
  if (mateMatch) {
    return `${side} to move and find checkmate in ${mateMatch[1]} move${mateMatch[1] === '1' ? '' : 's'}.`;
  }
  return `${side} to move and find the best ${requiredPlies}-ply line (${formatTrackLabel(level)}).`;
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
      { id: 'all', label: 'All Puzzle Types', sublabel: 'Browse every active track' },
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

  const goPrev = () => {
    if (filteredPuzzles.length === 0) return;
    setSelectedPuzzleId(filteredPuzzles[Math.max(0, selectedIndex - 1)].id);
  };

  const goNext = () => {
    if (filteredPuzzles.length === 0) return;
    setSelectedPuzzleId(filteredPuzzles[Math.min(filteredPuzzles.length - 1, selectedIndex + 1)].id);
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

  const selectedAttempt = useMemo<PuzzleAttemptView | undefined>(() => {
    if (!selectedPuzzle || !selectedModel) return undefined;
    return selectedModel.attemptsByPuzzleId[selectedPuzzle.id];
  }, [selectedPuzzle, selectedModel]);

  const displayFen = useMemo(() => {
    if (!selectedPuzzle?.fen) return '';
    return getDisplayFen(selectedPuzzle.fen, selectedPuzzle.initialMove);
  }, [selectedPuzzle]);

  const selectedPuzzleExpected = selectedPuzzle?.expectedLine ?? '';

  const [showThinking, setShowThinking] = useState(false);

  type AttemptDetail = { rawOutput: string; thinkingText: string | null };
  const [detailCache, setDetailCache] = useState<Record<string, AttemptDetail>>({});
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const detailKey = selectedModel && selectedPuzzle ? `${selectedModel.id}::${selectedPuzzle.id}` : null;
  const detail = detailKey ? detailCache[detailKey] : undefined;
  const loadDetail = async () => {
    if (!detailKey || !selectedModel || !selectedPuzzle) return;
    if (detailCache[detailKey] || detailLoadingKey === detailKey) return;
    setDetailLoadingKey(detailKey);
    try {
      const res = await fetch(
        `/api/attempt/${encodeURIComponent(selectedModel.id)}/${encodeURIComponent(selectedPuzzle.id)}`
      );
      if (res.ok) {
        const data = (await res.json()) as AttemptDetail;
        setDetailCache((c) => ({ ...c, [detailKey]: data }));
      }
    } catch {
      // swallow — user can retry by clicking again
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
      const attempt = selectedModel.attemptsByPuzzleId[puzzle.id];
      if (!attempt) continue;
      total += 1;
      if (attempt.correctStrict) correct += 1;
    }
    const pct = total === 0 ? 0 : (correct / total) * 100;
    return { correct, total, pct: pct.toFixed(1) };
  }, [filteredPuzzles, selectedModel]);

  const levelBadgeStyle = (level: string) => {
    switch (level) {
      case 'mateIn1':
      case 'mate1': return { background: '#dcfce7', color: '#166534' };
      case 'mateIn2':
      case 'mate2': return { background: '#dbeafe', color: '#1e40af' };
      case 'fork': return { background: '#fef9c3', color: '#854d0e' };
      case 'pin': return { background: '#fee2e2', color: '#991b1b' };
      case 'hangingPiece': return { background: '#cffafe', color: '#155e75' };
      default: return { background: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div
      className="flex-1 h-full min-h-0 grid gap-6 lg:gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch"
    >
      {/* Sidebar */}
      <aside className="flex flex-col h-full min-h-0">
        <div
          className="flex-1 min-h-0 flex flex-col rounded-xl h-full overflow-visible"
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
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30"
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
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30"
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
                    className="ml-1 px-1.5 py-0.5 rounded text-[11px] font-bold"
                    style={
                      parseFloat(modelStats.pct) >= 90
                        ? { background: '#dcfce7', color: '#166534' }
                        : parseFloat(modelStats.pct) >= 70
                        ? { background: '#fef9c3', color: '#854d0e' }
                        : { background: '#fee2e2', color: '#991b1b' }
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
              />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <CustomDropdown
                value={levelFilter}
                options={levelOptions}
                onChange={setLevelFilter}
                placeholder="Filter by puzzle type..."
              />
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {levelFilter === 'all'
                  ? 'Showing all puzzle types.'
                  : getTrackDescription(levelFilter)}
              </div>

              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <span>
                  <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{filteredPuzzles.length}</span> puzzles
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {filteredPuzzles.length === 0 ? '—' : `${selectedIndex + 1} / ${filteredPuzzles.length}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative flex flex-col">
            <div
              className="absolute inset-0 overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar"
            >
              {filteredPuzzles.length === 0 ? (
                <div className="p-6 text-sm text-center italic" style={{ color: 'var(--text-tertiary)' }}>No puzzles match your filters.</div>
              ) : (
                <div className="space-y-0.5">
                  {filteredPuzzles.map((puzzle, idx) => {
                    const active = activePuzzleId === puzzle.id;
                    const attempt = selectedModel?.attemptsByPuzzleId[puzzle.id];
                    const dotColor = attempt ? (attempt.correctStrict ? '#22c55e' : '#ef4444') : '#d1d5db';
                    return (
                      <button
                        key={puzzle.id}
                        type="button"
                        onClick={() => setSelectedPuzzleId(puzzle.id)}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 transition-all"
                        style={{
                          background: active ? 'var(--accent-light)' : 'transparent',
                          border: active ? '1px solid #bfdbfe' : '1px solid transparent',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                            <span className="text-xs font-semibold tabular-nums" style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              #{idx + 1}
                            </span>
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded truncate"
                              style={levelBadgeStyle(puzzle.level)}
                            >
                              {formatTrackLabel(puzzle.level)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main panel */}
      <section className="flex flex-col h-full min-w-0 min-h-0">
        <div
          className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden w-full max-w-[1120px] xl:max-w-[1180px]"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="shrink-0 px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                    {hasPuzzles ? `Puzzle ${selectedIndex + 1}` : 'Puzzle Explorer'}
                  </div>
                  {selectedPuzzle && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1"
                      style={levelBadgeStyle(selectedPuzzle.level)}
                    >
                      {formatTrackLabel(selectedPuzzle.level)}
                      <InfoTip text={getTrackDescription(selectedPuzzle.level)} />
                    </span>
                  )}
                  {selectedPuzzle?.rating != null && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: '#fef3c7', color: '#92400e' }}>
                      ELO {selectedPuzzle.rating}
                      <InfoTip text="ELO rating measures puzzle difficulty on the Lichess scale. Higher = harder." />
                    </span>
                  )}
                  {selectedPuzzle?.ratingBucket && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                      {selectedPuzzle.ratingBucket}
                      <InfoTip text="Rating bucket groups puzzles by difficulty range for balanced benchmarking." />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {selectedPuzzle
                    ? getPuzzleDescription(selectedPuzzle.level, displayFen, selectedPuzzle.requiredPlies ?? 1)
                    : 'Select a puzzle from the sidebar to explore board positions and model analysis.'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 xl:p-6 custom-scrollbar">
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
              <div className="grid gap-5 lg:justify-center lg:grid-cols-[max-content_minmax(340px,380px)] xl:grid-cols-[max-content_minmax(360px,400px)] lg:items-start">
                {/* Board column */}
                <div className="flex flex-col items-center justify-start">
                  <div className="w-full max-w-[min(82vw,640px)] lg:w-[min(68vh,640px)] xl:w-[min(70vh,680px)] mx-auto">
                    <ChessBoard
                      fen={displayFen}
                      startFen={selectedPuzzle.fen ?? ''}
                      orientation={displayFen.includes(' b ') ? 'black' : 'white'}
                      shapes={boardShapes}
                      lastMove={lastMoveSquares}
                      replayKey={selectedPuzzle.id}
                    />
                  </div>
                  <div className="mt-2 w-full max-w-[min(82vw,640px)] lg:w-[min(68vh,640px)] xl:w-[min(70vh,680px)] mx-auto flex items-center gap-4 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    {selectedPuzzle.initialMove && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-1.5 rounded-sm" style={{ background: '#003088' }} />
                        Last move
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded-sm" style={{ background: '#15781B' }} />
                      Expected
                    </span>
                    {selectedAttempt && !selectedAttempt.correctStrict && selectedAttempt.parsedLine && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-1.5 rounded-sm" style={{ background: '#882020' }} />
                        Model
                      </span>
                    )}
                    {selectedPuzzle.initialMove && (
                      <span className="ml-auto font-mono">
                        Last move: {selectedPuzzle.initialMove}
                      </span>
                    )}
                  </div>
                </div>

                {/* Detail panel */}
                <div className="rounded-xl overflow-hidden self-start" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {/* Verdict banner */}
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{
                      background: selectedAttempt?.correctStrict ? '#f0fdf4' : selectedAttempt ? '#fef2f2' : 'var(--border-subtle)',
                      borderBottom: `2px solid ${selectedAttempt?.correctStrict ? '#86efac' : selectedAttempt ? '#fca5a5' : 'var(--border)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {selectedAttempt ? (
                        selectedAttempt.correctStrict ? (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#dcfce7' }}>
                            <Check className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#fee2e2' }}>
                            <X className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />
                          </div>
                        )
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--border)' }}>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>?</span>
                        </div>
                      )}
                      <span className="text-sm font-bold" style={{
                        color: selectedAttempt?.correctStrict ? '#16a34a' : selectedAttempt ? '#dc2626' : 'var(--text-tertiary)',
                      }}>
                        {selectedAttempt ? (selectedAttempt.correctStrict ? 'Correct' : 'Incorrect') : 'No Data'}
                      </span>
                    </div>
                  </div>

                  {/* Moves comparison */}
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: '#15781B' }} />
                          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#15781B' }}>
                            Expected
                          </span>
                        </div>
                        <div className="font-mono text-[13px] leading-relaxed break-all" style={{ color: 'var(--text-primary)' }}>
                          {selectedAttempt?.expectedSanLine || selectedPuzzleExpected || '—'}
                        </div>
                        {selectedAttempt?.expectedSanLine && (
                          <div className="font-mono text-[10px] mt-0.5 break-all" style={{ color: 'var(--text-tertiary)' }}>
                            {selectedPuzzleExpected}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: selectedAttempt?.correctStrict ? '#15781B' : '#882020' }} />
                          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: selectedAttempt?.correctStrict ? '#15781B' : '#882020' }}>
                            Model
                          </span>
                          {selectedAttempt?.parseStatus && selectedAttempt.parseStatus !== 'ok' && (
                            <span className="text-[9px] px-1 py-px rounded" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                              {selectedAttempt.parseStatus}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[13px] leading-relaxed break-all" style={{ color: 'var(--text-primary)' }}>
                          {selectedAttempt?.sanLine || selectedAttempt?.parsedLine || '—'}
                        </div>
                        {selectedAttempt?.sanLine && selectedAttempt?.parsedLine && (
                          <div className="font-mono text-[10px] mt-0.5 break-all" style={{ color: 'var(--text-tertiary)' }}>
                            {selectedAttempt.parsedLine}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Usage stats */}
                  <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="grid grid-cols-3 gap-x-2 text-[11px]">
                      <div className="flex flex-col">
                        <span style={{ color: 'var(--text-tertiary)' }}>Prompt</span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {(selectedAttempt?.usage.promptTokens ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span style={{ color: 'var(--text-tertiary)' }}>Completion</span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {(selectedAttempt?.usage.completionTokens ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span style={{ color: 'var(--text-tertiary)' }}>Latency</span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {Math.round(selectedAttempt?.latencyMs ?? 0)}ms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Raw output + thinking */}
                  <div className="px-4 py-3" style={{ borderBottom: (selectedPuzzle.source?.url || selectedPuzzle.source?.gameUrl) ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                        Raw Output
                      </div>
                      {selectedAttempt?.rawOutputTruncated && !detail && (
                        <button
                          onClick={loadDetail}
                          disabled={detailLoadingKey === detailKey}
                          className="text-[11px] hover:underline disabled:opacity-50"
                          style={{ color: 'var(--accent)' }}
                        >
                          {detailLoadingKey === detailKey ? 'Loading…' : 'Show full output'}
                        </button>
                      )}
                    </div>
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-relaxed max-h-24 overflow-y-auto custom-scrollbar" style={{ color: 'var(--text-secondary)' }}>
                      {detail?.rawOutput ?? selectedAttempt?.rawOutput ?? '—'}
                      {selectedAttempt?.rawOutputTruncated && !detail && '…'}
                    </pre>
                    {selectedAttempt && selectedAttempt.thinkingChars > 0 && (
                      <>
                        <button
                          onClick={() => {
                            setShowThinking((prev) => {
                              const next = !prev;
                              if (next && !detail) void loadDetail();
                              return next;
                            });
                          }}
                          className="mt-2 text-[11px] flex items-center gap-1 hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${showThinking ? '' : '-rotate-90'}`} />
                          Thinking ({selectedAttempt.thinkingChars.toLocaleString()} chars)
                        </button>
                        {showThinking && (
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar rounded p-2" style={{ color: 'var(--text-tertiary)', background: 'var(--border-subtle)' }}>
                            {detail?.thinkingText ?? (detailLoadingKey === detailKey ? 'Loading…' : '')}
                          </pre>
                        )}
                      </>
                    )}
                  </div>

                  {/* Links */}
                  {(selectedPuzzle.source?.url || selectedPuzzle.source?.gameUrl) && (
                    <div className="px-4 py-2.5 flex items-center gap-2">
                      {selectedPuzzle.source?.url && (
                        <a
                          href={selectedPuzzle.source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors hover:bg-[var(--border-subtle)]"
                          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Puzzle
                        </a>
                      )}
                      {selectedPuzzle.source?.gameUrl && (
                        <a
                          href={selectedPuzzle.source.gameUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors hover:bg-[var(--border-subtle)]"
                          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Game
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
