import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleX,
  Coins,
  Crosshair,
  Database,
  MessageSquareText,
  Percent,
  Repeat1,
  ScanText,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { getLatestResults } from '../lib/results';
import StructuredData from '../components/StructuredData';
import MethodologyToc, { type TocItem } from '../components/MethodologyToc';
import CopyButton from '../components/CopyButton';
import { SYSTEM_PROMPT } from '../../bench/prompt';
import { parseGroupOf } from '../lib/parse-status';
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
    title: 'Methodology',
    description: `How ChessBench picks its ${results.puzzles.length} puzzles and decides whether an answer counts.`,
    alternates: {
      canonical: '/methodology',
    },
  };
}

const TRACK_ORDER = ['mateIn1', 'mateIn2', 'fork', 'pin', 'hangingPiece'];

const TRACK_COLOR: Record<string, string> = {
  mateIn1: 'var(--track-mate1)',
  mate1: 'var(--track-mate1)',
  mateIn2: 'var(--track-mate2)',
  mate2: 'var(--track-mate2)',
  fork: 'var(--track-fork)',
  pin: 'var(--track-pin)',
  hangingPiece: 'var(--track-hanging)',
};

const PARSE_GROUPS = [
  { id: 'ok', label: 'Clean move line', note: 'Just the moves, nothing else.', scored: true, color: 'var(--success)' },
  { id: 'loose', label: 'Moves inside other text', note: 'Pulled out of a longer reply.', scored: true, color: 'color-mix(in srgb, var(--success) 60%, var(--surface))' },
  { id: 'san_converted', label: 'Converted from algebraic', note: 'Something like Qxf7#, translated using the board.', scored: true, color: 'var(--accent)' },
  { id: 'repair', label: 'Asked again', note: 'Older runs sent one follow-up after a blank reply.', scored: true, color: 'color-mix(in srgb, var(--accent) 55%, var(--surface))' },
  { id: 'invalid_count', label: 'Wrong length', note: 'Too many moves, or not enough.', scored: false, color: 'var(--danger)' },
  { id: 'invalid_uci', label: 'Unreadable', note: 'Not a move the parser could use.', scored: false, color: 'color-mix(in srgb, var(--danger) 60%, var(--surface))' },
  { id: 'missing', label: 'Blank', note: 'Nothing came back.', scored: false, color: 'var(--text-tertiary)' },
  { id: 'truncated', label: 'Cut off', note: 'Hit the token limit before giving an answer.', scored: false, color: 'color-mix(in srgb, var(--warning) 55%, var(--surface))' },
  { id: 'request_error', label: 'Request failed', note: 'The API errored on this puzzle.', scored: false, color: 'var(--warning)' },
] as const;

const SECTIONS: TocItem[] = [
  { id: 'pipeline', index: '01', title: 'Pipeline' },
  { id: 'puzzles', index: '02', title: 'The puzzles' },
  { id: 'prompt', index: '03', title: 'The prompt' },
  { id: 'replies', index: '04', title: 'Reading replies' },
  { id: 'scoring', index: '05', title: 'Scoring' },
  { id: 'limits', index: '06', title: 'Limitations' },
  { id: 'sources', index: '07', title: 'Sources' },
];

