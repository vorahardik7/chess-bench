import 'server-only';

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import type { ExplorerResults, ModelView, PuzzleAttemptView, PuzzleView } from './results.types';

const DATASET_PATH = path.resolve(process.cwd(), 'src/bench/data/puzzles.json');
const RESULTS_DIR = path.resolve(process.cwd(), 'src/bench/results');

/**
 * Maximum raw-output size (characters) embedded in the initial RSC payload.
 * Longer values are truncated server-side and fetched on demand via the
 * `/api/attempt/[modelId]/[puzzleId]` route, to keep the RSC body under
 * Vercel's 19.07 MB per-response limit. `thinkingText` is always fetched on
 * demand because some runs produce multi-megabyte reasoning traces.
 */
const MAX_INLINE_RAW_OUTPUT_CHARS = 4000;

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
  /** Dataset order (0-based); set by bench runner so UI can match benchmark order without puzzles.json */
  index?: number;
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
  const fullRawOutput = safeString(raw?.rawOutput);
  const rawOutputTruncated = fullRawOutput.length > MAX_INLINE_RAW_OUTPUT_CHARS;
  const rawOutput = rawOutputTruncated
    ? fullRawOutput.slice(0, MAX_INLINE_RAW_OUTPUT_CHARS)
    : fullRawOutput;
  const thinkingChars = typeof raw?.thinkingText === 'string' ? raw.thinkingText.length : 0;
  return {
    puzzleId,
    track,
    expectedLine: safeString(raw?.expectedLine),
    expectedSanLine: typeof raw?.expectedSanLine === 'string' ? raw.expectedSanLine : null,
    parsedLine: raw?.parsedLine ?? null,
    sanLine: typeof raw?.sanLine === 'string' ? raw.sanLine : null,
    rawOutput,
    rawOutputTruncated,
    // Deliberately omit thinkingText from the initial payload; fetched on demand.
    thinkingText: null,
    thinkingChars,
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
    updatedAt: typeof run.createdAt === 'string' ? run.createdAt : null,
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
    marks: '',
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

type LoadedRun = { run: RunFile; filePath: string };

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsonFiles(fullPath);
      return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
    })
  );
  return nested.flat();
}

async function readRunFiles(): Promise<LoadedRun[]> {
  try {
    const files = await collectJsonFiles(RESULTS_DIR);
    const parsed = await Promise.all(
      files.map(async (filePath) => {
        try {
          const raw = await readFile(filePath, 'utf8');
          return { run: JSON.parse(raw) as RunFile, filePath };
        } catch {
          return null;
        }
      })
    );
    const runs = parsed.filter((entry): entry is LoadedRun => Boolean(entry));
    runs.sort((a, b) => {
      const ad = Date.parse(safeString(a.run.createdAt, '1970-01-01T00:00:00.000Z'));
      const bd = Date.parse(safeString(b.run.createdAt, '1970-01-01T00:00:00.000Z'));
      return bd - ad;
    });
    return runs;
  } catch {
    return [];
  }
}

function derivePuzzlesFromRuns(runs: RunFile[]): PuzzleView[] {
  const byId = new Map<string, { puzzle: PuzzleView; index: number }>();
  for (const run of runs) {
    for (const attempt of run.attempts ?? []) {
      const puzzleId = safeString(attempt.puzzleId);
      if (!puzzleId || byId.has(puzzleId)) continue;
      const track = normalizeTrack(safeString(attempt.track));
      const fen = safeString(attempt.currentFen || attempt.sourceFen);
      if (!track || !fen) continue;
      const expectedLine = safeString(attempt.expectedLine);
      const requiredPlies = expectedLine ? expectedLine.trim().split(/\s+/).filter(Boolean).length : 1;
      const index = Math.max(0, Math.trunc(safeNumber(attempt.index, 0)));
      byId.set(puzzleId, {
        index,
        puzzle: {
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
        },
      });
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => {
      const d = a.index - b.index;
      if (d !== 0) return d;
      return a.puzzle.id.localeCompare(b.puzzle.id);
    })
    .map((entry) => entry.puzzle);
}

function selectBestRunPerModel(loaded: LoadedRun[], datasetId: string | null): LoadedRun[] {
  const filteredByDataset = datasetId
    ? loaded.filter((entry) => safeString(entry.run.datasetId) === datasetId)
    : loaded;
  const groups = new Map<string, LoadedRun[]>();
  for (const entry of filteredByDataset) {
    const modelId = safeString(entry.run.modelId);
    if (!modelId) continue;
    const list = groups.get(modelId) ?? [];
    list.push(entry);
    groups.set(modelId, list);
  }

  const selected: LoadedRun[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const ad = Date.parse(safeString(a.run.createdAt, '1970-01-01T00:00:00.000Z'));
      const bd = Date.parse(safeString(b.run.createdAt, '1970-01-01T00:00:00.000Z'));
      return bd - ad;
    });
    selected.push(group[0]);
  }

  selected.sort((a, b) => {
    const aAcc = safeNumber(a.run.summary?.accuracyStrict, 0);
    const bAcc = safeNumber(b.run.summary?.accuracyStrict, 0);
    return bAcc - aAcc;
  });
  return selected;
}

