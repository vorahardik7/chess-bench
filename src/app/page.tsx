import type { Metadata } from 'next';
import ExplorerPage from './components/ExplorerPage';
import { getLatestResults } from './lib/results';

export async function generateMetadata(): Promise<Metadata> {
  const results = await getLatestResults();

  return {
    title: 'Chess LLM Benchmark Leaderboard',
    description: `Compare ${results.models.length} language models across ${results.puzzles.length} ChessBench puzzles with strict UCI scoring.`,
    alternates: {
      canonical: '/',
    },
  };
}

export default async function Home() {
  return <ExplorerPage />;
}
