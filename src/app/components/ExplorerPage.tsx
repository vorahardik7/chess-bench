import BenchmarkExplorer from './BenchmarkExplorer';
import SiteHeader from './SiteHeader';
import StructuredData from './StructuredData';
import { getLatestResults } from '../lib/results';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  toAbsoluteUrl,
} from '../lib/site';

export default async function ExplorerPage() {
  const results = await getLatestResults();
  // The puzzle list only needs each model's pass/fail marks. Full attempts for
  // the other models load when one of them is selected.
  const clientResults = {
    ...results,
    models: results.models.map((model, index) =>
      index === 0 ? model : { ...model, attemptsByPuzzleId: {} }
    ),
  };
  const stats = [
    { value: results.models.length, label: 'models' },
    { value: results.puzzles.length, label: 'Lichess puzzles' },
    { value: new Set(results.puzzles.map((puzzle) => puzzle.level)).size, label: 'puzzle types' },
  ];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: toAbsoluteUrl('/'),
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'ChessBench model leaderboard',
      itemListElement: results.models.slice(0, 10).map((model, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: model.name,
      })),
    },
  ];

  return (
    <main
      className="min-h-screen flex flex-col font-sans"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      <StructuredData data={structuredData} />

      <div className="flex-1 flex flex-col w-full max-w-[1500px] mx-auto px-3 sm:px-5 lg:px-8 xl:px-10 pt-4 sm:pt-5 pb-6 sm:pb-8">
        <SiteHeader stats={stats} />
        <BenchmarkExplorer results={clientResults} />
      </div>
    </main>
  );
}
