'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import { Puzzle, Trophy, type LucideIcon } from 'lucide-react';
import PuzzlesTab from './PuzzlesTab';
import BrandLoader from './BrandLoader';
import type { ExplorerResults } from '../lib/results.types';

type BenchmarksComponent = ComponentType<{ results: ExplorerResults }>;

let cachedBenchmarks: BenchmarksComponent | null = null;

function preloadBenchmarks() {
  return import('./BenchmarksTab').then((mod) => {
    cachedBenchmarks = mod.default;
    return mod.default;
  });
}

function LeaderboardSkeleton() {
  return (
    <div className="grid min-h-[max(640px,calc(100dvh-14rem))] place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="loader-enter">
        <BrandLoader label="Loading standings" size={36} />
      </div>
    </div>
  );
}

function LeaderboardPanel({ results }: { results: ExplorerResults }) {
  // Keep the component in an object. useState calls a function passed as the
  // initial value, which would render the tab with no props.
  const [loaded, setLoaded] = useState<{ Component: BenchmarksComponent } | null>(() =>
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

  if (!loaded) return <LeaderboardSkeleton />;
  const { Component } = loaded;
  return (
    <div className="view-enter">
      <Component results={results} />
    </div>
  );
}

export type ExplorerView = 'puzzles' | 'leaderboard';

const TABS: { id: ExplorerView; label: string; icon: LucideIcon }[] = [
  { id: 'puzzles', label: 'Puzzle Browser', icon: Puzzle },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
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
  if (window.location.hash === '#benchmarks') return 'leaderboard';
  return fallback;
}

export default function BenchmarkExplorer({
  results,
  initialView = 'puzzles',
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
  const [hasSwitched, setHasSwitched] = useState(false);
  if (view === 'leaderboard' && !leaderboardReady) {
    setLeaderboardReady(true);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void preloadBenchmarks();
    }, 600);
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
    }
    const url = new URL(window.location.href);
    if (next === 'leaderboard') url.searchParams.set('tab', 'benchmark');
    else url.searchParams.delete('tab');
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
        className="inline-flex w-fit items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1"
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
              }}
              onFocus={() => {
                if (tab.id === 'leaderboard') void preloadBenchmarks();
              }}
              onClick={() => selectView(tab.id)}
              className={`flex h-8 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_2px_10px_-3px_var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
              {tab.label}
            </button>
          );
        })}
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
        <PuzzlesTab results={results} />
      </div>
      <div
        role="tabpanel"
        id="panel-leaderboard"
        aria-labelledby="tab-leaderboard"
        hidden={view !== 'leaderboard'}
        className={view === 'leaderboard' ? undefined : 'hidden'}
      >
        {leaderboardReady ? <LeaderboardPanel results={results} /> : null}
      </div>
    </div>
  );
}
