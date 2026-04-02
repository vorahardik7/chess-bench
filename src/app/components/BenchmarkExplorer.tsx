'use client';

import { useCallback, useEffect, useState } from 'react';
import PuzzlesTab from './PuzzlesTab';
import BenchmarksTab from './BenchmarksTab';
import type { ExplorerResults } from '../lib/results.types';

type ExplorerTab = 'puzzle' | 'benchmark';

function tabButtonStyle(active: boolean) {
  return {
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  } as const;
}

export default function BenchmarkExplorer({
  defaultView,
  results,
}: {
  defaultView: ExplorerTab;
  results: ExplorerResults;
}) {
  const [activeView, setActiveView] = useState<ExplorerTab>(defaultView);

  useEffect(() => {
    setActiveView(defaultView);
  }, [defaultView]);

  const selectTab = useCallback((view: ExplorerTab) => {
    setActiveView(view);
    if (typeof window === 'undefined') return;
    const next = new URL(window.location.href);
    if (view === 'puzzle') {
      next.searchParams.delete('tab');
    } else {
      next.searchParams.set('tab', view);
    }
    const qs = next.searchParams.toString();
    window.history.replaceState(window.history.state, '', qs ? `${next.pathname}?${qs}` : next.pathname);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div
        className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: 'var(--border-subtle)' }}
        role="tablist"
        aria-label="Main views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'puzzle'}
          id="tab-puzzle"
          tabIndex={activeView === 'puzzle' ? 0 : -1}
          onClick={() => selectTab('puzzle')}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={tabButtonStyle(activeView === 'puzzle')}
        >
          Puzzle Explorer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'benchmark'}
          id="tab-benchmark"
          tabIndex={activeView === 'benchmark' ? 0 : -1}
          onClick={() => selectTab('benchmark')}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={tabButtonStyle(activeView === 'benchmark')}
        >
          Benchmarks
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 relative">
        <div
          role="tabpanel"
          aria-labelledby="tab-puzzle"
          className={`flex flex-col flex-1 min-h-0 ${activeView !== 'puzzle' ? 'hidden' : ''}`}
          hidden={activeView !== 'puzzle'}
        >
          <PuzzlesTab results={results} />
        </div>
        <div
          role="tabpanel"
          aria-labelledby="tab-benchmark"
          className={`flex flex-col flex-1 min-h-0 ${activeView !== 'benchmark' ? 'hidden' : ''}`}
          hidden={activeView !== 'benchmark'}
        >
          <BenchmarksTab results={results} />
        </div>
      </div>
    </div>
  );
}
