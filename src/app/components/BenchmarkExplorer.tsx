'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import { motion } from 'motion/react';
import { ChartScatter, Puzzle, Trophy, type LucideIcon } from 'lucide-react';
import ChartsTab from './ChartsTab';
import BrandLoader from './BrandLoader';
import type { ExplorerResults } from '../lib/results.types';

type TabComponent = ComponentType<{ results: ExplorerResults }>;

let cachedBenchmarks: TabComponent | null = null;
let cachedPuzzles: TabComponent | null = null;

function preloadBenchmarks() {
  return import('./BenchmarksTab').then((mod) => {
    cachedBenchmarks = mod.default;
    return mod.default;
  });
}

function preloadPuzzles() {
  return import('./PuzzlesTab').then((mod) => {
    cachedPuzzles = mod.default;
    return mod.default;
  });
}

function TabSkeleton({ label }: { label: string }) {
  return (
    <div className="grid min-h-[max(640px,calc(100dvh-14rem))] place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="loader-enter">
        <BrandLoader label={label} size={36} />
      </div>
    </div>
  );
}

function LeaderboardPanel({ results }: { results: ExplorerResults }) {
  const [loaded, setLoaded] = useState<{ Component: TabComponent } | null>(() =>
    cachedBenchmarks ? { Component: cachedBenchmarks } : null
  );

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void preloadBenchmarks().then((Component) => {
      if (!cancelled) setLoaded({ Component });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  if (!loaded) return <TabSkeleton label="Loading standings" />;
  const { Component } = loaded;
  return <Component results={results} />;
}

function PuzzlesPanel({ results }: { results: ExplorerResults }) {
  const [loaded, setLoaded] = useState<{ Component: TabComponent } | null>(() =>
    cachedPuzzles ? { Component: cachedPuzzles } : null
  );

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void preloadPuzzles().then((Component) => {
      if (!cancelled) setLoaded({ Component });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  if (!loaded) return <TabSkeleton label="Loading puzzle browser" />;
  const { Component } = loaded;
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <Component results={results} />
    </div>
  );
}

export type ExplorerView = 'charts' | 'leaderboard' | 'puzzles';

const TABS: { id: ExplorerView; label: string; icon: LucideIcon }[] = [
  { id: 'charts', label: 'Charts', icon: ChartScatter },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'puzzles', label: 'Puzzle Browser', icon: Puzzle },
];

const locationListeners = new Set<() => void>();

function subscribeToLocation(onStoreChange: () => void) {
  locationListeners.add(onStoreChange);
  window.addEventListener('popstate', onStoreChange);
  return () => {
    locationListeners.delete(onStoreChange);
    window.removeEventListener('popstate', onStoreChange);
  };
}

function notifyLocationListeners() {
  locationListeners.forEach((listener) => listener());
}

function viewFromLocation(fallback: ExplorerView): ExplorerView {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'benchmark' || tab === 'leaderboard') return 'leaderboard';
  if (tab === 'puzzles' || tab === 'puzzle') return 'puzzles';
  if (tab === 'charts') return 'charts';
  if (window.location.hash === '#benchmarks') return 'leaderboard';
  return fallback;
}

export default function BenchmarkExplorer({
  results,
  initialView = 'charts',
}: {
  results: ExplorerResults;
  initialView?: ExplorerView;
}) {
  const view = useSyncExternalStore(
    subscribeToLocation,
    () => viewFromLocation(initialView),
    () => initialView,
  );
  const [leaderboardReady, setLeaderboardReady] = useState(view === 'leaderboard');
  const [puzzlesReady, setPuzzlesReady] = useState(view === 'puzzles');
  const [hasSwitched, setHasSwitched] = useState(false);

  if (view === 'leaderboard' && !leaderboardReady) {
    setLeaderboardReady(true);
  }
  if (view === 'puzzles' && !puzzlesReady) {
    setPuzzlesReady(true);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void preloadBenchmarks();
      void preloadPuzzles();
    }, 150);
    return () => window.clearTimeout(timeout);
  }, []);

  useLayoutEffect(() => {
    if (view === viewFromLocation(initialView)) {
      delete document.documentElement.dataset.benchTab;
    }
  }, [view, initialView]);

  const selectView = (next: ExplorerView) => {
    setHasSwitched(true);
    if (next === 'leaderboard') {
      setLeaderboardReady(true);
      void preloadBenchmarks();
    } else if (next === 'puzzles') {
      setPuzzlesReady(true);
      void preloadPuzzles();
    }
    const url = new URL(window.location.href);
    if (next === 'charts') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    url.hash = '';
    const nextUrl = `${url.pathname}${url.search}`;
    window.history.replaceState(null, '', nextUrl);
    notifyLocationListeners();
  };

  return (
    <div className="mt-5 flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="ChessBench views"
        className="relative inline-flex w-fit items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1"
      >
        {TABS.map((tab) => {
          const selected = view === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onMouseEnter={() => {
                if (tab.id === 'leaderboard') void preloadBenchmarks();
                else if (tab.id === 'puzzles') void preloadPuzzles();
              }}
              onFocus={() => {
                if (tab.id === 'leaderboard') void preloadBenchmarks();
                else if (tab.id === 'puzzles') void preloadPuzzles();
              }}
              onClick={() => selectView(tab.id)}
              className={`relative flex h-8 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                selected
                  ? 'text-[var(--on-accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]'
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="explorer-tab-pill"
                  className="absolute inset-0 rounded-lg bg-[var(--accent)] shadow-[0_2px_10px_-3px_var(--accent)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <Icon className="relative h-4 w-4" strokeWidth={2.25} />
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-charts"
        aria-labelledby="tab-charts"
        hidden={view !== 'charts'}
        className={view === 'charts' ? (hasSwitched ? 'view-enter' : undefined) : 'hidden'}
      >
        <ChartsTab results={results} />
      </div>

      <div
        role="tabpanel"
        id="panel-leaderboard"
        aria-labelledby="tab-leaderboard"
        hidden={view !== 'leaderboard'}
        className={view === 'leaderboard' ? (hasSwitched ? 'view-enter' : undefined) : 'hidden'}
      >
        {leaderboardReady ? <LeaderboardPanel results={results} /> : null}
      </div>

      <div
        role="tabpanel"
        id="panel-puzzles"
        aria-labelledby="tab-puzzles"
        hidden={view !== 'puzzles'}
        className={
          view === 'puzzles'
            ? `${hasSwitched ? 'view-enter ' : ''}flex flex-col xl:h-[calc(100dvh-12rem)] xl:min-h-[640px]`
            : 'hidden'
        }
      >
        {puzzlesReady ? <PuzzlesPanel results={results} /> : null}
      </div>
    </div>
  );
}
