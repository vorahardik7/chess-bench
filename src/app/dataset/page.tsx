import type { Metadata } from 'next';
import Link from 'next/link';
import { getLatestResults } from '../lib/results';
import StructuredData from '../components/StructuredData';
import {
  SITE_NAME,
  formatDate,
  formatInteger,
  formatTrackLabel,
  getModelRoute,
  getTrackDescription,
  toAbsoluteUrl,
} from '../lib/site';

export async function generateMetadata(): Promise<Metadata> {
  const results = await getLatestResults();

  return {
    title: 'Dataset And Methodology',
    description: `Read how ChessBench builds and scores its ${results.puzzles.length}-puzzle chess benchmark dataset.`,
    alternates: {
      canonical: '/dataset',
    },
  };
}

export default async function DatasetPage() {
  const results = await getLatestResults();
  const trackCounts = Array.from(
    results.puzzles.reduce((map, puzzle) => {
      map.set(puzzle.level, (map.get(puzzle.level) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => formatTrackLabel(a[0]).localeCompare(formatTrackLabel(b[0])));

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'ChessBench benchmark dataset',
      description:
        'A fixed benchmark dataset of Lichess tactics used by ChessBench to evaluate language models on strict UCI move output.',
      url: toAbsoluteUrl('/dataset'),
      isAccessibleForFree: true,
      keywords: trackCounts.map(([track]) => formatTrackLabel(track)),
      creator: {
        '@type': 'Organization',
        name: SITE_NAME,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: toAbsoluteUrl('/'),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Dataset and methodology',
          item: toAbsoluteUrl('/dataset'),
        },
      ],
    },
  ];

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <StructuredData data={structuredData} />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <li>
              <Link href="/" className="hover:text-[var(--accent)]">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Dataset and methodology
            </li>
          </ol>
        </nav>

        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
            Benchmark reference
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">ChessBench dataset and scoring methodology</h1>
          <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
            ChessBench benchmarks LLMs on a fixed set of Lichess tactics and scores them using exact UCI move-line
            matches. This page is the canonical explanation of what the benchmark measures, where the data comes from,
            and how model scores are produced.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Dataset ID
              </p>
              <p className="mt-2 text-sm font-semibold">{results.datasetId ?? 'Unavailable'}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Puzzle count
              </p>
              <p className="mt-2 text-2xl font-bold">{formatInteger(results.puzzles.length)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Tracks
              </p>
              <p className="mt-2 text-2xl font-bold">{trackCounts.length}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Dataset generated
              </p>
              <p className="mt-2 text-sm font-semibold">{formatDate(results.generatedAt)}</p>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">How the benchmark is built</h2>
            <div className="mt-4 space-y-4 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              <p>
                The benchmark uses a fixed dataset generated from Lichess tactics. Each puzzle has a position, a target
                line, a track label, and an optional source URL back to the original Lichess puzzle.
              </p>
              <p>
                Models are prompted to return only the final answer as a UCI move line. Scores are based on exact match
                against the expected move sequence, which keeps comparisons strict and reproducible across providers.
              </p>
              <p>
                ChessBench also records parse status, latency, token usage, and repair behavior, so benchmark pages can
                explain whether a miss came from reasoning, formatting, or parsing.
              </p>
            </div>

            <h2 className="mt-8 text-2xl font-bold tracking-tight">Scoring rules</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              <li>Strict accuracy is the percentage of puzzles where the exact expected UCI line was returned.</li>
              <li>Parsed accuracy counts exact matches only among outputs that were parseable.</li>
              <li>Parse rate measures how often a model returned something that could be interpreted as a legal line.</li>
              <li>ChessBench can recover strict UCI, loose UCI extraction, and SAN-to-UCI conversions before scoring.</li>
            </ul>
          </div>

          <aside className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">Track breakdown</h2>
            <ul className="mt-4 space-y-3">
              {trackCounts.map(([track, count]) => (
                <li key={track} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{formatTrackLabel(track)}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      {count}
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

        <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="text-2xl font-bold tracking-tight">Sources and benchmark pages</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-4">
              <h3 className="text-lg font-semibold">Public sources</h3>
              <ul className="mt-3 space-y-2 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                <li>
                  <a
                    href="https://database.lichess.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline underline-offset-4"
                  >
                    Lichess database
                  </a>{' '}
                  provides the underlying puzzle source data.
                </li>
                <li>
                  <a
                    href="https://github.com/vorahardik7/chess-bench"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline underline-offset-4"
                  >
                    ChessBench on GitHub
                  </a>{' '}
                  contains the dataset builder, scoring code, and benchmark results.
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-4">
              <h3 className="text-lg font-semibold">Model result pages</h3>
              <ul className="mt-3 space-y-2 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                {results.models.slice(0, 5).map((model) => (
                  <li key={model.id}>
                    <Link href={getModelRoute(model.id)} className="text-[var(--accent)] underline underline-offset-4">
                      {model.name} benchmark page
                    </Link>{' '}
                    with {model.score.toFixed(1)}% strict accuracy.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