function Section({ id, lede, children }: { id: string; lede?: ReactNode; children: ReactNode }) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 border-t border-[var(--border-subtle)] py-12 first:border-t-0 first:pt-0">
      <header className="mb-6">
        <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--accent)]">{meta.index}</p>
        <h2 id={`${id}-title`} className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          {meta.title}
        </h2>
        {lede && <p className="mt-2 max-w-2xl text-[14.5px] leading-6 text-[var(--text-secondary)]">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Panel({ title, aside, children, className = '' }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2.5">
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">{title}</p>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

function IconChip({ icon: Icon, tone = 'accent' }: { icon: LucideIcon; tone?: 'accent' | 'warning' }) {
  const color = tone === 'accent' ? 'var(--accent)' : 'var(--warning)';
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent)` }}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

/** Heat for the solve-rate grid, stretched over the observed range so nearby cells still read apart. */
function heat(value: number, min: number, max: number) {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  return `color-mix(in srgb, var(--accent) ${Math.round(8 + t * 62)}%, transparent)`;
}

export default async function MethodologyPage() {
  const results = await getLatestResults();
  const { puzzles, models } = results;

  const tracks = Array.from(new Set(puzzles.map((p) => p.level))).sort(
    (a, b) => (TRACK_ORDER.indexOf(a) + 1 || 99) - (TRACK_ORDER.indexOf(b) + 1 || 99)
  );
  const bands = Array.from(new Set(puzzles.map((p) => p.ratingBucket ?? 'Unrated'))).sort(
    (a, b) => (parseInt(a, 10) || Infinity) - (parseInt(b, 10) || Infinity)
  );

  // Field solve rate per puzzle, from each model's pass/fail marks.
  const solveRate = puzzles.map((_, index) => {
    let graded = 0;
    let solved = 0;
    for (const model of models) {
      const mark = model.marks[index];
      if (mark === '1' || mark === '0') graded += 1;
      if (mark === '1') solved += 1;
    }
    return graded ? solved / graded : null;
  });
  const average = (indices: number[]) => {
    const rates = indices.map((i) => solveRate[i]).filter((v): v is number => v !== null);
    return rates.length ? (rates.reduce((a, b) => a + b, 0) / rates.length) * 100 : null;
  };

  const composition = tracks.map((track) => {
    const indices = puzzles.flatMap((p, i) => (p.level === track ? [i] : []));
    const plies = Array.from(new Set(indices.map((i) => puzzles[i].requiredPlies))).sort((a, b) => a - b);
    return {
      track,
      total: indices.length,
      plies: plies.length > 1 ? `${plies[0]}–${plies[plies.length - 1]}` : String(plies[0] ?? '—'),
      cells: bands.map((band) => {
        const inBand = indices.filter((i) => (puzzles[i].ratingBucket ?? 'Unrated') === band);
        return { count: inBand.length, solved: average(inBand) };
      }),
      solved: average(indices),
    };
  });
  const bandAverages = bands.map((band) =>
    average(puzzles.flatMap((p, i) => ((p.ratingBucket ?? 'Unrated') === band ? [i] : [])))
  );
  const cellCounts = new Set(composition.flatMap((row) => row.cells.map((c) => c.count)));
  const uniformCellCount = cellCounts.size === 1 ? [...cellCounts][0] : null;
  const trackCounts = new Set(composition.map((row) => row.total));
  const tacticsBalanced = trackCounts.size === 1;
  const cellRates = composition.flatMap((row) => row.cells.map((c) => c.solved)).filter((v): v is number => v !== null);
  const heatMin = cellRates.length ? Math.min(...cellRates) : 0;
  const heatMax = cellRates.length ? Math.max(...cellRates) : 100;

  // Request settings as the loaded runs recorded them, not as the runner defaults say today.
  const configured = models.map((m) => m.runConfig);
  const maxTokenValues = [...new Set(configured.map((c) => c.maxTokens).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const modeOf = <T,>(values: T[]) => {
    const counts = new Map<T, number>();
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const commonMaxTokens = modeOf(configured.map((c) => c.maxTokens).filter((v): v is number => v !== null));
  const efforts = [...new Set(configured.map((c) => c.reasoningEffort).filter((v): v is string => v !== null))];
  const zeroTemp = configured.filter((c) => c.temperature === 0).length;
  const settings: [string, string, string][] = [
    ['Temperature', '0', `where the model accepts it (${zeroTemp} of ${models.length} runs)`],
    [
      'Max tokens',
      commonMaxTokens ? formatInteger(commonMaxTokens) : '—',
      maxTokenValues.length > 1
        ? `most common; runs range ${formatInteger(maxTokenValues[0])}–${formatInteger(maxTokenValues[maxTokenValues.length - 1])}`
        : 'for every run',
    ],
    [
      'Reasoning effort',
      efforts.length > 1 ? 'Per variant' : efforts[0] ? efforts[0][0].toUpperCase() + efforts[0].slice(1) : 'None',
      efforts.length > 1 ? `${efforts.join(', ')}; shown in brackets after each model name` : 'when the model has the setting',
    ],
  ];

  const attempts = models.flatMap((m) => Object.values(m.attemptsByPuzzleId));
  const parseCounts = new Map<string, number>();
  for (const attempt of attempts) {
    const group = parseGroupOf(attempt.parseStatus);
    parseCounts.set(group, (parseCounts.get(group) ?? 0) + 1);
  }
  const parseRows = PARSE_GROUPS.map((g) => ({ ...g, count: parseCounts.get(g.id) ?? 0 })).filter(
    (row) => row.count > 0 || row.id === 'ok'
  );
  const share = (count: number) => (attempts.length ? (count / attempts.length) * 100 : 0);
  const scoredTotal = parseRows.filter((r) => r.scored).reduce((sum, r) => sum + r.count, 0);

  const facts = [
    { value: formatInteger(puzzles.length), label: 'Puzzles' },
    { value: String(tracks.length), label: 'Tactic types' },
    { value: String(bands.length), label: 'Rating bands' },
    { value: formatInteger(models.length), label: 'Models tested' },
    { value: formatInteger(attempts.length), label: 'Graded answers' },
  ];

  const steps: { title: string; icon: LucideIcon; body: string }[] = [
    {
      title: 'Pick',
      icon: Database,
      body: `Drawn from the public Lichess puzzle database. A fixed seed takes ${uniformCellCount ?? 'the same number of'} puzzles per tactic per rating band, skipping anything longer than three plies.`,
    },
    {
      title: 'Ask',
      icon: MessageSquareText,
      body: 'The model gets the FEN, a text board, the side to move and how many plies to give. The answer must be UCI, like e2e4.',
    },
    {
      title: 'Read',
      icon: ScanText,
      body: 'A bare move line is used as-is. Moves buried in prose are pulled out, and algebraic moves like Qxf7# are converted.',
    },
    {
      title: 'Mark',
      icon: Crosshair,
      body: 'Solved means the line matches Lichess exactly. A close answer, or another winning move, is still wrong.',
    },
  ];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'ChessBench benchmark dataset',
      description: 'Lichess tactics ChessBench uses to test whether a model can play the published solution in UCI.',
      url: toAbsoluteUrl('/methodology'),
      isAccessibleForFree: true,
      keywords: tracks.map((track) => formatTrackLabel(track)),
      creator: { '@type': 'Organization', name: SITE_NAME },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: toAbsoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Methodology', item: toAbsoluteUrl('/methodology') },
      ],
    },
  ];

  return (
    <div className="w-full min-w-0 max-w-[1180px] pb-12" style={{ overflowX: 'clip' }}>
      <StructuredData data={structuredData} />

        {/* Hero */}
        <section className="relative pt-10 pb-10 sm:pt-14">
          <div className="relative">
            <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[46px]">
              How ChessBench scores a model
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7 text-pretty text-[var(--text-secondary)]">
              Every model sees the same Lichess puzzles with the same prompt and gets one try. The moves have to match the
              published solution exactly.
            </p>

            <dl className="mt-10 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-5">
              {facts.map((fact, i) => (
                <div
                  key={fact.label}
                  className={`flex flex-col-reverse gap-1 border-[var(--border-subtle)] px-5 py-4 ${
                    i > 0 ? 'sm:border-l' : ''
                  } ${i % 2 === 1 ? 'border-l sm:border-l' : ''} ${i >= 2 ? 'border-t sm:border-t-0' : ''} ${
                    i === facts.length - 1 ? 'col-span-2 sm:col-span-1' : ''
                  }`}
                >
                  <dt className="text-[12px] text-[var(--text-tertiary)]">{fact.label}</dt>
                  <dd className="font-mono text-[26px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 font-mono text-[11px] break-words text-[var(--text-tertiary)]">
              Dataset {results.datasetId ?? 'unavailable'} · generated {formatDate(results.generatedAt)} UTC
            </p>
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-14">
          <aside className="hidden lg:block">
            <MethodologyToc items={SECTIONS} />
          </aside>

          <div className="min-w-0 pt-4">
            {/* 01 Pipeline */}
            <Section id="pipeline" lede="Four steps, the same for every model and every puzzle.">
              <ol className="grid gap-3 sm:grid-cols-2">
                {steps.map((step) => (
                  <li key={step.title} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="flex items-center gap-3">
                      <IconChip icon={step.icon} />
                      <h3 className="text-[15px] font-semibold">{step.title}</h3>
                    </div>
                    <p className="mt-3 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{step.body}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Panel title="What the model sees" aside={<span className="font-mono text-[11px] text-[var(--text-tertiary)]">mate in 1</span>}>
                  <div className="flex items-center gap-5 px-4 py-4">
                    <pre className="font-mono text-[11.5px] leading-[1.45] text-[var(--text-secondary)]">{`8 . . . . . . k .
7 . . . . . p p p
6 . . . . . . . .
5 . . . . . . . .
4 . . . . . . . .
3 . . . . . . . .
2 . . . . . P P P
1 . . . . R . K .
  a b c d e f g h`}</pre>
                    <div className="min-w-0 space-y-3 text-[12.5px]">
                      <div>
                        <p className="text-[var(--text-tertiary)]">Task</p>
                        <p className="mt-0.5 text-[var(--text-primary)]">White to move, 1 move</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">Expected</p>
                        <p className="mt-0.5 inline-flex rounded-md bg-[var(--success-light)] px-2 py-0.5 font-mono text-[var(--success)]">
                          e1e8
                        </p>
                      </div>
                    </div>
                  </div>
                </Panel>
                <Panel title="How a reply is read">
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {(
                      [
                        ['e1e8', 'Used as-is', true],
                        ['The rook goes e1e8', 'Moves pulled out', true],
                        ['Re8#', 'Converted to e1e8', true],
                        ['(blank)', 'Marked wrong', false],
                      ] as const
                    ).map(([reply, outcome, ok]) => (
                      <li key={reply} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 truncate font-mono text-[12.5px] text-[var(--text-primary)]">{reply}</span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>
                          {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                          {outcome}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </Section>

            {/* 02 Puzzles */}
            <Section
              id="puzzles"
              lede={
                <>
                  {uniformCellCount ? `${uniformCellCount} puzzles in every cell` : 'Puzzles are spread across every cell'}, so
                  each rating band weighs the same. Cells show the share of models that solved them.
                </>
              }
            >
              <Panel>
                <div className="custom-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                        <th scope="col" className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3 font-medium">Tactic</th>
                        {bands.map((band) => (
                          <th key={band} scope="col" className="w-28 border-b border-[var(--border)] px-2 py-3 text-center font-medium normal-case tracking-normal">
                            <span className="font-mono text-[11.5px]">{band.replace('-', '–')}</span>
                          </th>
                        ))}
                        <th scope="col" className="w-28 border-b border-[var(--border)] px-5 py-3 text-right font-medium">All bands</th>
                      </tr>
                    </thead>
                    <tbody>
                      {composition.map((row) => (
                        <tr key={row.track}>
                          <th scope="row" className="sticky left-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-3 text-left font-normal">
                            <div className="flex items-center gap-2">
                              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TRACK_COLOR[row.track] ?? 'var(--text-tertiary)' }} />
                              <span className="font-medium text-[var(--text-primary)]">{formatTrackLabel(row.track)}</span>
                              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                                {row.plies} {row.plies === '1' ? 'ply' : 'plies'}
                              </span>
                            </div>
                            <div className="mt-0.5 hidden pl-4 text-[12px] text-[var(--text-tertiary)] sm:block">{getTrackDescription(row.track)}</div>
                          </th>
                          {row.cells.map((cell, i) => (
                            <td key={bands[i]} className="border-b border-[var(--border-subtle)] p-1">
                              <div
                                className="flex h-11 flex-col items-center justify-center rounded-md font-mono tabular-nums"
                                style={{ background: cell.solved === null ? 'transparent' : heat(cell.solved, heatMin, heatMax) }}
                                title={`${cell.count} puzzles`}
                              >
                                <span className="text-[13px] text-[var(--text-primary)]">
                                  {cell.solved === null ? '—' : `${Math.round(cell.solved)}%`}
                                </span>
                                {!uniformCellCount && <span className="text-[10px] text-[var(--text-tertiary)]">n={cell.count}</span>}
                              </div>
                            </td>
                          ))}
                          <td className="border-b border-[var(--border-subtle)] px-5 py-3">
                            {row.solved === null ? (
                              <span className="block text-right text-[var(--text-tertiary)]">—</span>
                            ) : (
                              <span className="block text-right font-mono font-semibold tabular-nums">{row.solved.toFixed(1)}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="text-[var(--text-secondary)]">
                        <th scope="row" className="sticky left-0 z-10 bg-[var(--surface)] px-5 py-3 text-left text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                          Band average
                        </th>
                        {bandAverages.map((value, i) => (
                          <td key={bands[i]} className="px-2 py-3 text-center font-mono text-[12.5px] tabular-nums">
                            {value === null ? '—' : `${Math.round(value)}%`}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] tabular-nums">
                          {(() => {
                            const all = average(puzzles.map((_, i) => i));
                            return all === null ? '—' : `${all.toFixed(1)}%`;
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
              <p className="mt-3 text-[12.5px] leading-5 text-[var(--text-tertiary)]">
                A ply is one side&apos;s move. Mate in two is three plies: yours, the forced reply, then mate.
              </p>
            </Section>

            {/* 03 Prompt */}
            <Section
              id="prompt"
              lede="One system prompt for every model. The puzzle follows it: FEN, a text board, who moves, the tactic, and how many moves to play."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {settings.map(([label, value, note]) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
                    <div className="text-[12px] text-[var(--text-tertiary)]">{label}</div>
                    <div className="mt-1 font-mono text-[18px] font-semibold text-[var(--text-primary)]">{value}</div>
                    <div className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{note}</div>
                  </div>
                ))}
              </div>
              <Panel
                className="mt-3"
                title="System prompt"
                aside={<CopyButton text={SYSTEM_PROMPT} />}
              >
                <pre className="custom-scrollbar max-h-80 overflow-auto px-5 py-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-[var(--text-secondary)]">
                  {SYSTEM_PROMPT}
                </pre>
              </Panel>
            </Section>

            {/* 04 Replies */}
            <Section
              id="replies"
              lede={`Plenty of answers ignore the format. If the moves are still in there, they're pulled out and scored. ${share(scoredTotal).toFixed(1)}% of replies in this run could be scored.`}
            >
              <Panel>
                <div className="px-5 pt-5 pb-5">
                  <div className="mb-2 flex items-baseline justify-between font-mono text-[11.5px] tabular-nums">
                    <span className="text-[var(--success)]">Scored {share(scoredTotal).toFixed(1)}%</span>
                    <span className="text-[var(--danger)]">Marked wrong {(100 - share(scoredTotal)).toFixed(1)}%</span>
                  </div>
                  <div className="flex h-2.5 w-full gap-1.5" role="img" aria-label={`${share(scoredTotal).toFixed(1)}% of replies scored, the rest marked wrong`}>
                    {[true, false].map((scored) => {
                      const rows = parseRows.filter((r) => r.scored === scored && r.count > 0);
                      const total = rows.reduce((sum, r) => sum + r.count, 0);
                      if (total === 0) return null;
                      return (
                        <div key={String(scored)} className="flex h-full gap-0.5 overflow-hidden rounded-full" style={{ width: `${share(total)}%`, minWidth: 6 }}>
                          {rows.map((row) => (
                            <span key={row.id} className="h-full" style={{ width: `${(row.count / total) * 100}%`, background: row.color, minWidth: 2 }} title={`${row.label}: ${formatInteger(row.count)}`} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid md:grid-cols-2">
                  {[true, false].map((scored) => {
                    const rows = parseRows.filter((r) => r.scored === scored);
                    const total = rows.reduce((sum, r) => sum + r.count, 0);
                    return (
                      <div key={String(scored)} className={`border-t border-[var(--border-subtle)] ${scored ? '' : 'md:border-l'}`}>
                        <div className="flex items-center justify-between px-5 py-3">
                          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: scored ? 'var(--success)' : 'var(--danger)' }}>
                            {scored ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                            {scored ? 'Scored' : 'Marked wrong'}
                          </p>
                          <p className="font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">
                            {formatInteger(total)} · {share(total).toFixed(1)}%
                          </p>
                        </div>
                        <ul>
                          {rows.map((row) => (
                            <li key={row.id} className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
                              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-medium">{row.label}</div>
                                <div className="text-[12px] text-[var(--text-tertiary)]">{row.note}</div>
                              </div>
                              <div className="shrink-0 text-right font-mono tabular-nums">
                                <div className="text-[13px]">{formatInteger(row.count)}</div>
                                <div className="text-[11px] text-[var(--text-tertiary)]">{share(row.count).toFixed(1)}%</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </Section>

            {/* 05 Scoring */}
            <Section id="scoring">
              <ul className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    [Crosshair, 'Exact line', "Has to match Lichess, including the opponent's forced replies on longer puzzles."],
                    [Repeat1, 'One try', 'One request per puzzle. A blank reply or a failed request counts as wrong.'],
                    [Percent, 'Accuracy', `Solved puzzles divided by ${puzzles.length}.${tacticsBalanced ? ' Every tactic has the same number of puzzles, so this is also the average of the tactic scores.' : ''}`],
                    [Coins, 'Cost', 'Tokens and dollars as OpenRouter reported them, summed over the whole run.'],
                  ] as const
                ).map(([icon, title, body]) => (
                  <li key={title} className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <IconChip icon={icon} />
                    <div>
                      <h3 className="text-[15px] font-semibold">{title}</h3>
                      <p className="mt-1 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            {/* 06 Limitations */}
            <Section id="limits" lede="Read the leaderboard with these in mind.">
              <div
                className="rounded-xl border p-5 sm:p-6"
                style={{ borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)', background: 'color-mix(in srgb, var(--warning) 5%, var(--surface))' }}
              >
                <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  {[
                    ['Only one right answer', 'Only the Lichess line counts. Another move that also wins is marked wrong.'],
                    ['Small gaps are noise', `One puzzle is worth about ${(100 / Math.max(1, puzzles.length)).toFixed(1)} points. Gaps smaller than that don't mean much.`],
                    ['Single run', 'Each model was run once. A second run can score differently, even at temperature 0.'],
                    ['Text only', 'The board is sent as text. Models never see a picture of the position.'],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                      <div>
                        <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
                        <p className="mt-0.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            {/* 07 Sources */}
            <Section id="sources">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { href: 'https://database.lichess.org/#puzzles', title: 'Lichess puzzle database', body: 'The positions, and the solutions this benchmark treats as correct.', external: true },
                  { href: 'https://github.com/vorahardik7/chess-bench', title: 'ChessBench on GitHub', body: 'The sampler, the prompt, the parser, and the raw results.', external: true },
                  { href: '/', title: 'Puzzle explorer', body: 'Every answer from every model, one puzzle at a time.', external: false },
                ].map((link) => {
                  const Arrow = link.external ? ArrowUpRight : ArrowRight;
                  const content = (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[15px] font-semibold">{link.title}</span>
                        <Arrow
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                        />
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{link.body}</p>
                    </>
                  );
                  const className =
                    'group block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--surface-raised)]';
                  return link.external ? (
                    <a key={link.title} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                      {content}
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                  ) : (
                    <Link key={link.title} href={link.href} className={className}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </Section>
          </div>
        </div>
    </div>
  );
}
