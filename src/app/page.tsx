import type { Metadata } from 'next';
import ExplorerPage from './components/ExplorerPage';
import { getLatestResults } from './lib/results';
import { countBaseModels } from './lib/models';

export async function generateMetadata(): Promise<Metadata> {
  const results = await getLatestResults();
  const baseModelCount = countBaseModels(results.models);

  return {
    title: 'Chess LLM Benchmark Leaderboard',
    description: `Compare ${baseModelCount} language models across ${results.puzzles.length} ChessBench puzzles with strict UCI scoring.`,
    alternates: {
      canonical: '/',
    },
  };
}

export default function Home() {
  return <ExplorerPage />;
}
