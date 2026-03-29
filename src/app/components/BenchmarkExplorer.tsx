'use client';

import Link, { useLinkStatus } from 'next/link';
import PuzzlesTab from './PuzzlesTab';
import BenchmarksTab from './BenchmarksTab';
import type { ExplorerResults } from '../lib/results.types';

function TabPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full bg-[var(--accent)] transition-opacity duration-200 ${
        pending ? 'opacity-100 animate-pulse' : 'opacity-0'
      }`}
    />
  );
}

export default function BenchmarkExplorer({
  activeView,
  results,
}: {
  activeView: 'puzzle' | 'benchmark';
  results: ExplorerResults;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      {/* Compact View Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--border-subtle)' }}>
        <Link
          href="/puzzle"
          prefetch={true}
          scroll={false}
          aria-current={activeView === 'puzzle' ? 'page' : undefined}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={{
            background: activeView === 'puzzle' ? 'var(--surface)' : 'transparent',
            color: activeView === 'puzzle' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            boxShadow: activeView === 'puzzle' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <span className="inline-flex items-center gap-2">
            <span>Puzzle Explorer</span>
            <TabPendingIndicator />
          </span>
        </Link>
        <Link
          href="/benchmark"
          prefetch={true}
          scroll={false}
          aria-current={activeView === 'benchmark' ? 'page' : undefined}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={{
            background: activeView === 'benchmark' ? 'var(--surface)' : 'transparent',
            color: activeView === 'benchmark' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            boxShadow: activeView === 'benchmark' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <span className="inline-flex items-center gap-2">
            <span>Benchmarks</span>
            <TabPendingIndicator />
          </span>
        </Link>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 min-h-0">
        {activeView === 'puzzle' && <PuzzlesTab results={results} />}
        {activeView === 'benchmark' && <BenchmarksTab results={results} />}
      </div>
    </div>
  );
}
