'use client';

import { useRouter } from 'next/navigation';
import PuzzlesTab from './PuzzlesTab';
import BenchmarksTab from './BenchmarksTab';

export default function BenchmarkExplorer({
  activeView,
}: {
  activeView: 'puzzle' | 'benchmark';
}) {
  const router = useRouter();

  const switchView = (view: 'puzzle' | 'benchmark') => {
    if (view !== activeView) {
      router.push(`/${view}`);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      {/* Compact View Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--border-subtle)' }}>
        <button
          onClick={() => switchView('puzzle')}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={{
            background: activeView === 'puzzle' ? 'var(--surface)' : 'transparent',
            color: activeView === 'puzzle' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            boxShadow: activeView === 'puzzle' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          Puzzle Explorer
        </button>
        <button
          onClick={() => switchView('benchmark')}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all"
          style={{
            background: activeView === 'benchmark' ? 'var(--surface)' : 'transparent',
            color: activeView === 'benchmark' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            boxShadow: activeView === 'benchmark' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          Benchmarks
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeView === 'puzzle' && <PuzzlesTab />}
        {activeView === 'benchmark' && <BenchmarksTab />}
      </div>
    </div>
  );
}
