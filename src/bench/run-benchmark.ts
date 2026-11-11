#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

/**
 * Benchmark harness v2: Lichess-style puzzle solving.
 *
 * For each puzzle the model sees the position after the opponent's setup move and
 * answers with ONE move. A correct move (or any checkmate) is followed by the
 * opponent's reply from the stored Lichess solution and the model is asked for its
 * next move, until the solution is complete. A puzzle is solved only if every move
 * the model plays is correct. See scoring.ts for the exact move rules.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import OpenAI from "openai";
import { envString, envTrimmed, loadBenchEnv } from "./env";
import { buildFirstTurnPrompt, buildFollowUpPrompt, SYSTEM_PROMPT } from "./prompt";
import {
  judgeMove,
  normalizeLine,
  parseMoveOutput,
  playMove,
  summarizeAttempts,
  uciToSan,
  UNPARSED_STATUSES,
} from "./scoring";
import benchConfig from "./config";

// Bump when anything that affects scores changes (prompt, parsing, grading, protocol).
const HARNESS_VERSION = 2;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const SAKANA_BASE_URL = "https://api.sakana.ai/v1";
const DATASET_PATH = path.resolve(process.cwd(), "src/bench/data/puzzles.json");
// v1 results (single-shot full-line answers) stay in src/bench/results and in the
// `bench-v1` git tag. v2 results are kept apart so the two are never mixed.
const RESULTS_DIR = path.resolve(process.cwd(), "src/bench/results-v2");
const HARNESS_FILES = ["src/bench/run-benchmark.ts", "src/bench/prompt.ts", "src/bench/scoring.ts"];
// One output cap for every reasoning effort and every turn. On OpenRouter, reasoning
// tokens count against max_tokens, and for Anthropic models the thinking budget is a
// fixed share of it (medium 50%, high 80%, xhigh/max 95%). Too small a cap cuts models
// off mid-thought (empty answer, scored as wrong) and hits higher efforts hardest.
// Keep it identical across runs you compare; override via config.maxTokens.
const DEFAULT_MAX_TOKENS_REASONING = 32768;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_REQUEST_TIMEOUT_MS = 600000;
const REASONING_EFFORT = "medium";
const RETRIES = 4;
const RETRY_BASE_MS = 2000;
const MAX_RETRY_WAIT_MS = 120000;
const FATAL_STATUSES = [400, 401, 402, 403, 404];
const CONCURRENCY = 10;
const IN_PROGRESS_SUFFIX = ".in-progress.tmp";

const API_PROVIDERS = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: OPENROUTER_BASE_URL,
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultReasoningEffort: REASONING_EFFORT,
    defaultSupportedParams: null,
    supportsGenerationCost: true,
    supportsModelMetadata: true,
  },
  sakana: {
    id: "sakana",
    label: "Sakana API",
    baseURL: SAKANA_BASE_URL,
    apiKeyEnv: "SAKANA_API_KEY",
    defaultReasoningEffort: "high",
    defaultSupportedParams: ["max_tokens", "reasoning"],
    supportsGenerationCost: false,
    supportsModelMetadata: false,
  },
};

let apiKey = "";
let apiBaseURL = "";
let apiClient = null;
let apiProvider = API_PROVIDERS.openrouter;
let modelId = "";
let baseModelId = "";
let variantId = "";
let apiModelId = "";
let modelName = "";
let modelInfo = null;
let reasoningEffort = REASONING_EFFORT;
let useReasoning = false;
let maxTokens = DEFAULT_MAX_TOKENS_REASONING;
let temperature = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toInt(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeModelId(id) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "__");
}

function resolveResultsModelId(baseId, variant) {
  const base = String(baseId || "").trim();
  const suffix = String(variant || "").trim();
  if (!base) return "";
  return suffix ? `${base}-${suffix}` : base;
}

function inProgressPath(modelResultsDir, datasetId) {
  return path.join(modelResultsDir, `${sanitizeModelId(datasetId || "unknown")}${IN_PROGRESS_SUFFIX}`);
}

function resolveApiProvider(providerId) {
  const normalized = String(providerId || "openrouter").trim().toLowerCase();
  const provider = API_PROVIDERS[normalized];
  assert(provider, `Unsupported benchmark API provider "${providerId}". Use "openrouter" or "sakana".`);
  return provider;
}

function hashShort(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Provenance: what exactly produced a run.

async function harnessHash() {
  const hash = createHash("sha256");
  for (const file of HARNESS_FILES) {
    hash.update(file);
    hash.update(await readFile(path.resolve(process.cwd(), file), "utf8"));
  }
  return hash.digest("hex").slice(0, 12);
}

function gitInfo() {
  try {
    const commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty =
      execSync(`git status --porcelain -- ${HARNESS_FILES.join(" ")} src/bench/data/puzzles.json`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim().length > 0;
    return { commit, harnessFilesDirty: dirty };
  } catch {
    return { commit: null, harnessFilesDirty: null };
  }
}

// ---------------------------------------------------------------------------
// Response extraction.

function extractMessageText(messageContent) {
  if (typeof messageContent === "string") return messageContent;
  if (!Array.isArray(messageContent)) return "";
  const pieces = [];
  for (const part of messageContent) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string") pieces.push(part.text);
    if (part.type === "output_text" && typeof part.output_text === "string") {
      pieces.push(part.output_text);
    }
  }
  return pieces.join("\n").trim();
}

function extractReasoningFromDetails(details) {
  if (!Array.isArray(details) || details.length === 0) return null;
  const parts = [];
  for (const item of details) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "reasoning.text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item.type === "reasoning.summary" && typeof item.summary === "string") {
      parts.push(item.summary);
    }
  }
  return parts.length > 0 ? parts.join("\n").trim() : null;
}

function extractApiReasoning(choice) {
  const detailsText = extractReasoningFromDetails(choice?.message?.reasoning_details);
  if (detailsText) return detailsText;
  const candidates = [
    choice?.message?.reasoning,
    choice?.message?.reasoning_content,
    choice?.message?.analysis,
    choice?.reasoning,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const text = candidate
        .map((item) => (typeof item === "string" ? item : typeof item?.text === "string" ? item.text : ""))
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function extractUsage(resp) {
  const usage = resp?.usage ?? {};
  const promptTokens = toInt(usage.prompt_tokens, 0);
  const completionTokens = toInt(usage.completion_tokens, 0);
  const reasoningTokens = toInt(usage?.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens, 0);
  const totalTokens = toInt(usage.total_tokens, promptTokens + completionTokens);
  // For BYOK, OpenRouter reports the provider-billed amount in cost_details.upstream_inference_cost;
  // usage.cost is what was charged to OpenRouter credits (0 or just the BYOK fee).
  const upstreamInferenceCost = finiteNumberOrNull(usage?.cost_details?.upstream_inference_cost);
  const cost = upstreamInferenceCost ?? toNumber(usage.cost, 0);
  return { promptTokens, completionTokens, reasoningTokens, totalTokens, cost };
}

async function fetchGenerationCost(generationId) {
  if (!apiProvider.supportsGenerationCost) return 0;
  try {
    const res = await fetch(`${apiBaseURL}/generation?id=${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return finiteNumberOrNull(json?.data?.upstream_inference_cost) ?? toNumber(json?.data?.total_cost, 0);
  } catch {
    return 0;
  }
}

async function extractUsageWithCost(response) {
  const usage = extractUsage(response);
  if (usage.cost === 0 && response?.id) usage.cost = await fetchGenerationCost(response.id);
  return usage;
}

function addUsage(total, extra) {
  total.promptTokens += extra.promptTokens;
  total.completionTokens += extra.completionTokens;
  total.reasoningTokens += extra.reasoningTokens;
  total.totalTokens += extra.totalTokens;
  total.cost += extra.cost;
}

// ---------------------------------------------------------------------------
// Model metadata and request construction.

async function loadModelInfo(id) {
  if (Array.isArray(benchConfig.supportedParams)) {
    return { supportedParams: new Set(benchConfig.supportedParams), source: "config" };
  }
  if (!apiProvider.supportsModelMetadata) {
    return { supportedParams: new Set(apiProvider.defaultSupportedParams ?? []), source: "provider-default" };
  }

  let rows;
  try {
    const headers = { Accept: "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${apiBaseURL}/models`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const body = await res.json();
    rows = Array.isArray(body?.data) ? body.data : [];
  } catch (error) {
    throw new Error(
      `Model metadata lookup failed (${error instanceof Error ? error.message : String(error)}). Set supportedParams in config.ts to skip it.`
    );
  }

  // Without metadata we can't tell whether to send `reasoning`, and silently running
  // without it produces a misleading score.
  const row = rows.find((m) => m?.id === id);
  assert(row, `Model "${id}" not found in ${apiProvider.label} /models. Check the slug, or set supportedParams in config.ts.`);
  return {
    supportedParams: new Set(Array.isArray(row.supported_parameters) ? row.supported_parameters : []),
    canonicalSlug: row.canonical_slug ?? null,
    supportedEfforts: Array.isArray(row.reasoning?.supported_efforts) ? row.reasoning.supported_efforts : null,
    defaultEffort: row.reasoning?.default_effort ?? null,
    maxCompletionTokens: finiteNumberOrNull(row.top_provider?.max_completion_tokens),
    pricing: listPricing(row.pricing),
    source: "models-endpoint",
  };
}

/**
 * The model's standard per-token price from /models. The site prices every run as tokens x this
 * rate, so runs routed to a discounted endpoint (or billed via BYOK) compare fairly with the rest.
 * The amount actually billed stays in usage.cost.
 */
