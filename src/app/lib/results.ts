import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExplorerResults, ModelView, PuzzleAttemptView, PuzzleView } from './results.types';

const DATASET_PATH = path.resolve(process.cwd(), 'src/bench/data/puzzles.json');
const RESULTS_DIR = path.resolve(process.cwd(), 'src/bench/results');

type DatasetFile = {
  datasetId?: string;
  generatedAt?: string;
  puzzles?: DatasetPuzzleRow[];
};

type DatasetPuzzleRow = {
  puzzleId?: string;
  track?: string;
  fen?: string;
  requiredPlies?: number;
  rating?: number | null;
  ratingBucket?: string | null;
  expectedLine?: string;
  initialMove?: string;
  puzzleUrl?: string;
  gameUrl?: string;
};

type RunAttempt = {
  puzzleId?: string;
  track?: string;
  ratingBucket?: string;
  sourceFen?: string;
  currentFen?: string;
  initialMove?: string;
  expectedLine?: string;
  expectedSanLine?: string | null;
  parsedLine?: string | null;
  sanLine?: string | null;
  rawOutput?: string;
  thinkingText?: string | null;
  parseStatus?: string;
  formatValid?: boolean;
  correctStrict?: boolean;
  latencyMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
};

type RunFile = {
  runId?: string;
  createdAt?: string;
  datasetId?: string;
  modelId?: string;
  modelName?: string;
  benchmarkLabel?: string | null;
  summary?: {
    total?: number;
    parsed?: number;
    sanConverted?: number;
    correctStrict?: number;
    accuracyStrict?: number;
    accuracyParsed?: number;
    totalCost?: number;
    totalPromptTokens?: number;
    totalCompletionTokens?: number;
    totalReasoningTokens?: number;
  };
  attempts?: RunAttempt[];
};

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTrack(track: string): string {
  if (track === 'mate1') return 'mateIn1';
  if (track === 'mate2') return 'mateIn2';
  return track;
}

function modelDisplayName(run: RunFile, modelId: string): string {
  const explicitName = safeString(run.modelName);
  if (explicitName) return explicitName;
  return modelId;
}

function toPuzzleView(raw: DatasetPuzzleRow): PuzzleView | null {
  const id = safeString(raw?.puzzleId);
  const track = normalizeTrack(safeString(raw?.track));
  const fen = safeString(raw?.fen);
  const expectedLine = safeString(raw?.expectedLine);
  if (!id || !track || !fen) return null;
  return {
    id,
    level: track,
    fen,
    requiredPlies: Math.max(1, Math.trunc(safeNumber(raw?.requiredPlies, 1))),
    rating: typeof raw?.rating === 'number' ? raw.rating : null,
    ratingBucket: raw?.ratingBucket ?? null,
    expectedLine,
    initialMove: safeString(raw?.initialMove),
    source: {
      url: safeString(raw?.puzzleUrl),
      gameUrl: safeString(raw?.gameUrl),
    },
  };
}

function toAttemptView(raw: RunAttempt): PuzzleAttemptView | null {
  const puzzleId = safeString(raw?.puzzleId);
  const track = normalizeTrack(safeString(raw?.track));
  if (!puzzleId) return null;
  const promptTokens = Math.max(0, Math.trunc(safeNumber(raw?.usage?.promptTokens)));
  const completionTokens = Math.max(0, Math.trunc(safeNumber(raw?.usage?.completionTokens)));
  const reasoningTokens = Math.max(0, Math.trunc(safeNumber(raw?.usage?.reasoningTokens)));
  const totalTokens = Math.max(
    0,
    Math.trunc(safeNumber(raw?.usage?.totalTokens, promptTokens + completionTokens))
  );
  return {
    puzzleId,
    track,
    expectedLine: safeString(raw?.expectedLine),
    expectedSanLine: typeof raw?.expectedSanLine === 'string' ? raw.expectedSanLine : null,
    parsedLine: raw?.parsedLine ?? null,
    sanLine: typeof raw?.sanLine === 'string' ? raw.sanLine : null,
    rawOutput: safeString(raw?.rawOutput),
    thinkingText: typeof raw?.thinkingText === 'string' ? raw.thinkingText : null,
    parseStatus: safeString(raw?.parseStatus, 'missing'),
    formatValid: safeBool(raw?.formatValid, false),
    correctStrict: safeBool(raw?.correctStrict, false),
    latencyMs: safeNumber(raw?.latencyMs, 0),
    usage: {
      promptTokens,
      completionTokens,
      reasoningTokens,
      totalTokens,
      cost: safeNumber(raw?.usage?.cost, 0),
    },
  };
}

