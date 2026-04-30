#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { envString, envTrimmed, loadBenchEnv } from "./env";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import benchConfig from "./config";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DATASET_PATH = path.resolve(process.cwd(), "src/bench/data/puzzles.json");
const RESULTS_DIR = path.resolve(process.cwd(), "src/bench/results");
const MAX_TOKENS = 200;
const MAX_TOKENS_REASONING = 4096;
const REASONING_EFFORT = "medium";
const MISSING_OUTPUT_RETRY_ATTEMPTS = 1;
const RETRIES = 4;
const RETRY_BASE_MS = 1200;
const STORE_RAW_RESPONSE = false;
const CONCURRENCY = 10;
const IN_PROGRESS_SUFFIX = ".in-progress.tmp";

let openrouterApiKey = "";
let modelId = "";
let modelName = "";
let modelSupportedParams = new Set();
let useReasoning = false;

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

function sanitizeModelId(modelId) {
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, "__");
}

function inProgressPath(modelResultsDir, datasetId) {
  return path.join(modelResultsDir, `${sanitizeModelId(datasetId || "unknown")}${IN_PROGRESS_SUFFIX}`);
}

function displayModelName(modelId) {
  return modelName || modelId;
}

function normalizeLine(line) {
  return String(line).trim().toLowerCase().replace(/\s+/g, " ");
}

function buildRepairPrompt(originalUserPrompt, requiredPlies) {
  return `${originalUserPrompt}

IMPORTANT:
Your previous response did not include a valid final move line.
Return ONLY exactly ${requiredPlies} lowercase UCI move(s), separated by one space.
No analysis. No explanations.`;
}

function isUciMove(token) {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token);
}

function stripCodeFences(text) {
  return text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
}

