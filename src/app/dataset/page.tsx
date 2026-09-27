import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getLatestResults } from '../lib/results';
import StructuredData from '../components/StructuredData';
import SiteHeader from '../components/SiteHeader';
import { SYSTEM_PROMPT } from '../../bench/prompt';
import {
  SITE_NAME,
  formatDate,
  formatInteger,
  formatTrackLabel,
  getTrackDescription,
  toAbsoluteUrl,
} from '../lib/site';

export async function generateMetadata(): Promise<Metadata> {
  const results = await getLatestResults();

  return {
    title: 'Dataset and methodology',
    description: `How ChessBench picks its ${results.puzzles.length} puzzles and decides whether an answer counts.`,
    alternates: {
      canonical: '/dataset',
    },
  };
}

const TRACK_ORDER = ['mateIn1', 'mateIn2', 'fork', 'pin', 'hangingPiece'];

const PARSE_GROUPS = [
  { id: 'ok', label: 'Clean move line', note: 'Just the moves, nothing else.', scored: true },
  { id: 'loose', label: 'Moves inside other text', note: 'Pulled out of a longer reply.', scored: true },
  { id: 'san_converted', label: 'Converted from algebraic', note: 'Something like Qxf7#, translated from the board.', scored: true },
  { id: 'repair', label: 'Asked again', note: 'Older runs sent one follow-up after a blank reply.', scored: true },
  { id: 'invalid_count', label: 'Wrong length', note: 'Too many moves, or not enough.', scored: false },
  { id: 'invalid_uci', label: 'Unreadable', note: 'Not a move this parser could use.', scored: false },
  { id: 'missing', label: 'Blank', note: 'Nothing came back.', scored: false },
  { id: 'request_error', label: 'Request failed', note: 'The API errored on this puzzle.', scored: false },
] as const;

function parseGroupOf(status: string) {
  if (status.startsWith('repair_')) return 'repair';
  if (status.startsWith('loose_')) return 'loose';
  return PARSE_GROUPS.some((g) => g.id === status) ? status : 'invalid_uci';
}

function SectionHeading({ index, title, children }: { index: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs font-semibold text-[var(--accent)]">{index}</span>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      {children && (
        <p className="mt-1.5 max-w-2xl pl-[calc(1.1rem+0.75rem)] text-sm leading-6 text-[var(--text-secondary)]">
          {children}
        </p>
      )}
    </div>
  );
}

const cardClass = 'rounded-xl border border-[var(--border)] bg-[var(--surface)]';

