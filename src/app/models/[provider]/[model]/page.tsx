import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import StructuredData from '../../../components/StructuredData';
import { getLatestResults, getModelById } from '../../../lib/results';
import {
  formatCurrency,
  formatDate,
  formatInteger,
  formatPercent,
  formatTrackLabel,
  getModelRoute,
  getTrackDescription,
  modelIdFromParams,
  splitModelId,
  toAbsoluteUrl,
} from '../../../lib/site';

type ModelPageProps = {
  params: Promise<{
    provider: string;
    model: string;
  }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const results = await getLatestResults();
  return results.models.map((entry) => splitModelId(entry.id));
}

export async function generateMetadata({ params }: ModelPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const modelId = modelIdFromParams(resolvedParams.provider, resolvedParams.model);
  const model = await getModelById(modelId);

  if (!model) {
    return {
      title: 'Model not found',
    };
  }

  return {
    title: `${model.name} benchmark results`,
    description: `${model.name} scored ${formatPercent(model.score)} strict accuracy on ChessBench across ${model.summary.total} chess puzzles.`,
    alternates: {
      canonical: getModelRoute(model.id),
    },
  };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const resolvedParams = await params;
  const modelId = modelIdFromParams(resolvedParams.provider, resolvedParams.model);
  const [model, results] = await Promise.all([getModelById(modelId), getLatestResults()]);

  if (!model) {
    notFound();
  }

  const attempts = results.puzzles
    .map((puzzle) => ({
      puzzle,
      attempt: model.attemptsByPuzzleId[puzzle.id],
    }))
    .filter((entry) => Boolean(entry.attempt));

  const sampleSolved = attempts.filter((entry) => entry.attempt?.correctStrict).slice(0, 3);
  const sampleMissed = attempts.filter((entry) => !entry.attempt?.correctStrict).slice(0, 3);
  const sampleEntries = [...sampleSolved, ...sampleMissed];
  const breakdownEntries = Object.entries(model.breakdown).sort((a, b) =>
    formatTrackLabel(a[0]).localeCompare(formatTrackLabel(b[0]))
  );

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${model.name} ChessBench benchmark results`,
      url: toAbsoluteUrl(getModelRoute(model.id)),
      description: `${model.name} benchmark page on ChessBench with strict accuracy, tactical breakdown, and sample puzzle outcomes.`,
      isPartOf: {
        '@type': 'WebSite',
        name: 'ChessBench',
        url: toAbsoluteUrl('/'),
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
          name: model.name,
          item: toAbsoluteUrl(getModelRoute(model.id)),
        },
      ],
    },
  ];

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <StructuredData data={structuredData} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <li>
              <Link href="/" className="hover:text-[var(--accent)]">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {model.name}
            </li>
          </ol>
        </nav>

        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
            Benchmark page
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">{model.name} chess benchmark results</h1>
          <p className="mt-4 max-w-4xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
            {model.name} scored {formatPercent(model.score)} strict accuracy on ChessBench, solving {model.summary.correct}{' '}
            of {model.summary.total} fixed Lichess tactics when the answer had to match the expected UCI move line
            exactly.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Strict accuracy
              </p>
              <p className="mt-2 text-3xl font-bold" style={{ color: 'var(--accent)' }}>
                {formatPercent(model.score)}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Correct puzzles
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatInteger(model.summary.correct)}
                <span className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {' '}
                  / {formatInteger(model.summary.total)}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Prompt tokens
              </p>
              <p className="mt-2 text-3xl font-bold">{formatInteger(model.summary.totalPromptTokens)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Total cost
              </p>
              <p className="mt-2 text-3xl font-bold">{formatCurrency(model.summary.totalCost)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                Benchmark updated
              </p>
              <p className="mt-2 text-sm font-semibold">{formatDate(model.updatedAt)}</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,1.05fr)]">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">Tactical breakdown</h2>
            <div className="mt-4 space-y-3">
              {breakdownEntries.map(([track, value]) => (
                <div key={track} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{formatTrackLabel(track)}</h3>
                    <span className="rounded-full bg-[var(--accent-light)] px-3 py-1 text-sm font-semibold text-[var(--accent)]">
                      {formatPercent(value)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {getTrackDescription(track)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight">Why this page can rank</h2>
            <div className="mt-4 space-y-4 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              <p>
                This page gives Google a stable, canonical URL for the model and describes the benchmark result in
                plain HTML instead of only inside the interactive explorer.
              </p>
              <p>
                It also links back to the benchmark methodology and exposes model-specific copy, numbers, and sample
                puzzle outcomes that are relevant to searches like &quot;{model.name} chess benchmark&quot; and
                &quot;{model.name} tactical reasoning results&quot;.
              </p>
              <p>
                For the full dataset definition and scoring details, visit the{' '}
                <Link href="/dataset" className="text-[var(--accent)] underline underline-offset-4">
                  ChessBench dataset and methodology page
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Sample benchmark outcomes</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                These examples add readable, model-specific context beyond a single leaderboard number.
              </p>
            </div>
            <Link href="/" className="text-sm font-semibold text-[var(--accent)] underline underline-offset-4">
              Open the full explorer
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {sampleEntries.map(({ puzzle, attempt }) => {
              if (!attempt) return null;
              return (
                <article key={puzzle.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                        {formatTrackLabel(puzzle.level)}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">Puzzle {puzzle.id}</h3>
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-sm font-semibold"
                      style={{
                        background: attempt.correctStrict ? 'var(--success-light)' : 'var(--danger-light)',
                        color: attempt.correctStrict ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {attempt.correctStrict ? 'Solved' : 'Missed'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    <p>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Expected line:
                      </span>{' '}
                      {attempt.expectedLine}
                    </p>
                    <p>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Model line:
                      </span>{' '}
                      {attempt.parsedLine ?? 'No parseable line returned'}
                    </p>
                    <p>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Parse status:
                      </span>{' '}
                      {attempt.parseStatus}
                    </p>
                    {puzzle.source?.url ? (
                      <p>
                        <a
                          href={puzzle.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] underline underline-offset-4"
                        >
                          View original Lichess puzzle
                        </a>
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