function stripSanSymbols(text) {
  return text
    .replace(/[+#!?]+/g, "")
    .replace(/\bx/gi, "")
    .replace(/\d+\.\s*/g, "");
}

function normalizeSanToken(token) {
  let t = token.replace(/[+#!?]+$/, "");
  if (/^O-O/i.test(t)) return t.replace(/o/gi, (m) => "O");
  if (/^[kqrbn][a-h1-8x]/i.test(t) && t.length > 1) {
    t = t[0].toUpperCase() + t.slice(1);
  }
  if (/=[qrbn]$/i.test(t)) {
    t = t.slice(0, -1) + t.slice(-1).toUpperCase();
  }
  return t;
}

function tryParseSanWithChess(rawText, fen, requiredPlies) {
  if (!fen || !rawText) return null;

  let cleaned = stripCodeFences(rawText);
  cleaned = cleaned.replace(/[\n\r]+/g, " ").trim();
  const sanCandidates = cleaned.split(/[\s,]+/).filter(Boolean);

  const sanPattern = /^[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/i;
  const castlePattern = /^O-O(-O)?[+#]?$/i;
  const pawnPattern = /^[a-h][1-8](=[QRBN])?[+#]?$/i;

  const moveTokens = sanCandidates.filter(
    (t) => sanPattern.test(t) || castlePattern.test(t) || pawnPattern.test(t)
  );

  if (moveTokens.length < requiredPlies) return null;

  const chess = new Chess(fen);
  const uciMoves = [];
  const sanMoves = [];

  for (let i = 0; i < moveTokens.length && uciMoves.length < requiredPlies; i++) {
    const normalized = normalizeSanToken(moveTokens[i]);
    try {
      const result = chess.move(normalized);
      if (!result) continue;
      const uci = result.from + result.to + (result.promotion ?? "");
      uciMoves.push(uci);
      sanMoves.push(result.san);
    } catch {
      continue;
    }
  }

  if (uciMoves.length !== requiredPlies) return null;
  return { uci: uciMoves.join(" "), san: sanMoves.join(" ") };
}

function uciLineToSan(uciLine, fen) {
  if (!uciLine || !fen) return null;
  try {
    const chess = new Chess(fen);
    const tokens = uciLine.trim().split(/\s+/);
    const sanMoves = [];
    for (const token of tokens) {
      const from = token.slice(0, 2);
      const to = token.slice(2, 4);
      const promotion = token[4] ?? undefined;
      const result = chess.move({ from, to, promotion });
      if (!result) return null;
      sanMoves.push(result.san);
    }
    return sanMoves.join(" ");
  } catch {
    return null;
  }
}

function parseLineStrict(candidate, requiredPlies) {
  const normalized = normalizeLine(candidate);
  if (!normalized) {
    return { parsedLine: null, parseStatus: "missing", formatValid: false };
  }

  const tokens = normalized.split(" ");
  if (tokens.length !== requiredPlies) {
    return {
      parsedLine: null,
      parseStatus: "invalid_count",
      formatValid: false,
    };
  }
  if (!tokens.every(isUciMove)) {
    return {
      parsedLine: null,
      parseStatus: "invalid_uci",
      formatValid: false,
    };
  }
  return {
    parsedLine: tokens.join(" "),
    parseStatus: "ok",
    formatValid: true,
  };
}

function parseBenchmarkOutput(raw, requiredPlies, currentFen = null) {
  const text = String(raw ?? "");

  // Step 1: Strip code fences and try strict parse on cleaned text
  const cleaned = stripCodeFences(text);
  const singleLine = normalizeLine(cleaned);
  const strictParsed = parseLineStrict(singleLine, requiredPlies);
  if (strictParsed.parsedLine) {
    const san = currentFen ? uciLineToSan(strictParsed.parsedLine, currentFen) : null;
    return { ...strictParsed, sanLine: san, thinkingText: null };
  }

  // Step 2: Loose UCI extraction — look for exactly requiredPlies UCI tokens
  const looseTokens = (cleaned.toLowerCase().match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ?? []);
  if (looseTokens.length === requiredPlies && looseTokens.every(isUciMove)) {
    const uciLine = looseTokens.join(" ");
    const san = currentFen ? uciLineToSan(uciLine, currentFen) : null;
    return {
      parsedLine: uciLine,
      sanLine: san,
      parseStatus: `loose_${strictParsed.parseStatus}`,
      formatValid: false,
      thinkingText: null,
    };
  }

  // Step 3: SAN-to-UCI conversion using chess.js and the board position
  if (currentFen) {
    const sanResult = tryParseSanWithChess(cleaned, currentFen, requiredPlies);
    if (sanResult) {
      return {
        parsedLine: sanResult.uci,
        sanLine: sanResult.san,
        parseStatus: "san_converted",
        formatValid: false,
        thinkingText: null,
      };
    }
  }

  return { ...strictParsed, sanLine: null, thinkingText: null };
}

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

  const reasoningCandidates = [
    choice?.message?.reasoning,
    choice?.message?.reasoning_content,
    choice?.message?.analysis,
    choice?.reasoning,
  ];
  for (const candidate of reasoningCandidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const text = candidate
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function hashShort(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

const PROMOTION_ROLE_MAP = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

function fileIndex(square) {
  return square.charCodeAt(0) - 97;
}

function square(file, rank) {
  return `${String.fromCharCode(97 + file)}${rank}`;
}

function parseFenBoard(boardPart) {
  const pieces = new Map();
  let rank = 8;
  let file = 0;
  for (const char of boardPart) {
    if (char === "/") {
      rank -= 1;
      file = 0;
      continue;
    }
    if (/[1-8]/.test(char)) {
      file += Number.parseInt(char, 10);
      continue;
    }
    pieces.set(square(file, rank), {
      color: char === char.toLowerCase() ? "black" : "white",
      role: ({
        p: "pawn",
        n: "knight",
        b: "bishop",
        r: "rook",
        q: "queen",
        k: "king",
      })[char.toLowerCase()],
    });
    file += 1;
  }
  return pieces;
}

function pieceToChar(piece) {
  const char = ({
    pawn: "p",
    knight: "n",
    bishop: "b",
    rook: "r",
    queen: "q",
    king: "k",
  })[piece.role] ?? "?";
  return piece.color === "white" ? char.toUpperCase() : char;
}

function renderAsciiBoard(fen) {
  const boardPart = fen.trim().split(/\s+/)[0] ?? "";
  const pieces = parseFenBoard(boardPart);
  const lines = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    const cells = [];
    for (let file = 0; file < 8; file += 1) {
      const piece = pieces.get(square(file, rank));
      cells.push(piece ? pieceToChar(piece) : ".");
    }
    lines.push(`${rank} ${cells.join(" ")}`);
  }
  lines.push("  a b c d e f g h");
  return lines.join("\n");
}

function serializeFenBoard(pieces) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = pieces.get(square(file, rank));
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      const char = ({
        pawn: "p",
        knight: "n",
        bishop: "b",
        rook: "r",
        queen: "q",
        king: "k",
      })[piece.role];
      row += piece.color === "white" ? char.toUpperCase() : char;
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join("/");
}

function normalizeCastling(castling) {
  return castling && castling !== "-" ? castling : "";
}

function denormalizeCastling(castling) {
  return castling ? castling : "-";
}

function stripCastling(castling, rights) {
  return [...normalizeCastling(castling)].filter((right) => !rights.includes(right)).join("");
}

function applyUciToFen(fen, move) {
  if (!fen || !move || move.length < 4) return null;

  const [
    boardPart,
    activeColor = "w",
    castlingRaw = "-",
    ,
    halfmoveRaw = "0",
    fullmoveRaw = "1",
  ] = fen.trim().split(/\s+/);
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const promotion = move[4]?.toLowerCase();
  const pieces = parseFenBoard(boardPart);
  const piece = pieces.get(from);
  if (!piece) return null;

  const targetPiece = pieces.get(to);
  let castling = normalizeCastling(castlingRaw);
  let enPassant = "-";

  pieces.delete(from);

  if (piece.role === "pawn" && from[0] !== to[0] && !targetPiece) {
    pieces.delete(`${to[0]}${from[1]}`);
  }

  if (piece.role === "king") {
    castling = stripCastling(castling, piece.color === "white" ? "KQ" : "kq");
    if (Math.abs(fileIndex(from) - fileIndex(to)) === 2) {
      const isKingSide = fileIndex(to) > fileIndex(from);
      const rookFrom = `${isKingSide ? "h" : "a"}${from[1]}`;
      const rookTo = `${isKingSide ? "f" : "d"}${from[1]}`;
      const rook = pieces.get(rookFrom);
      if (rook?.role === "rook" && rook.color === piece.color) {
        pieces.delete(rookFrom);
        pieces.set(rookTo, rook);
      }
    }
  }

  if (piece.role === "rook") {
    if (from === "a1") castling = stripCastling(castling, "Q");
    if (from === "h1") castling = stripCastling(castling, "K");
    if (from === "a8") castling = stripCastling(castling, "q");
    if (from === "h8") castling = stripCastling(castling, "k");
  }

  if (targetPiece?.role === "rook") {
    if (to === "a1") castling = stripCastling(castling, "Q");
    if (to === "h1") castling = stripCastling(castling, "K");
    if (to === "a8") castling = stripCastling(castling, "q");
    if (to === "h8") castling = stripCastling(castling, "k");
  }

  const movedPiece =
    promotion && piece.role === "pawn"
      ? { ...piece, role: PROMOTION_ROLE_MAP[promotion] ?? piece.role }
      : piece;
  pieces.set(to, movedPiece);

  if (piece.role === "pawn" && Math.abs(Number(to[1]) - Number(from[1])) === 2) {
    enPassant = `${from[0]}${(Number(from[1]) + Number(to[1])) / 2}`;
  }

  const halfmove =
    piece.role === "pawn" || targetPiece
      ? "0"
      : String(Number.parseInt(halfmoveRaw, 10) + 1);
  const fullmove =
    activeColor === "b"
      ? String(Number.parseInt(fullmoveRaw, 10) + 1)
      : fullmoveRaw;
  const nextTurn = activeColor === "w" ? "b" : "w";

  return `${serializeFenBoard(pieces)} ${nextTurn} ${denormalizeCastling(castling)} ${enPassant} ${halfmove} ${fullmove}`;
}

function applyUciWithChessJs(fen, uciMove) {
  try {
    const chess = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove[4] ?? undefined;
    chess.move({ from, to, promotion });
    return chess.fen();
  } catch {
    return null;
  }
}

function getPromptContext(puzzle) {
  const sourceFen = puzzle.fen;
  const currentFen =
    applyUciWithChessJs(sourceFen, puzzle.initialMove) ??
    applyUciToFen(sourceFen, puzzle.initialMove) ??
    sourceFen;
  const sideToMove = currentFen.split(/\s+/)[1] === "b" ? "Black" : "White";
  const boardAscii = renderAsciiBoard(currentFen);
  return {
    sourceFen,
    currentFen,
    sideToMove,
    boardAscii,
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

function getTaskDescription(track, requiredPlies) {
  if (track === "mateIn1" || track === "mate1") {
    return "Find the move that gives checkmate immediately.";
  }
  if (track === "mateIn2" || track === "mate2") {
    return "Find the forced mate in 2 from the current position.";
  }
  return `Find the best continuation line of exactly ${requiredPlies} plies from the current position.`;
}

function createUserPrompt(puzzle) {
  const context = getPromptContext(puzzle);
  return buildUserPrompt({
    puzzleId: puzzle.puzzleId,
    trackLabel: formatTrackLabel(puzzle.track),
    ratingBucket: puzzle.ratingBucket,
    rating: puzzle.rating,
    currentFen: context.currentFen,
    sideToMove: context.sideToMove,
    boardAscii: context.boardAscii,
    requiredPlies: puzzle.requiredPlies,
    taskDescription: getTaskDescription(puzzle.track, puzzle.requiredPlies),
  });
}

async function fetchModelMetadata() {
  const url = `${OPENROUTER_BASE_URL}/models`;
  const headers = { Accept: "application/json" };
  if (openrouterApiKey) headers.Authorization = `Bearer ${openrouterApiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Unable to fetch model metadata (${res.status} ${res.statusText})`);
  }
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows;
}

async function loadSupportedParameters(modelId) {
  try {
    const models = await fetchModelMetadata();
    const row = models.find((m) => m?.id === modelId);
    if (!row) {
      console.warn(`Warning: model "${modelId}" not found in /models; skipping parameter validation.`);
      return new Set();
    }

    const supported = new Set(Array.isArray(row.supported_parameters) ? row.supported_parameters : []);
    const expected = ["max_tokens"];
    const missing = expected.filter((param) => !supported.has(param));
    if (missing.length > 0) {
      console.warn(
        `Warning: model "${modelId}" does not list support for [${missing.join(", ")}]. Benchmark may be inconsistent.`
      );
    }
    return supported;
  } catch (error) {
    console.warn(
      `Warning: supported parameter lookup failed (${error instanceof Error ? error.message : String(error)}). Continuing without temperature.`
    );
    return new Set();
  }
}

function buildCompletionBody({ modelId, systemPrompt, userPrompt }) {
  const body = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: useReasoning ? MAX_TOKENS_REASONING : MAX_TOKENS,
    provider: {
      allow_fallbacks: false,
      ...(benchConfig.providerOrder ? { order: benchConfig.providerOrder } : {}),
    },
  };
  if (modelSupportedParams.has("temperature")) {
    body.temperature = 0;
  }
  if (useReasoning) {
    body.reasoning = { effort: REASONING_EFFORT };
  }
  return body;
}

async function postCompletion(body) {
  const url = `${OPENROUTER_BASE_URL}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${openrouterApiKey}`,
  };

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return await res.json();
    }

    const retryable = [408, 409, 429, 500, 502, 503, 504].includes(res.status);
    const text = await res.text();
    if (!retryable || attempt === RETRIES) {
      throw new Error(
        `OpenRouter error ${res.status}: ${res.statusText}. Body: ${text.slice(0, 400)}`
      );
    }

    const waitMs = RETRY_BASE_MS * 2 ** attempt;
    await delay(waitMs);
  }

  throw new Error("Unreachable retry state.");
}

function extractUsage(resp) {
  const usage = resp?.usage ?? {};
  const promptTokens = toInt(usage.prompt_tokens, 0);
  const completionTokens = toInt(usage.completion_tokens, 0);
  const reasoningTokens = toInt(
    usage?.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens,
    0
  );
  const totalTokens = toInt(usage.total_tokens, promptTokens + completionTokens);
  // For BYOK, OpenRouter returns the provider-billed amount in usage.cost_details.upstream_inference_cost.
  // usage.cost is the amount charged to OpenRouter credits, so it may be 0 or only reflect the BYOK platform fee.
  const upstreamInferenceCost = finiteNumberOrNull(usage?.cost_details?.upstream_inference_cost);
  const cost = upstreamInferenceCost ?? toNumber(usage.cost, 0);
  return { promptTokens, completionTokens, reasoningTokens, totalTokens, cost };
}

function mergeUsageTotals(base, extra) {
  base.promptTokens += extra.promptTokens;
  base.completionTokens += extra.completionTokens;
  base.reasoningTokens += extra.reasoningTokens;
  base.totalTokens += extra.totalTokens;
  base.cost += extra.cost;
}

async function fetchGenerationCost(generationId: string): Promise<number> {
  try {
    const res = await fetch(
      `${OPENROUTER_BASE_URL}/generation?id=${generationId}`,
      { headers: { Authorization: `Bearer ${openrouterApiKey}` } }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    const upstreamInferenceCost = finiteNumberOrNull(json?.data?.upstream_inference_cost);
    return upstreamInferenceCost ?? toNumber(json?.data?.total_cost, 0);
  } catch {
    return 0;
  }
}

async function extractUsageWithCost(response) {
  const usage = extractUsage(response);
  if (usage.cost === 0 && response?.id) {
    usage.cost = await fetchGenerationCost(response.id);
  }
  return usage;
}

function summarizeAttempts(attempts) {
  const total = attempts.length;
  const parsed = attempts.filter((a) => a.parsedLine).length;
  const correctStrict = attempts.filter((a) => a.correctStrict).length;
  const sanConverted = attempts.filter((a) => a.parseStatus === "san_converted").length;
  const totalPromptTokens = attempts.reduce((sum, a) => sum + a.usage.promptTokens, 0);
  const totalCompletionTokens = attempts.reduce((sum, a) => sum + a.usage.completionTokens, 0);
  const totalReasoningTokens = attempts.reduce((sum, a) => sum + a.usage.reasoningTokens, 0);
  const totalCost = attempts.reduce((sum, a) => sum + a.usage.cost, 0);
  const averageLatencyMs =
    total === 0 ? 0 : attempts.reduce((sum, a) => sum + a.latencyMs, 0) / total;
  return {
    total,
    parsed,
    sanConverted,
    correctStrict,
    accuracyStrict: total === 0 ? 0 : correctStrict / total,
    accuracyParsed: parsed === 0 ? 0 : correctStrict / parsed,
    totalPromptTokens,
    totalCompletionTokens,
    totalReasoningTokens,
    totalCost,
    averageLatencyMs,
  };
}

function sortAttemptsByIndex(attempts) {
  return [...attempts].sort((a, b) => toInt(a?.index, 0) - toInt(b?.index, 0));
}

function dedupeAttemptsByPuzzle(attempts) {
  const byPuzzleId = new Map();
  for (const attempt of attempts) {
    const puzzleId = attempt?.puzzleId;
    if (!puzzleId) continue;
    byPuzzleId.set(puzzleId, attempt);
  }
  return sortAttemptsByIndex(Array.from(byPuzzleId.values()));
}

async function readInProgressCheckpoint(filePath, { modelId, datasetId }) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.modelId !== modelId || parsed.datasetId !== datasetId) return null;
    const attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
    return {
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null,
      attempts,
    };
  } catch {
    return null;
  }
}

function solvePuzzle(puzzle, index, total) {
  const promptContext = getPromptContext(puzzle);
  const expectedLine = normalizeLine(puzzle.expectedLine ?? "");
  const expectedSanLine = uciLineToSan(expectedLine, promptContext.currentFen);
  const userPrompt = createUserPrompt(puzzle);
  const body = buildCompletionBody({
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });

  return async () => {
    const started = Date.now();
    try {
      const response = await postCompletion(body);
      let choice = response?.choices?.[0] ?? null;
      let rawOutput = extractMessageText(choice?.message?.content);
      let apiReasoning = extractApiReasoning(choice);
      const usage = await extractUsageWithCost(response);
      let parsed = parseBenchmarkOutput(rawOutput, puzzle.requiredPlies, promptContext.currentFen);

      for (let repairAttempt = 0; repairAttempt < MISSING_OUTPUT_RETRY_ATTEMPTS; repairAttempt += 1) {
        if (parsed.parsedLine) break;

        const repairBody = buildCompletionBody({
          modelId,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildRepairPrompt(userPrompt, puzzle.requiredPlies),
        });
        // Repair turn should be short and final-answer-only.
        repairBody.max_tokens = MAX_TOKENS;
        delete repairBody.reasoning;

        const repairResponse = await postCompletion(repairBody);
        const repairChoice = repairResponse?.choices?.[0] ?? null;
        const repairRawOutput = extractMessageText(repairChoice?.message?.content);
        const repairReasoning = extractApiReasoning(repairChoice);
        const repairUsage = await extractUsageWithCost(repairResponse);
        mergeUsageTotals(usage, repairUsage);

        const repairParsed = parseBenchmarkOutput(
          repairRawOutput,
          puzzle.requiredPlies,
          promptContext.currentFen
        );

        if (!rawOutput && repairRawOutput) {
          rawOutput = repairRawOutput;
          choice = repairChoice;
        }
        if (!apiReasoning && repairReasoning) {
          apiReasoning = repairReasoning;
        }

        if (repairParsed.parsedLine) {
          rawOutput = repairRawOutput;
          choice = repairChoice;
          parsed = {
            ...repairParsed,
            parseStatus:
              repairParsed.parseStatus === "ok"
                ? "repair_ok"
                : `repair_${repairParsed.parseStatus}`,
            formatValid: false,
          };
          break;
        }
      }

      const latencyMs = Date.now() - started;
      const parsedLine = parsed.parsedLine;
      const correctStrict = parsedLine ? normalizeLine(parsedLine) === expectedLine : false;

      const result = {
        index,
        puzzleId: puzzle.puzzleId,
        track: puzzle.track,
        ratingBucket: puzzle.ratingBucket,
        sourceFen: promptContext.sourceFen,
        initialMove: puzzle.initialMove,
        currentFen: promptContext.currentFen,
        sideToMove: promptContext.sideToMove,
        expectedLine,
        expectedSanLine,
        rawOutput,
        parsedLine,
        sanLine: parsed.sanLine ?? null,
        parseStatus: parsed.parseStatus,
        formatValid: parsed.formatValid,
        correctStrict,
        thinkingText: parsed.thinkingText ?? apiReasoning ?? null,
        latencyMs,
        usage,
        responseError: null,
        ...(STORE_RAW_RESPONSE ? { providerResponse: response } : {}),
      };
      console.log(
        `[${index + 1}/${total}] ${puzzle.puzzleId} ${puzzle.track} ${puzzle.ratingBucket} -> ${correctStrict ? "OK" : "MISS"}`
      );
      return result;
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        index,
        puzzleId: puzzle.puzzleId,
        track: puzzle.track,
        ratingBucket: puzzle.ratingBucket,
        sourceFen: promptContext.sourceFen,
        initialMove: puzzle.initialMove,
        currentFen: promptContext.currentFen,
        sideToMove: promptContext.sideToMove,
        expectedLine,
        rawOutput: "",
        parsedLine: null,
        parseStatus: "request_error",
        formatValid: false,
        correctStrict: false,
        thinkingText: null,
        latencyMs,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          cost: 0,
        },
        responseError: { message },
      };
      console.error(`[${index + 1}/${total}] ${puzzle.puzzleId} failed: ${message}`);
      return result;
    }
  };
}

