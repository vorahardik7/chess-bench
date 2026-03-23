'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

type EmptyPuzzle = {
  id: string;
  level: string;
  fen?: string;
  requiredPlies?: number;
  source?: {
    url?: string;
  };
};

const EMPTY_PUZZLES: EmptyPuzzle[] = [];
const EMPTY_MODELS: { id: string; label: string; sublabel?: string }[] = [];

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
            className="absolute z-50 top-full mt-1 w-full max-h-64 overflow-y-auto overscroll-none rounded-lg shadow-lg"
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
  mate1: 'Force checkmate in one move.',
  mate2: 'Force checkmate in two moves (3 plies).',
  fork: 'Attack two or more enemy pieces at once.',
  pin: 'A piece is stuck because moving it loses a more valuable piece.',
  hangingPiece: 'Win an undefended enemy piece.',
};

function getTrackDescription(level: string): string {
  const known = TRACK_DESCRIPTIONS[level];
  if (known) return known;
  const mateMatch = /^mate(\d+)$/.exec(level);
  if (mateMatch) {
    const n = Number(mateMatch[1]);
    return `Force checkmate in ${n} move${n === 1 ? '' : 's'}.`;
  }
  return 'Find the best tactical line.';
}

function formatTrackLabel(level: string): string {
  if (level in TRACK_DESCRIPTIONS) {
    if (level === 'hangingPiece') return 'Hanging Piece';
    return level === 'mate1'
      ? 'Mate 1'
      : level === 'mate2'
      ? 'Mate 2'
      : level.charAt(0).toUpperCase() + level.slice(1);
  }
  const mateMatch = /^mate(\d+)$/.exec(level);
  if (mateMatch) return `Mate ${mateMatch[1]}`;
  return level
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPuzzleDescription(level: string, fen: string, requiredPlies: number): string {
  const side = fen.includes(' w ') ? 'White' : 'Black';
  const mateMatch = /^mate(\d+)$/.exec(level);
  if (mateMatch) {
    return `${side} to move and find checkmate in ${mateMatch[1]} move${mateMatch[1] === '1' ? '' : 's'}.`;
  }
  return `${side} to move and find the best ${requiredPlies}-ply line (${formatTrackLabel(level)}).`;
}

// ============================================================================
// PUZZLES TAB
// ============================================================================
export default function PuzzlesTab() {
  const visiblePuzzles = EMPTY_PUZZLES;
  const hasPuzzles = false;
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const modelOptions = EMPTY_MODELS;

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


  const modelStats = useMemo(() => {
    return { correct: 0, total: 0, pct: '0' };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollIndicators = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollTop(scrollTop > 10);
      setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 10);
    };

    updateScrollIndicators();
    container.addEventListener('scroll', updateScrollIndicators);
    window.addEventListener('resize', updateScrollIndicators);

    updateScrollIndicators();

    return () => {
      container.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [filteredPuzzles]);

  const levelBadgeStyle = (level: string) => {
    switch (level) {
      case 'mate1': return { background: '#dcfce7', color: '#166534' };
      case 'mate2': return { background: '#dbeafe', color: '#1e40af' };
      case 'fork': return { background: '#fef9c3', color: '#854d0e' };
      case 'pin': return { background: '#fee2e2', color: '#991b1b' };
      case 'hangingPiece': return { background: '#cffafe', color: '#155e75' };
      default: return { background: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div
      className="h-full min-h-0 grid gap-6 lg:gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch"
    >
      {/* Sidebar */}
      <aside className="flex flex-col h-full">
        <div
          className="flex-1 flex flex-col rounded-xl overflow-hidden h-full"
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
                value={selectedModelId}
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

          <div className="flex-1 min-h-0 relative">
            {/* Scroll top indicator */}
            {showScrollTop && (
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="w-full h-8 flex items-start justify-center pt-1" style={{ background: 'linear-gradient(to bottom, var(--surface), transparent)' }}>
                  <div className="rounded-full p-1" style={{ background: 'var(--border-subtle)' }}>
                    <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Scrollable list container */}
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar"
            >
              {filteredPuzzles.length === 0 ? (
                <div className="p-6 text-sm text-center italic" style={{ color: 'var(--text-tertiary)' }}>No puzzles match your filters.</div>
              ) : (
                <div className="space-y-1">
                  {filteredPuzzles.map((puzzle, idx) => {
                    const active = activePuzzleId === puzzle.id;
                    return (
                      <button
                        key={puzzle.id}
                        type="button"
                        onClick={() => setSelectedPuzzleId(puzzle.id)}
                        className="w-full text-left rounded-lg px-3 py-2 transition-all"
                        style={{
                          background: active ? 'var(--accent-light)' : 'transparent',
                          border: active ? '1px solid #bfdbfe' : '1px solid transparent',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2.5">
                            <span className="text-xs font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              Puzzle {idx + 1}
                            </span>
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded truncate max-w-[160px]"
                              style={levelBadgeStyle(puzzle.level)}
                              title={`${formatTrackLabel(puzzle.level)}: ${getTrackDescription(puzzle.level)}`}
                            >
                              {formatTrackLabel(puzzle.level)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {puzzle.source?.url && (
                              <a
                                href={puzzle.source.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                                style={{
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-tertiary)',
                                }}
                                title="View on Lichess"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                Lichess
                              </a>
                            )}
                            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scroll bottom indicator */}
            {showScrollBottom && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="w-full h-8 flex items-end justify-center pb-1" style={{ background: 'linear-gradient(to top, var(--surface), transparent)' }}>
                  <div className="rounded-full p-1" style={{ background: 'var(--border-subtle)' }}>
                    <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main panel */}
      <section className="flex flex-col h-full min-w-0">
        <div
          className="flex-1 flex flex-col rounded-xl overflow-hidden h-full"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="shrink-0 px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {hasPuzzles ? `Puzzle ${selectedIndex + 1}` : 'Puzzle Explorer'}
                  </div>
                  {selectedPuzzle && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={levelBadgeStyle(selectedPuzzle.level)}
                      title={getTrackDescription(selectedPuzzle.level)}
                    >
                      {formatTrackLabel(selectedPuzzle.level)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm italic" style={{ color: 'var(--text-secondary)' }}>
                  {selectedPuzzle
                    ? getPuzzleDescription(selectedPuzzle.level, selectedPuzzle.fen ?? '', selectedPuzzle.requiredPlies ?? 1)
                    : 'No puzzle results yet. This layout stays in place so you can keep building the UI first.'}
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {selectedPuzzle ? getTrackDescription(selectedPuzzle.level) : 'Run or load benchmark results later to populate this panel.'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 xl:p-6">
            {!selectedPuzzle ? (
              <div className="flex h-full min-h-[420px] flex-col lg:flex-row gap-6 xl:gap-8">
                <div className="flex-1 flex flex-col items-center justify-center min-h-[320px]">
                  <div className="w-full max-w-[60vh] xl:max-w-[65vh] aspect-square">
                    <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed" style={{ background: 'var(--border-subtle)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                      <div className="max-w-[320px] text-center px-6">
                        <div className="text-sm font-semibold uppercase tracking-[0.2em]">No tests yet</div>
                        <div className="mt-3 text-sm leading-6">
                          The board and detail panel stay visible, but benchmark data loading is disabled for now.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:w-[300px] xl:w-[280px] flex flex-col gap-3 lg:py-2">
                  <div className="rounded-lg p-4" style={{ background: 'var(--accent-light)', border: '1px solid #bfdbfe' }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                      Waiting for data
                    </div>
                    <div className="mt-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      No benchmark runs available
                    </div>
                    <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Once you wire in your loader functions, this panel can show model answers, correctness, and puzzle metadata.
                    </div>
                  </div>
                  <div className="rounded-lg p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                      UI Status
                    </div>
                    <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Selectors, board space, comparison cards, and metadata blocks are all preserved for styling work.
                    </div>
                  </div>
                </div>
            </div>
            ) : (
            <div className="hidden" />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