function listPricing(pricing) {
  const prompt = Number(pricing?.prompt);
  const completion = Number(pricing?.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) return null;
  return { prompt, completion, source: "openrouter-models", fetchedAt: new Date().toISOString() };
}

function costAtListPrice(usage, pricing) {
  if (!pricing) return null;
  return usage.promptTokens * pricing.prompt + usage.completionTokens * pricing.completion;
}

function buildRequest(messages) {
  const body = { model: apiModelId, messages, max_tokens: maxTokens };
  if (apiProvider.id === "openrouter") {
    body.provider = {
      allow_fallbacks: false,
      ...(benchConfig.providerOrder ? { order: benchConfig.providerOrder } : {}),
    };
  }
  // Sampling parameters are left at provider defaults unless explicitly configured:
  // OpenAI/Anthropic reasoning models reject them, and Google documents them as
  // ignored (and future-400) for current Gemini models, so forcing temperature 0
  // would only apply to some vendors.
  if (temperature !== null) body.temperature = temperature;
  if (useReasoning) body.reasoning = { effort: reasoningEffort };
  return body;
}

function apiErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 0;
}

function apiErrorBody(error) {
  const body = error?.error ?? error?.body ?? error?.response?.data;
  if (!body) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function retryAfterMs(error) {
  const headers = error?.headers;
  const raw = typeof headers?.get === "function" ? headers.get("retry-after") : headers?.["retry-after"];
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * OpenRouter can answer HTTP 200 with an error instead of a completion: a top-level
 * `error`, a choice with `error` / finish_reason "error", or an empty choice with zero
 * usage. These are provider failures, not model answers, so they are retried.
 */
function assertUsableCompletion(response) {
  const choice = response?.choices?.[0];
  const providerError = response?.error ?? choice?.error;
  let reason = null;
  if (providerError) reason = providerError.message ?? JSON.stringify(providerError);
  else if (!choice) reason = "response has no choices";
  else if (choice.finish_reason === "error") reason = `finish_reason "error" (native: ${choice.native_finish_reason ?? "n/a"})`;
  else if (!extractMessageText(choice.message?.content) && toInt(response?.usage?.completion_tokens, 0) === 0) {
    reason = "empty completion with zero completion tokens";
  }
  if (reason) {
    const error = new Error(`Provider returned an unusable completion: ${reason}`);
    error.status = 0; // retryable
    throw error;
  }
}

async function postCompletion(body) {
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await apiClient.chat.completions.create(body);
      assertUsableCompletion(response);
      return response;
    } catch (error) {
      const status = apiErrorStatus(error);
      const retryable = status === 0 || [408, 409, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === RETRIES) {
        const bodyText = apiErrorBody(error);
        const detail = bodyText ? `. Body: ${bodyText.slice(0, 400)}` : "";
        const wrapped = new Error(
          `${apiProvider.label} error ${status || "unknown"}: ${error instanceof Error ? error.message : String(error)}${detail}`
        );
        // Bad request / auth / credits / unknown model fail the same way for every
        // puzzle, so stop the run instead of recording 150 request errors.
        wrapped.fatal = FATAL_STATUSES.includes(status);
        throw wrapped;
      }
      const backoff = RETRY_BASE_MS * 2 ** attempt * (0.75 + Math.random() * 0.5);
      await delay(Math.min(MAX_RETRY_WAIT_MS, retryAfterMs(error) ?? backoff));
    }
  }
  throw new Error("Unreachable retry state.");
}