function toModelView(run: RunFile): ModelView | null {
  const modelId = safeString(run?.modelId);
  if (!modelId) return null;
  const attempts = (run?.attempts ?? []).map(toAttemptView).filter((a): a is PuzzleAttemptView => Boolean(a));
  const attemptsByPuzzleId: Record<string, PuzzleAttemptView> = {};
  const trackRollup = new Map<string, { correct: number; total: number }>();
  let correct = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalReasoningTokens = 0;
  let totalCost = 0;

  for (const attempt of attempts) {
    attemptsByPuzzleId[attempt.puzzleId] = attempt;
    if (attempt.correctStrict) correct += 1;
    totalPromptTokens += attempt.usage.promptTokens;
    totalCompletionTokens += attempt.usage.completionTokens;
    totalReasoningTokens += attempt.usage.reasoningTokens;
    totalCost += attempt.usage.cost;
    const key = attempt.track || 'unknown';
    const bucket = trackRollup.get(key) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (attempt.correctStrict) bucket.correct += 1;
    trackRollup.set(key, bucket);
  }

  const total = attempts.length;
  const accuracy = total === 0 ? 0 : correct / total;
  const breakdown: Record<string, number> = {};
  for (const [track, values] of trackRollup.entries()) {
    breakdown[track] = values.total === 0 ? 0 : Number(((values.correct / values.total) * 100).toFixed(1));
  }

  const summary = run.summary;
  const benchmarkLabel = run.benchmarkLabel ?? null;
  return {
    id: modelId,
    name: modelDisplayName(run, modelId),
    sublabel: benchmarkLabel ?? undefined,
    benchmarkLabel,
    score: Number((((safeNumber(summary?.accuracyStrict, accuracy)) * 100)).toFixed(1)),
    breakdown,
    summary: {
      total: Math.max(0, Math.trunc(safeNumber(summary?.total, total))),
      correct: Math.max(0, Math.trunc(safeNumber(summary?.correctStrict, correct))),
      accuracy: safeNumber(summary?.accuracyStrict, accuracy),
      totalCost: safeNumber(summary?.totalCost, totalCost),
      totalPromptTokens: Math.max(0, Math.trunc(safeNumber(summary?.totalPromptTokens, totalPromptTokens))),
      totalCompletionTokens: Math.max(0, Math.trunc(safeNumber(summary?.totalCompletionTokens, totalCompletionTokens))),
      totalReasoningTokens: Math.max(0, Math.trunc(safeNumber(summary?.totalReasoningTokens, totalReasoningTokens))),
    },
    attemptsByPuzzleId,
  };
}

async function readDatasetFile(): Promise<{ datasetId: string | null; generatedAt: string | null; puzzles: PuzzleView[] }> {
  try {
    const raw = await readFile(DATASET_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DatasetFile;
    const puzzles = (parsed.puzzles ?? []).map(toPuzzleView).filter((p): p is PuzzleView => Boolean(p));
    return {
      datasetId: typeof parsed.datasetId === 'string' ? parsed.datasetId : null,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null,
      puzzles,
    };
  } catch {
    return { datasetId: null, generatedAt: null, puzzles: [] };
  }
}

async function readRunFiles(): Promise<RunFile[]> {
  async function collectJsonFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return collectJsonFiles(fullPath);
        }
        return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
      })
    );
    return nested.flat();
  }

  try {
    const files = await collectJsonFiles(RESULTS_DIR);
    const parsed = await Promise.all(
      files.map(async (file) => {
        try {
          const raw = await readFile(file, 'utf8');
          return JSON.parse(raw) as RunFile;
        } catch {
          return null;
        }
      })
    );
    const runs = parsed.filter((run): run is RunFile => Boolean(run));
    runs.sort((a, b) => {
      const ad = Date.parse(safeString(a.createdAt, '1970-01-01T00:00:00.000Z'));
      const bd = Date.parse(safeString(b.createdAt, '1970-01-01T00:00:00.000Z'));
      return bd - ad;
    });
    return runs;
  } catch {
    return [];
  }
}

function derivePuzzlesFromRuns(runs: RunFile[]): PuzzleView[] {
  const byId = new Map<string, PuzzleView>();
  for (const run of runs) {
    for (const attempt of run.attempts ?? []) {
      const puzzleId = safeString(attempt.puzzleId);
      if (!puzzleId || byId.has(puzzleId)) continue;
      const track = normalizeTrack(safeString(attempt.track));
      const fen = safeString(attempt.currentFen || attempt.sourceFen);
      if (!track || !fen) continue;
      const expectedLine = safeString(attempt.expectedLine);
      const requiredPlies = expectedLine ? expectedLine.trim().split(/\s+/).filter(Boolean).length : 1;
      byId.set(puzzleId, {
        id: puzzleId,
        level: track,
        fen,
        requiredPlies: Math.max(1, requiredPlies),
        rating: null,
        ratingBucket: safeString(attempt.ratingBucket) || null,
        expectedLine,
        initialMove: safeString(attempt.initialMove),
        source: {
          url: `https://lichess.org/training/${puzzleId}`,
        },
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function selectBestRunPerModel(runs: RunFile[], datasetId: string | null): RunFile[] {
  const filteredByDataset = datasetId
    ? runs.filter((run) => safeString(run.datasetId) === datasetId)
    : runs;
  const groups = new Map<string, RunFile[]>();
  for (const run of filteredByDataset) {
    const modelId = safeString(run.modelId);
    if (!modelId) continue;
    const list = groups.get(modelId) ?? [];
    list.push(run);
    groups.set(modelId, list);
  }

  const selected: RunFile[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const ad = Date.parse(safeString(a.createdAt, '1970-01-01T00:00:00.000Z'));
      const bd = Date.parse(safeString(b.createdAt, '1970-01-01T00:00:00.000Z'));
      return bd - ad;
    });
    selected.push(group[0]);
  }

  selected.sort((a, b) => {
    const aAcc = safeNumber(a.summary?.accuracyStrict, 0);
    const bAcc = safeNumber(b.summary?.accuracyStrict, 0);
    return bAcc - aAcc;
  });
  return selected;
}

export async function getLatestResults(): Promise<ExplorerResults> {
  const [{ datasetId, generatedAt, puzzles }, runs] = await Promise.all([
    readDatasetFile(),
    readRunFiles(),
  ]);
  const selectedRuns = selectBestRunPerModel(runs, datasetId);
  const models = selectedRuns
    .map(toModelView)
    .filter((model): model is ModelView => Boolean(model));
  const fallbackPuzzles = puzzles.length > 0 ? puzzles : derivePuzzlesFromRuns(selectedRuns);
  return {
    datasetId,
    generatedAt,
    puzzles: fallbackPuzzles,
    models,
    runCount: selectedRuns.length,
  };
}
