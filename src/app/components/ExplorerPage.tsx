import Image from 'next/image';
import BenchmarkExplorer from './BenchmarkExplorer';
import StructuredData from './StructuredData';
import { getLatestResults } from '../lib/results';
import logo from '../icon.png';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  getModelRoute,
  toAbsoluteUrl,
} from '../lib/site';

export default async function ExplorerPage() {
  const results = await getLatestResults();

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
        url: toAbsoluteUrl(getModelRoute(model.id)),
      })),
    },
  ];

  return (
    <main
      className="min-h-screen flex flex-col font-sans"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      <StructuredData data={structuredData} />

      <div className="flex-1 flex flex-col w-full max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 pb-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <Image
                src={logo}
                alt="ChessBench logo"
                fill
                sizes="36px"
                className="object-contain scale-110 p-0.5"
                priority
              />
            </div>
            <div className="min-w-0 flex items-baseline gap-2.5">
              <h1 className="text-[17px] font-semibold tracking-tight leading-none">
                ChessBench
              </h1>
              <span
                className="hidden sm:inline text-[12px] leading-none truncate"
                style={{ color: 'var(--text-tertiary)' }}
              >
                LLM chess tactics, scored on strict UCI answers
              </span>
            </div>
          </div>

          <a
            href="https://github.com/vorahardik7/chess-bench"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View the ChessBench GitHub repository (opens in new tab)"
            className="group inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-light)]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3.5 w-3.5 fill-current"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.09-.74.09-.72.09-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.77.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.91 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.59-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.57 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
            </svg>
            <span className="leading-none">GitHub</span>
          </a>
        </header>

        <BenchmarkExplorer results={results} />
      </div>
    </main>
  );
}
