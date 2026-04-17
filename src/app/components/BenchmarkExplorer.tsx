'use client';

import PuzzlesTab from './PuzzlesTab';
import BenchmarksTab from './BenchmarksTab';
import type { ExplorerResults } from '../lib/results.types';

export default function BenchmarkExplorer({
  results,
}: {
  results: ExplorerResults;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-[calc(100vh-160px)] min-h-[640px] flex flex-col">
        <PuzzlesTab results={results} />
      </div>
      <BenchmarksTab results={results} />
    </div>
  );
}