export type AttemptDetail = {
  rawOutput: string;
  thinkingText: string | null;
};

type ResultsCache = {
  signature: string;
  value: ExplorerResults;
  runPathByModelId: Record<string, string>;
};

const globalResults = globalThis as typeof globalThis & {
  __chessBenchResults?: ResultsCache;
};

let inflightLoad: { signature: string; promise: Promise<ExplorerResults> } | null = null;

async function fileStamp(filePath: string): Promise<string> {
  try {
    const info = await stat(filePath);
    return `${filePath}:${info.mtimeMs}:${info.size}`;
  } catch {
    return `${filePath}:missing`;
  }
}

/** Changes when puzzle data, result files, or this loader change. */
async function resultsSignature(): Promise<string> {
  const selfPath = path.resolve(process.cwd(), 'src/app/lib/results.ts');
  let resultFiles: string[] = [];
  try {
    resultFiles = await collectJsonFiles(RESULTS_DIR);
  } catch {
    resultFiles = [];
  }
  resultFiles.sort();
  const stamps = await Promise.all([
    fileStamp(selfPath),
    fileStamp(DATASET_PATH),
    ...resultFiles.map((filePath) => fileStamp(filePath)),
  ]);
  return stamps.join('|');
}

function marksFor(model: ModelView, puzzles: PuzzleView[]): string {
  let marks = '';
  for (const puzzle of puzzles) {
    const attempt = model.attemptsByPuzzleId[puzzle.id];
    marks += !attempt ? '.' : attempt.correctStrict ? '1' : '0';
  }
  return marks;
}

function rememberResults(signature: string, value: ExplorerResults, runPathByModelId: Record<string, string>) {
  globalResults.__chessBenchResults = { signature, value, runPathByModelId };
}

async function loadAndCache(signature: string): Promise<ExplorerResults> {
  const [{ datasetId, generatedAt, puzzles }, loadedRuns] = await Promise.all([
    readDatasetFile(),
    readRunFiles(),
  ]);
  const selectedRuns = selectBestRunPerModel(loadedRuns, datasetId);
  const models = selectedRuns
    .map((entry) => toModelView(entry.run))
    .filter((model): model is ModelView => Boolean(model));
  const fallbackPuzzles = puzzles.length > 0 ? puzzles : derivePuzzlesFromRuns(selectedRuns.map((entry) => entry.run));
  for (const model of models) {
    model.marks = marksFor(model, fallbackPuzzles);
  }
  const runPathByModelId: Record<string, string> = {};
  for (const entry of selectedRuns) {
    const modelId = safeString(entry.run.modelId);
    if (modelId) runPathByModelId[modelId] = entry.filePath;
  }
  const value: ExplorerResults = {
    datasetId,
    generatedAt,
    puzzles: fallbackPuzzles,
    models,
    runCount: selectedRuns.length,
  };
  rememberResults(signature, value, runPathByModelId);
  return value;
}

export const getLatestResults = cache(async (): Promise<ExplorerResults> => {
  const signature = await resultsSignature();
  const hit = globalResults.__chessBenchResults;
  if (hit?.signature === signature) return hit.value;
  if (inflightLoad?.signature === signature) return inflightLoad.promise;
  const promise = loadAndCache(signature);
  inflightLoad = { signature, promise };
  try {
    return await promise;
  } finally {
    if (inflightLoad?.promise === promise) inflightLoad = null;
  }
});

/**
 * Full attempts for one model, served from the in-memory results cache.
 * The explorer page only inlines the top model's attempts; other models load these on selection.
 */
export async function getModelAttempts(
  modelId: string
): Promise<Record<string, PuzzleAttemptView> | null> {
  if (!modelId) return null;
  const results = await getLatestResults();
  const model = results.models.find((entry) => entry.id === modelId);
  return model ? model.attemptsByPuzzleId : null;
}

async function detailFromRunFile(filePath: string, puzzleId: string): Promise<AttemptDetail | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const run = JSON.parse(raw) as RunFile;
    const attempt = (run.attempts ?? []).find((entry) => safeString(entry?.puzzleId) === puzzleId);
    if (!attempt) return null;
    return {
      rawOutput: safeString(attempt.rawOutput),
      thinkingText: typeof attempt.thinkingText === 'string' ? attempt.thinkingText : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the heavy fields (`rawOutput`, `thinkingText`) for a specific
 * (modelId, puzzleId) pair by re-reading that model's run file. These are
 * stripped / truncated from the initial RSC payload to stay under Vercel's
 * response-size limit, so the UI requests them only when the user opens the
 * corresponding panel.
 */
export async function getAttemptDetail(
  modelId: string,
  puzzleId: string
): Promise<AttemptDetail | null> {
  if (!modelId || !puzzleId) return null;
  await getLatestResults();
  const filePath = globalResults.__chessBenchResults?.runPathByModelId[modelId];
  if (!filePath) return null;
  return detailFromRunFile(filePath, puzzleId);
}

export const getModelById = cache(async (modelId: string): Promise<ModelView | null> => {
  const results = await getLatestResults();
  return results.models.find((model) => model.id === modelId) ?? null;
});