// ---------------------------------------------------------------------------
// Puzzle presentation.

function renderAsciiBoard(chess) {
  const lines = chess.board().map((row, i) => {
    const cells = row.map((sq) => (sq ? (sq.color === "w" ? sq.type.toUpperCase() : sq.type) : "."));
    return `${8 - i} ${cells.join(" ")}`;
  });
  lines.push("  a b c d e f g h");
  return lines.join("\n");
}

function positionView(fen) {
  const chess = new Chess(fen);
  return {
    fen,
    sideToMove: chess.turn() === "w" ? "White" : "Black",
    boardAscii: renderAsciiBoard(chess),
  };
}

function formatTrackLabel(track) {
  if (track === "mateIn1" || track === "mate1") return "Mate in 1";
  if (track === "mateIn2" || track === "mate2") return "Mate in 2";
  if (track === "hangingPiece") return "Hanging Piece";
  return String(track)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function taskDescription(track, revealTheme) {
  if (revealTheme && (track === "mateIn1" || track === "mate1")) return "Find the move that checkmates immediately.";
  if (revealTheme && (track === "mateIn2" || track === "mate2")) return "Find the forced checkmate in two moves.";
  return "Find the best move.";
}

/** Position the model starts from: the stored FEN after the opponent's setup move. */
function puzzleStart(puzzle) {
  const played = playMove(puzzle.fen, puzzle.initialMove);
  assert(played, `Puzzle ${puzzle.puzzleId}: setup move ${puzzle.initialMove} is illegal in ${puzzle.fen}.`);
  const solution = normalizeLine(puzzle.expectedLine).split(" ");
  // Validate the whole stored solution up front so a data error can't masquerade as a model miss.
  let fen = played.chess.fen();
  const sanLine = [];
  for (const move of solution) {
    const step = playMove(fen, move);
    assert(step, `Puzzle ${puzzle.puzzleId}: stored solution move ${move} is illegal.`);
    sanLine.push(step.san);
    fen = step.chess.fen();
  }
  return { fen: played.chess.fen(), lastMoveUci: puzzle.initialMove, lastMoveSan: played.san, solution, expectedSanLine: sanLine.join(" ") };
}

// ---------------------------------------------------------------------------
// Solving one puzzle.

function attemptParseStatus(turns) {
  const last = turns[turns.length - 1];
  if (last && !last.correct) {
    if (UNPARSED_STATUSES.has(last.parseStatus)) return last.parseStatus;
    if (!last.legal) return "illegal_move";
  }
  return turns.find((t) => t.parseStatus !== "ok")?.parseStatus ?? "ok";
}

function joinTurns(turns, key) {
  const parts = turns.map((t) => t[key]).filter((v) => typeof v === "string" && v.length > 0);
  if (parts.length === 0) return null;
  if (turns.length === 1) return parts[0];
  return turns
    .filter((t) => typeof t[key] === "string" && t[key].length > 0)
    .map((t) => `[Turn ${t.turn}]\n${t[key]}`)
    .join("\n\n");
}

function solvePuzzle(puzzle, index, total, revealTheme) {
  const start = puzzleStart(puzzle);
  const view = positionView(start.fen);
  const firstPrompt = buildFirstTurnPrompt({
    trackLabel: revealTheme ? formatTrackLabel(puzzle.track) : null,
    taskDescription: taskDescription(puzzle.track, revealTheme),
    playerSide: view.sideToMove,
    lastMoveUci: start.lastMoveUci,
    lastMoveSan: start.lastMoveSan,
    position: view,
  });

  const base = {
    index,
    puzzleId: puzzle.puzzleId,
    track: puzzle.track,
    ratingBucket: puzzle.ratingBucket,
    sourceFen: puzzle.fen,
    initialMove: puzzle.initialMove,
    currentFen: start.fen,
    sideToMove: view.sideToMove,
    expectedLine: start.solution.join(" "),
    expectedSanLine: start.expectedSanLine,
  };

  return async () => {
    const started = Date.now();
    const usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0 };
    const turns = [];
    const playedLine = [];
    const thinking = [];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: firstPrompt },
    ];

    try {
      let fen = start.fen;
      let solved = false;
      let matchType = null;

      for (let ply = 0; ply < start.solution.length; ply += 2) {
        const turnStarted = Date.now();
        const response = await postCompletion(buildRequest(messages));
        const choice = response.choices[0];
        const rawOutput = extractMessageText(choice?.message?.content);
        const turnUsage = await extractUsageWithCost(response);
        addUsage(usage, turnUsage);

        const parsed = parseMoveOutput(rawOutput, fen);
        const finishReason = choice?.finish_reason ?? null;
        // Hitting max_tokens is a harness limit, not a format failure.
        const parseStatus = !parsed.move && finishReason === "length" ? "truncated" : parsed.parseStatus;
        const expected = start.solution[ply];
        const judged = judgeMove(fen, parsed.move, expected);

        turns.push({
          turn: turns.length + 1,
          fen,
          prompt: messages[messages.length - 1].content,
          rawOutput,
          parsedMove: parsed.move,
          move: judged.move,
          san: judged.san,
          expectedMove: expected,
          parseStatus,
          formatValid: parsed.formatValid,
          legal: judged.legal,
          correct: judged.correct,
          matchType: judged.matchType,
          finishReason,
          nativeFinishReason: choice?.native_finish_reason ?? null,
          servedModel: response.model ?? null,
          servedProvider: response.provider ?? null,
          generationId: response.id ?? null,
          latencyMs: Date.now() - turnStarted,
          usage: turnUsage,
        });
        // Reasoning is stored once, on the attempt (joined per turn), to keep result files small.
        thinking.push({ turn: turns.length, thinkingText: extractApiReasoning(choice) });
        if (judged.legal) playedLine.push(judged.move);

        if (!judged.correct) break;
        if (judged.matchType === "checkmate" || ply + 1 >= start.solution.length) {
          solved = true;
          matchType = turns.some((t) => t.matchType === "checkmate") ? "checkmate" : "exact";
          break;
        }

        // Correct, puzzle continues: play the stored opponent reply and ask for the next move.
        const reply = start.solution[ply + 1];
        const afterReply = playMove(judged.fenAfter, reply);
        playedLine.push(afterReply.uci);
        fen = afterReply.chess.fen();
        messages.push({ role: "assistant", content: rawOutput });
        messages.push({
          role: "user",
          content: buildFollowUpPrompt({ replyUci: reply, replySan: afterReply.san, position: positionView(fen) }),
        });
      }

      const last = turns[turns.length - 1];
      const parsedLine = playedLine.length > 0 ? playedLine.join(" ") : null;
      const result = {
        ...base,
        rawOutput: joinTurns(turns, "rawOutput") ?? "",
        parsedLine,
        sanLine: parsedLine ? sanOfLine(start.fen, playedLine) : null,
        parseStatus: attemptParseStatus(turns),
        formatValid: turns.every((t) => t.formatValid),
        correctStrict: solved,
        matchType,
        firstMoveCorrect: turns[0].correct,
        illegalMove: turns.some((t) => t.parsedMove && !t.legal),
        failedAtTurn: solved ? null : last.turn,
        finishReason: last.finishReason,
        thinkingText: joinTurns(thinking, "thinkingText"),
        latencyMs: Date.now() - started,
        usage,
        responseError: null,
        turns,
      };
      const note = result.parseStatus === "ok" ? "" : ` (${result.parseStatus})`;
      console.log(
        `[${index + 1}/${total}] ${puzzle.puzzleId} ${puzzle.track} ${puzzle.ratingBucket} -> ${solved ? "OK" : `MISS at turn ${last.turn}`}${note}`
      );
      return result;
    } catch (error) {
      if (error?.fatal) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${index + 1}/${total}] ${puzzle.puzzleId} failed: ${message}`);
      return {
        ...base,
        rawOutput: "",
        parsedLine: null,
        sanLine: null,
        parseStatus: "request_error",
        formatValid: false,
        correctStrict: false,
        matchType: null,
        firstMoveCorrect: false,
        illegalMove: false,
        failedAtTurn: turns.length + 1,
        finishReason: null,
        thinkingText: null,
        latencyMs: Date.now() - started,
        usage,
        responseError: { message },
        turns,
      };
    }
  };
}

function sanOfLine(fen, moves) {
  const san = [];
  let current = fen;
  for (const move of moves) {
    const step = playMove(current, move);
    if (!step) break;
    san.push(step.san);
    current = step.chess.fen();
  }
  return san.join(" ");
}

// ---------------------------------------------------------------------------
// Run orchestration.

function sortAttemptsByIndex(attempts) {
  return [...attempts].sort((a, b) => toInt(a?.index, 0) - toInt(b?.index, 0));
}

function dedupeAttemptsByPuzzle(attempts) {
  const byPuzzleId = new Map();
  for (const attempt of attempts) {
    if (attempt?.puzzleId) byPuzzleId.set(attempt.puzzleId, attempt);
  }
  return sortAttemptsByIndex(Array.from(byPuzzleId.values()));
}

async function readInProgressCheckpoint(filePath, { modelId: id, datasetId }) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.modelId !== id || parsed.datasetId !== datasetId) return null;
    return {
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null,
      config: parsed.config && typeof parsed.config === "object" ? parsed.config : null,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
    };
  } catch {
    return null;
  }
}

async function runPool(tasks, concurrency, onTaskCompleted) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex;
      nextIndex += 1;
      const result = await tasks[i]();
      await onTaskCompleted(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

async function main() {
  assert(apiKey, `Missing ${apiProvider.apiKeyEnv}.`);
  assert(modelId, "Missing BENCH_MODEL_ID.");
  assert(apiModelId, "Missing API model id.");
  apiClient = new OpenAI({
    apiKey,
    baseURL: apiBaseURL,
    maxRetries: 0,
    timeout: benchConfig.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  });

  modelInfo = await loadModelInfo(apiModelId);
  useReasoning = modelInfo.supportedParams.has("reasoning");
  maxTokens = benchConfig.maxTokens ?? (useReasoning ? DEFAULT_MAX_TOKENS_REASONING : DEFAULT_MAX_TOKENS);
  assert(Number.isInteger(maxTokens) && maxTokens > 0, "maxTokens must be a positive integer.");
  if (modelInfo.maxCompletionTokens) {
    assert(
      maxTokens <= modelInfo.maxCompletionTokens,
      `maxTokens=${maxTokens} exceeds ${apiModelId}'s max completion tokens (${modelInfo.maxCompletionTokens}). Lower maxTokens in config.ts (keep it the same for runs you compare).`
    );
  }
  if (useReasoning && modelInfo.supportedEfforts) {
    // OpenRouter maps unsupported efforts down (e.g. xhigh -> high for Gemini), which
    // would publish a "xhigh" result that really ran at "high".
    assert(
      modelInfo.supportedEfforts.includes(reasoningEffort),
      `Reasoning effort "${reasoningEffort}" is not supported by ${apiModelId} (supported: ${modelInfo.supportedEfforts.join(", ")}).`
    );
  }
  if (benchConfig.temperature !== undefined) {
    assert(
      modelInfo.supportedParams.has("temperature"),
      `${apiModelId} does not support temperature; remove it from config.ts.`
    );
    temperature = benchConfig.temperature;
  }
  const revealTheme = benchConfig.revealTheme ?? true;

  console.log(`Reasoning: ${useReasoning ? `effort="${reasoningEffort}"` : "not supported by model"}, max_tokens=${maxTokens}`);
  console.log(`Temperature: ${temperature === null ? "provider default" : temperature}; puzzle theme ${revealTheme ? "shown" : "hidden"}`);

  const dataset = JSON.parse(await readFile(DATASET_PATH, "utf8"));
  const datasetId = dataset.datasetId ?? "unknown";
  const puzzles = Array.isArray(dataset?.puzzles) ? dataset.puzzles : [];
  assert(puzzles.length > 0, `Dataset has no puzzles: ${DATASET_PATH}`);

  const git = gitInfo();
  if (git.harnessFilesDirty) {
    console.warn("Warning: harness or dataset files have uncommitted changes; this run records harnessFilesDirty=true.");
  }

  const runConfig = {
    harnessVersion: HARNESS_VERSION,
    harnessHash: await harnessHash(),
    gitCommit: git.commit,
    harnessFilesDirty: git.harnessFilesDirty,
    protocol: "lichess-move-by-move",
    revealTheme,
    temperature,
    maxTokens,
    reasoning: useReasoning ? { effort: reasoningEffort } : null,
    retries: RETRIES,
    concurrency: CONCURRENCY,
    requestTimeoutMs: benchConfig.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    datasetPath: path.relative(process.cwd(), DATASET_PATH),
    apiProvider: apiProvider.id,
    apiModelId,
    providerOrder: benchConfig.providerOrder ?? null,
    variantId: variantId || null,
    model: {
      canonicalSlug: modelInfo.canonicalSlug ?? null,
      supportedEfforts: modelInfo.supportedEfforts ?? null,
      defaultEffort: modelInfo.defaultEffort ?? null,
      maxCompletionTokens: modelInfo.maxCompletionTokens ?? null,
      pricing: modelInfo.pricing ?? null,
    },
  };

  const modelResultsDir = path.join(RESULTS_DIR, sanitizeModelId(modelId));
  await mkdir(modelResultsDir, { recursive: true });
  const checkpointFile = inProgressPath(modelResultsDir, datasetId);
  const checkpoint = await readInProgressCheckpoint(checkpointFile, { modelId, datasetId });

  // Never merge attempts produced under different settings or harness code into one run.
  if (checkpoint?.config) {
    const keys = ["harnessHash", "maxTokens", "apiModelId", "apiProvider", "revealTheme", "temperature"];
    const mismatched = keys.filter((key) => checkpoint.config[key] !== runConfig[key]);
    if ((checkpoint.config.reasoning?.effort ?? null) !== (runConfig.reasoning?.effort ?? null)) {
      mismatched.push("reasoning.effort");
    }
    if (JSON.stringify(checkpoint.config.providerOrder ?? null) !== JSON.stringify(runConfig.providerOrder)) {
      mismatched.push("providerOrder");
    }
    assert(
      mismatched.length === 0,
      `Checkpoint ${path.relative(process.cwd(), checkpointFile)} was created with different settings or harness code (${mismatched.join(", ")}). Delete it to start fresh, or restore the old settings to resume.`
    );
  }

  const knownPuzzleIds = new Set(puzzles.map((p) => p.puzzleId));
  // Attempts that failed with a request error are dropped so resuming retries them.
  const resumedAttempts = dedupeAttemptsByPuzzle(
    (checkpoint?.attempts ?? []).filter(
      (attempt) => knownPuzzleIds.has(attempt?.puzzleId) && attempt?.parseStatus !== "request_error"
    )
  );
  const completedPuzzleIds = new Set(resumedAttempts.map((attempt) => attempt.puzzleId));
  const remaining = puzzles
    .map((puzzle, index) => ({ puzzle, index }))
    .filter(({ puzzle }) => !completedPuzzleIds.has(puzzle.puzzleId));

  const runStart = Date.now();
  const runId =
    checkpoint?.runId ??
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${hashShort(`${modelId}|${datasetId}|${runStart}`)}`;
  const runCreatedAt = checkpoint?.createdAt ?? new Date().toISOString();
  const header = {
    schema: "benchmark-run",
    runId,
    datasetId,
    modelId,
    modelName: modelName || modelId,
    benchmarkLabel: null,
    provider: apiProvider.id,
    promptFile: "src/bench/prompt.ts",
    config: runConfig,
  };

  if (resumedAttempts.length > 0) {
    console.log(`Resuming checkpoint: ${resumedAttempts.length}/${puzzles.length} already complete; ${remaining.length} remaining.`);
  }
  console.log(`Running ${puzzles.length} puzzle(s) with model=${header.modelName} concurrency=${CONCURRENCY}`);

  const attemptsByPuzzleId = new Map(resumedAttempts.map((attempt) => [attempt.puzzleId, attempt]));
  let checkpointWriteChain = Promise.resolve();
  const writeCheckpoint = () => {
    const attempts = sortAttemptsByIndex(Array.from(attemptsByPuzzleId.values()));
    const payload = {
      ...header,
      status: "in_progress",
      createdAt: runCreatedAt,
      progress: { completed: attempts.length, total: puzzles.length },
      summary: summarizeAttempts(attempts),
      attempts,
    };
    checkpointWriteChain = checkpointWriteChain
      .then(() => writeFile(checkpointFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8"))
      .catch((error) => {
        console.warn(`Warning: unable to write checkpoint (${error instanceof Error ? error.message : String(error)}).`);
      });
  };

  if (resumedAttempts.length > 0) writeCheckpoint();
  const tasks = remaining.map(({ puzzle, index }) => solvePuzzle(puzzle, index, puzzles.length, revealTheme));
  await runPool(tasks, CONCURRENCY, async (attempt) => {
    attemptsByPuzzleId.set(attempt.puzzleId, attempt);
    writeCheckpoint();
    await checkpointWriteChain;
  });
  await checkpointWriteChain;

  const mergedAttempts = sortAttemptsByIndex(Array.from(attemptsByPuzzleId.values()));
  const summary = summarizeAttempts(mergedAttempts);

  // A request error is an infrastructure failure, not a wrong answer. Keep the
  // checkpoint so the next `bench:run` retries just those puzzles, unless told to
  // publish the run with the errors scored as misses.
  const finalizeWithErrors =
    benchConfig.finalizeWithErrors === true || envTrimmed("BENCH_FINALIZE_WITH_ERRORS") === "1";
  if (summary.requestErrors > 0 && !finalizeWithErrors) {
    console.log("");
    console.warn(
      `${summary.requestErrors}/${summary.total} puzzle(s) failed with request errors. Results kept in ${path.relative(process.cwd(), checkpointFile)}.`
    );
    console.warn(
      "Run bench:run again to retry only those puzzles, or set BENCH_FINALIZE_WITH_ERRORS=1 (or finalizeWithErrors in config.ts) to save the run as-is."
    );
    process.exitCode = 1;
    return;
  }

  const servedBy = {};
  for (const attempt of mergedAttempts) {
    for (const turn of attempt.turns ?? []) {
      const key = `${turn.servedProvider ?? "unknown"} / ${turn.servedModel ?? "unknown"}`;
      servedBy[key] = (servedBy[key] ?? 0) + 1;
    }
  }

  const result = {
    ...header,
    createdAt: new Date().toISOString(),
    startedAt: runCreatedAt,
    servedBy,
    summary,
    attempts: mergedAttempts,
  };
  const outputFile = path.join(modelResultsDir, `${runId}.benchmark.json`);
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await unlink(checkpointFile).catch(() => {});

  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  console.log("");
  console.log(`Saved run: ${path.relative(process.cwd(), outputFile)}`);
  console.log(`Solved: ${pct(summary.accuracyStrict)} (${summary.correctStrict}/${summary.total}); first move correct: ${pct(summary.firstMoveAccuracy)}`);
  console.log(
    `Unparsed: ${summary.total - summary.parsed} (truncated at max_tokens: ${summary.truncated}); illegal moves: ${summary.illegalMoves}; checkmate alternatives: ${summary.checkmateAlternatives}`
  );
  console.log(`Served by: ${Object.entries(servedBy).map(([k, v]) => `${k} (${v} turns)`).join(", ")}`);
  console.log(
    `Turns: ${summary.totalTurns}; tokens prompt/completion/reasoning: ${summary.totalPromptTokens}/${summary.totalCompletionTokens}/${summary.totalReasoningTokens}; cost billed: ${summary.totalCost.toFixed(6)}`
  );
  const listCost = costAtListPrice(
    { promptTokens: summary.totalPromptTokens, completionTokens: summary.totalCompletionTokens },
    modelInfo.pricing ?? null
  );
  if (listCost !== null) console.log(`Cost at list price (shown on the site): ${listCost.toFixed(6)}`);
  if (summary.truncated > 0) {
    console.warn(`Warning: ${summary.truncated} answer(s) hit max_tokens=${maxTokens} before replying. Consider raising maxTokens.`);
  }
}

async function bootstrap() {
  loadBenchEnv();
  apiProvider = resolveApiProvider(benchConfig.apiProvider || envTrimmed("BENCH_API_PROVIDER"));
  apiBaseURL = benchConfig.apiBaseUrl || envTrimmed("BENCH_API_BASE_URL") || apiProvider.baseURL;
  apiKey = envString(apiProvider.apiKeyEnv);
  // config.ts takes priority; env vars are a fallback for CI / scripting
  baseModelId = benchConfig.modelId || envString("BENCH_MODEL_ID");
  variantId = benchConfig.variantId || envTrimmed("BENCH_VARIANT_ID") || "";
  modelId = resolveResultsModelId(baseModelId, variantId);
  apiModelId = benchConfig.apiModelId || envTrimmed("BENCH_API_MODEL_ID") || baseModelId;
  modelName = benchConfig.modelName || envTrimmed("BENCH_MODEL_NAME");
  reasoningEffort =
    benchConfig.reasoningEffort || envTrimmed("BENCH_REASONING_EFFORT") || apiProvider.defaultReasoningEffort;
  console.log(`Harness v${HARNESS_VERSION} (Lichess move-by-move)`);
  console.log(`Provider: ${apiProvider.label} (${apiBaseURL})`);
  console.log(`Model: ${modelId} (${modelName})`);
  if (variantId) console.log(`Variant: ${variantId} (base model ${baseModelId})`);
  if (apiModelId !== baseModelId) console.log(`API model: ${apiModelId}`);
  await main();
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
