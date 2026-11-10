import BenchmarkExplorer from './BenchmarkExplorer';
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
    <>
      <StructuredData data={structuredData} />
      <h1 className="sr-only">ChessBench: how language models do on Lichess chess puzzles</h1>
      <BenchmarkExplorer results={clientResults} />
    </>
  );
}