async function runPool(tasks, concurrency, onTaskCompleted = null) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await tasks[i]();
      if (onTaskCompleted) {
        await onTaskCompleted(results[i], i);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  assert(openrouterApiKey, "Missing OPENROUTER_API_KEY.");
  assert(modelId, "Missing BENCH_MODEL_ID.");
  assert(Number.isFinite(MAX_TOKENS) && MAX_TOKENS > 0, "MAX_TOKENS must be > 0.");
  const modelDisplayName = displayModelName(modelId);

  modelSupportedParams = await loadSupportedParameters(modelId);

  const useTemp = modelSupportedParams.has("temperature");
  useReasoning = modelSupportedParams.has("reasoning");

  console.log(`Temperature: ${useTemp ? "0 (supported)" : "not set (unsupported)"}`);
  console.log(`Reasoning: ${useReasoning ? `effort="${REASONING_EFFORT}", max_tokens=${MAX_TOKENS_REASONING}` : "not supported by model"}`);

  const datasetRaw = await readFile(DATASET_PATH, "utf8");
  const dataset = JSON.parse(datasetRaw);
  const datasetId = dataset.datasetId ?? "unknown";
  const puzzlesAll = Array.isArray(dataset?.puzzles) ? dataset.puzzles : [];
  assert(puzzlesAll.length > 0, `Dataset has no puzzles: ${DATASET_PATH}`);
  const puzzles = puzzlesAll;

  const modelResultsDir = path.join(RESULTS_DIR, sanitizeModelId(modelId));
  await mkdir(modelResultsDir, { recursive: true });
  const checkpointFile = inProgressPath(modelResultsDir, datasetId);
  const checkpoint = await readInProgressCheckpoint(checkpointFile, { modelId, datasetId });

  const knownPuzzleIds = new Set(puzzles.map((p) => p.puzzleId));
  const resumedAttempts = dedupeAttemptsByPuzzle(
    (checkpoint?.attempts ?? []).filter((attempt) => knownPuzzleIds.has(attempt?.puzzleId))
  );
  const completedPuzzleIds = new Set(resumedAttempts.map((attempt) => attempt.puzzleId));
  const remaining = [];
  for (let i = 0; i < puzzles.length; i += 1) {
    const puzzle = puzzles[i];
    if (completedPuzzleIds.has(puzzle.puzzleId)) continue;
    remaining.push({ puzzle, index: i });
  }

  const runStart = Date.now();
  const runId =
    checkpoint?.runId ??
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${hashShort(
      `${modelId}|${datasetId}|${runStart}`
    )}`;
  const runCreatedAt = checkpoint?.createdAt ?? new Date().toISOString();
  const provider = "openrouter";

  if (resumedAttempts.length > 0) {
    console.log(
      `Resuming checkpoint: ${resumedAttempts.length}/${puzzles.length} already complete; ${remaining.length} remaining.`
    );
  }
  console.log(`Running ${puzzles.length} puzzle(s) with model=${modelDisplayName} concurrency=${CONCURRENCY}`);

  const attemptsByPuzzleId = new Map(resumedAttempts.map((attempt) => [attempt.puzzleId, attempt]));
  let checkpointWriteChain = Promise.resolve();
  const writeCheckpoint = () => {
    const attempts = sortAttemptsByIndex(Array.from(attemptsByPuzzleId.values()));
    const payload = {
      schema: "benchmark-run",
      status: "in_progress",
      runId,
      createdAt: runCreatedAt,
      datasetId,
      modelId,
      modelName: modelDisplayName,
      provider,
      promptFile: path.relative(process.cwd(), path.resolve(process.cwd(), "src/bench/prompt.ts")),
      config: {
        temperature: useTemp ? 0 : null,
        maxTokens: useReasoning ? MAX_TOKENS_REASONING : MAX_TOKENS,
        reasoning: useReasoning ? { effort: REASONING_EFFORT } : null,
        retries: RETRIES,
        concurrency: CONCURRENCY,
        limit: null,
        datasetPath: path.relative(process.cwd(), DATASET_PATH),
      },
      progress: {
        completed: attempts.length,
        total: puzzles.length,
      },
      summary: summarizeAttempts(attempts),
      attempts,
    };
    checkpointWriteChain = checkpointWriteChain
      .then(() => writeFile(checkpointFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8"))
      .catch((error) => {
        console.warn(
          `Warning: unable to write checkpoint (${error instanceof Error ? error.message : String(error)}).`
        );
      });
  };

  if (resumedAttempts.length > 0) {
    writeCheckpoint();
  }
  const tasks = remaining.map(({ puzzle, index }) => solvePuzzle(puzzle, index, puzzles.length));
  await runPool(tasks, CONCURRENCY, async (attempt) => {
    attemptsByPuzzleId.set(attempt.puzzleId, attempt);
    writeCheckpoint();
    await checkpointWriteChain;
  });
  await checkpointWriteChain;

  const mergedAttempts = sortAttemptsByIndex(Array.from(attemptsByPuzzleId.values()));
  const summary = summarizeAttempts(mergedAttempts);
  const result = {
    schema: "benchmark-run",
    runId,
    createdAt: new Date().toISOString(),
    datasetId,
    modelId,
    modelName: modelDisplayName,
    benchmarkLabel: null,
    provider,
    promptFile: path.relative(process.cwd(), path.resolve(process.cwd(), "src/bench/prompt.ts")),
    config: {
      temperature: useTemp ? 0 : null,
      maxTokens: useReasoning ? MAX_TOKENS_REASONING : MAX_TOKENS,
      reasoning: useReasoning ? { effort: REASONING_EFFORT } : null,
      retries: RETRIES,
      concurrency: CONCURRENCY,
      limit: null,
      datasetPath: path.relative(process.cwd(), DATASET_PATH),
    },
    summary,
    attempts: mergedAttempts,
  };

  const outputFile = path.join(
    modelResultsDir,
    `${runId}.benchmark.json`
  );
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await unlink(checkpointFile).catch(() => {});

  console.log("");
  console.log(`Saved run: ${path.relative(process.cwd(), outputFile)}`);
  console.log(
    `Accuracy(strict): ${(summary.accuracyStrict * 100).toFixed(2)}% (${summary.correctStrict}/${summary.total})`
  );
  console.log(
    `Accuracy(parsed): ${(summary.accuracyParsed * 100).toFixed(2)}% (${summary.correctStrict}/${summary.parsed} parsed)`
  );
  console.log(
    `Parse rate: ${((summary.parsed / summary.total) * 100).toFixed(1)}% — SAN converted: ${summary.sanConverted}, unparsed: ${summary.total - summary.parsed}`
  );
  console.log(
    `Tokens prompt/completion/reasoning: ${summary.totalPromptTokens}/${summary.totalCompletionTokens}/${summary.totalReasoningTokens}`
  );
  console.log(`Total cost: ${summary.totalCost.toFixed(6)}`);
}

async function bootstrap() {
  loadBenchEnv();
  openrouterApiKey = envString("OPENROUTER_API_KEY");
  // config.ts takes priority; env vars are a fallback for CI / scripting
  modelId = benchConfig.modelId || envString("BENCH_MODEL_ID");
  modelName = benchConfig.modelName || envTrimmed("BENCH_MODEL_NAME");
  console.log(`Model: ${modelId} (${modelName})`);
  await main();
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
