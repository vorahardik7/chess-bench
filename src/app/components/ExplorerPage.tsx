import Image from 'next/image';
import Link from 'next/link';
import BenchmarkExplorer from './BenchmarkExplorer';
import StructuredData from './StructuredData';
import { getLatestResults } from '../lib/results';
import logo from '../icon.png';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  formatDate,
  formatPercent,
  formatTrackLabel,
  getModelRoute,
  getTrackDescription,
  toAbsoluteUrl,
} from '../lib/site';

export default async function ExplorerPage() {
  const results = await getLatestResults();
  const modelCount = results.models.length;
  const puzzleCount = results.puzzles.length;
  const trackCounts = Array.from(
    results.puzzles.reduce((map, puzzle) => {
      map.set(puzzle.level, (map.get(puzzle.level) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => formatTrackLabel(a[0]).localeCompare(formatTrackLabel(b[0])));
  const latestUpdatedAt =
    results.models
      .map((model) => model.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? results.generatedAt;

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
    <main className="min-h-screen flex flex-col font-sans" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <StructuredData data={structuredData} />
      <div className="flex-1 flex flex-col max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
        <header className="mb-8 relative flex flex-col gap-6 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f7ff_100%)] px-5 py-6 shadow-[0_8px_40px_rgba(37,99,235,0.08)] sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="relative w-14 h-14 shrink-0 rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-white border border-[#e2e8f0] overflow-hidden">
                <Image
                  src={logo}
                  alt="ChessBench logo"
                  fill
                  sizes="56px"
                  className="object-contain scale-110 p-0.5"
                  priority
                />
              </div>
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent)' }}>
                  Search-friendly benchmark hub
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl" style={{ color: 'var(--text-primary)' }}>
                  ChessBench measures how well LLMs solve chess tactics with strict UCI answers.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                  Compare benchmark pages for individual models, review the benchmark dataset and methodology, and use
                  the interactive explorer to inspect puzzle-by-puzzle results.
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <a
                href="https://github.com/vorahardik7/chess-bench"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View the ChessBench GitHub repository (opens in new tab)"
                className="group inline-flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent-light)] hover:shadow-[0_4px_14px_rgba(37,99,235,0.12)] focus-visible:outline focus-visible:outline-[var(--accent)]"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-90 group-hover:opacity-100" style={{ color: 'var(--text-primary)' }}>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.09-.74.09-.72.09-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.77.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.91 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.59-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.57 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
                </svg>
                <span className="leading-tight">View on GitHub</span>
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Benchmarked models
              </p>
              <p className="mt-2 text-3xl font-bold">{modelCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Puzzle positions
              </p>
              <p className="mt-2 text-3xl font-bold">{puzzleCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Tactical tracks
              </p>
              <p className="mt-2 text-3xl font-bold">{trackCounts.length}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Latest benchmark update
              </p>
              <p className="mt-2 text-lg font-semibold">{formatDate(latestUpdatedAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dataset"
              className="inline-flex items-center rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Read the dataset and methodology
            </Link>
            {results.models[0] ? (
              <Link
                href={getModelRoute(results.models[0].id)}
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--accent-light)]"
              >
                See the current top model page
              </Link>
            ) : null}
          </div>
        </header>

        <section className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">Model benchmark pages</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              Each model now has a dedicated landing page with a canonical URL, benchmark summary, tactical breakdown,
              and sample outcomes. These pages are the best targets for Google to index when someone searches for a
              specific model plus chess benchmark results.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {results.models.map((model, index) => (
                <Link
                  key={model.id}
                  href={getModelRoute(model.id)}
                  className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] p-4 transition hover:border-[var(--accent)] hover:shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                        Rank #{index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold leading-tight">{model.name}</h3>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {model.id}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[var(--accent-light)] px-3 py-2 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
                        Strict accuracy
                      </p>
                      <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>
                        {formatPercent(model.score)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <aside className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">Benchmark coverage</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              The dataset is intentionally small and interpretable, with fixed tracks so model pages can explain
              performance in terms people actually search for.
            </p>
            <ul className="mt-4 space-y-3">
              {trackCounts.map(([track, count]) => (
                <li key={track} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{formatTrackLabel(track)}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      {count} puzzles
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {getTrackDescription(track)}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="mb-8 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Interactive explorer</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                The explorer is still the best place to inspect individual puzzles, compare model outputs, and review
                parse failures. The new landing pages help discovery; the explorer stays the deep-dive tool.
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
              Updated {formatDate(latestUpdatedAt)}
            </p>
          </div>

          <div className="mt-5">
            <BenchmarkExplorer results={results} />
          </div>
        </section>
      </div>
    </main>
  );
}