export default async function DatasetPage() {
  const results = await getLatestResults();

  const tracks = Array.from(new Set(results.puzzles.map((p) => p.level))).sort(
    (a, b) => (TRACK_ORDER.indexOf(a) + 1 || 99) - (TRACK_ORDER.indexOf(b) + 1 || 99)
  );
  const bands = Array.from(new Set(results.puzzles.map((p) => p.ratingBucket ?? 'Unrated'))).sort(
    (a, b) => (parseInt(a, 10) || Infinity) - (parseInt(b, 10) || Infinity)
  );

  const composition = tracks.map((track) => {
    const puzzles = results.puzzles.filter((p) => p.level === track);
    const plies = Array.from(new Set(puzzles.map((p) => p.requiredPlies))).sort((a, b) => a - b);
    const scores = results.models.map((m) => m.breakdown[track]).filter((v): v is number => typeof v === 'number');
    return {
      track,
      total: puzzles.length,
      byBand: bands.map((band) => puzzles.filter((p) => (p.ratingBucket ?? 'Unrated') === band).length),
      plies: plies.length > 1 ? `${plies[0]}–${plies[plies.length - 1]}` : String(plies[0] ?? '—'),
      fieldAverage: scores.length ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null,
    };
  });

  const attempts = results.models.flatMap((m) => Object.values(m.attemptsByPuzzleId));
  const parseCounts = new Map<string, number>();
  for (const attempt of attempts) {
    const group = parseGroupOf(attempt.parseStatus);
    parseCounts.set(group, (parseCounts.get(group) ?? 0) + 1);
  }
  const parseRows = PARSE_GROUPS.map((g) => ({ ...g, count: parseCounts.get(g.id) ?? 0 })).filter(
    (row) => row.count > 0 || row.id === 'ok'
  );
  const maxParseCount = Math.max(1, ...parseRows.map((r) => r.count));

  const facts = [
    { value: formatInteger(results.puzzles.length), label: 'puzzles' },
    { value: String(tracks.length), label: 'tactic types' },
    { value: String(bands.length), label: 'rating bands' },
    { value: formatInteger(results.models.length), label: 'models tested' },
    { value: formatInteger(attempts.length), label: 'graded answers' },
  ];

  const steps = [
    {
      title: 'Pick',
      body: 'Taken from the public Lichess puzzle database. A fixed seed picks ten puzzles for each tactic and each rating band. Anything longer than three moves is skipped.',
    },
    {
      title: 'Ask',
      body: 'The model gets the position as FEN and a text board, plus who moves and how many moves to give. The reply has to be UCI, written like e2e4.',
    },
    {
      title: 'Read',
      body: 'A bare move line is used as-is. If the model writes around it, the moves are pulled out. Algebraic moves like Qxf7# are converted from the position.',
    },
    {
      title: 'Mark',
      body: 'Solved means the line matches Lichess exactly. A close answer is still wrong.',
    },
  ];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'ChessBench benchmark dataset',
      description:
        'Lichess tactics ChessBench uses to test whether a model can play the published solution in UCI.',
      url: toAbsoluteUrl('/dataset'),
      isAccessibleForFree: true,
      keywords: tracks.map((track) => formatTrackLabel(track)),
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
    <main className="min-h-screen font-sans" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <StructuredData data={structuredData} />
      <div
        className="mx-auto w-full min-w-0 max-w-5xl px-4 pt-4 pb-16 sm:px-6 sm:pt-5"
        style={{ overflowX: 'clip' }}
      >
        <SiteHeader page="methodology" />

        <section className="pt-10 pb-12 sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Methodology</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[40px]">
            How ChessBench scores a model
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            Every model sees the same Lichess puzzles, with the same prompt. One try. The moves have to match the
            published solution exactly.
          </p>

          <dl className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-5">
            {facts.map((fact, i) => (
              <div
                key={fact.label}
                className={`flex flex-col-reverse bg-[var(--surface)] px-4 py-4 ${
                  i === facts.length - 1 ? 'col-span-2 sm:col-span-1' : ''
                }`}
              >
                <dt className="mt-1 text-xs text-[var(--text-secondary)]">{fact.label}</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums text-[var(--accent)]">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-full font-mono text-[11px] break-words text-[var(--text-tertiary)]">
            Dataset {results.datasetId ?? 'unavailable'} · generated {formatDate(results.generatedAt)} UTC
          </p>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="01" title="What happens to each puzzle" />
          <ol className={`${cardClass} min-w-0`}>
            {steps.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
                <div className="pt-5 text-center font-mono text-[13px] font-semibold leading-none text-[var(--accent)]">
                  {i + 1}
                </div>
                <div
                  className={`gap-4 border-l-2 py-5 pr-5 pl-4 sm:pr-6 ${
                    step.title === 'Ask' || step.title === 'Read'
                      ? 'grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start'
                      : ''
                  } ${i < steps.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''}`}
                  style={{ borderLeftColor: 'color-mix(in srgb, var(--accent) 55%, transparent)' }}
                >
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{step.title}</h3>
                    <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{step.body}</p>
                  </div>
                  {step.title === 'Ask' && (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-3">
                      <p className="text-[11px] font-medium text-[var(--text-tertiary)]">Sample mate in one</p>
                      <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-4 text-[var(--text-secondary)]">{`8 . . . . . . k .
7 . . . . . p p p
6 . . . . . . . .
5 . . . . . . . .
4 . . . . . . . .
3 . . . . . . . .
2 . . . . . P P P
1 . . . . R . K .
  a b c d e f g h`}</pre>
                      <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                        White to move, 1 move.{' '}
                        <span className="font-mono text-[var(--accent)]">e1e8</span>
                      </p>
                    </div>
                  )}
                  {step.title === 'Read' && (
                    <ul className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                      {[
                        ['e1e8', 'Used as-is', true],
                        ['The rook goes e1e8', 'Moves pulled out', true],
                        ['Re8#', 'Converted', true],
                        ['(blank)', 'Wrong', false],
                      ].map(([reply, outcome, ok]) => (
                        <li
                          key={String(reply)}
                          className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] px-3.5 py-2 last:border-0"
                        >
                          <span className="min-w-0 truncate font-mono text-[12px] text-[var(--text-primary)]">{reply}</span>
                          <span
                            className="shrink-0 text-[11px]"
                            style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}
                          >
                            {outcome}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="02" title="The puzzles">
            Ten of each tactic in each rating band, so every band weighs the same. Solved is the average across models.
          </SectionHeading>
          <div className={`${cardClass} overflow-x-auto`}>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                  <th className="px-5 py-3 font-medium">Tactic</th>
                  {bands.map((band) => (
                    <th key={band} className="px-3 py-3 text-center font-medium">
                      {band.replace('-', '–')}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-medium">Plies</th>
                  <th className="px-5 py-3 text-right font-medium">Solved</th>
                </tr>
              </thead>
              <tbody>
                {composition.map((row) => (
                  <tr key={row.track} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{formatTrackLabel(row.track)}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{getTrackDescription(row.track)}</div>
                    </td>
                    {row.byBand.map((count, i) => (
                      <td key={bands[i]} className="px-3 py-3.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                        {count}
                      </td>
                    ))}
                    <td className="px-3 py-3.5 text-center font-mono tabular-nums text-[var(--text-secondary)]">{row.plies}</td>
                    <td className="px-5 py-3.5">
                      {row.fieldAverage === null ? (
                        <span className="block text-right text-[var(--text-tertiary)]">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border-subtle)] sm:block">
                            <span
                              className="block h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${row.fieldAverage}%` }}
                            />
                          </span>
                          <span className="w-12 text-right font-mono tabular-nums">{row.fieldAverage.toFixed(1)}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">
            A ply is one side&apos;s move. Mate in two is three plies here: yours, their reply, then mate.
          </p>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="03" title="The prompt">
            One system prompt for every model. The puzzle is sent after it: FEN, a text board, who moves, the tactic,
            and how many moves to play.
          </SectionHeading>
          <details className={`${cardClass} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              System prompt
              <span className="text-xs text-[var(--text-tertiary)] group-open:hidden">Show</span>
              <span className="hidden text-xs text-[var(--text-tertiary)] group-open:inline">Hide</span>
            </summary>
            <pre className="custom-scrollbar overflow-x-auto border-t border-[var(--border-subtle)] px-5 py-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-[var(--text-secondary)]">
              {SYSTEM_PROMPT}
            </pre>
          </details>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ['Temperature', '0, when the model allows it'],
              ['Max tokens', '400, or 8,192 for reasoning models'],
              ['Reasoning', 'Medium, when the model has that setting'],
            ].map(([label, value]) => (
              <div key={label} className={`${cardClass} px-4 py-3`}>
                <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
                <div className="mt-1 text-sm font-medium">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="04" title="Messy replies">
            A lot of answers ignore the format. If the moves are still in there, they get pulled out and scored. Counts
            below are every reply in this run. Green was scored. Red was wrong.
          </SectionHeading>
          <div className={`${cardClass} divide-y divide-[var(--border-subtle)]`}>
            {parseRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px_7.5rem]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: row.scored ? 'var(--success)' : 'var(--danger)' }}
                    />
                    <span className="text-sm font-medium">{row.label}</span>
                  </div>
                  <div className="mt-0.5 pl-3.5 text-xs text-[var(--text-tertiary)]">{row.note}</div>
                </div>
                <span className="col-span-2 hidden h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)] sm:col-span-1 sm:block">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(row.count / maxParseCount) * 100}%`,
                      background: row.scored ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}
                  />
                </span>
                <span className="text-right font-mono text-sm tabular-nums">
                  {formatInteger(row.count)}
                  <span className="ml-2 inline-block w-12 text-xs text-[var(--text-tertiary)]">
                    {attempts.length ? ((row.count / attempts.length) * 100).toFixed(1) : '0.0'}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="05" title="The score" />
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ['Exact line', 'Has to match Lichess, including the opponent\'s forced replies on longer puzzles.'],
              ['One try', 'One request per puzzle. A blank reply or a failed request is wrong.'],
              ['Accuracy', `Solved puzzles divided by ${results.puzzles.length}. Each tactic has the same number of puzzles, so this is also the average of the tactic scores.`],
              ['Cost', 'Token use and dollars, as OpenRouter reported them, added up for the whole run.'],
            ].map(([title, body]) => (
              <li key={title} className={`${cardClass} p-5`}>
                <h3 className="text-[15px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="06" title="What this misses" />
          <ul className="space-y-2.5 text-sm leading-6 text-[var(--text-secondary)]">
            {[
              'Only the Lichess line counts. Another move that also wins is marked wrong.',
              `One puzzle is worth about ${(100 / Math.max(1, results.puzzles.length)).toFixed(1)} points. Gaps smaller than that are noise.`,
              'Each model was run once. A second run can score differently, even at temperature 0.',
              'The board is text. Models never see a picture of the position.',
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-[9px] h-1 w-3 shrink-0 rounded-full bg-[var(--accent)]" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="py-10 border-t border-[var(--border-subtle)]">
          <SectionHeading index="07" title="Sources" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { href: 'https://database.lichess.org/#puzzles', title: 'Lichess puzzle database', body: 'The positions, and the solutions this benchmark treats as correct.', external: true },
              { href: 'https://github.com/vorahardik7/chess-bench', title: 'ChessBench on GitHub', body: 'The sampler, the prompt, the parser, and the raw results.', external: true },
              { href: '/', title: 'Benchmark explorer', body: 'Every answer, one puzzle at a time.', external: false },
            ].map((link) => {
              const content = (
                <>
                  <div className="flex items-center justify-between text-[15px] font-semibold">
                    {link.title}
                    <span aria-hidden className="text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">
                      {link.external ? '↗' : '→'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{link.body}</p>
                </>
              );
              const className = `${cardClass} group block p-5 transition-colors hover:border-[var(--accent-border)]`;
              return link.external ? (
                <a key={link.title} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {content}
                </a>
              ) : (
                <Link key={link.title} href={link.href} className={className}>
                  {content}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
