#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseDotEnv(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) {
      key = key.slice("export ".length).trim();
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadEnvFileIfPresent(absPath) {
  if (!existsSync(absPath)) return false;
  const content = await readFile(absPath, "utf8");
  const parsed = parseDotEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

await loadEnvFileIfPresent(path.resolve(process.cwd(), ".env"));
await loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.local"));

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL_ID = process.env.BENCH_MODEL_ID ?? "";
const MODEL_NAME = process.env.BENCH_MODEL_NAME?.trim() ?? "";
const BENCHMARK_LABEL = process.env.BENCH_BENCHMARK_LABEL?.trim() ?? "";
const DATASET_PATH = path.resolve(
  process.cwd(),
  process.env.BENCH_DATASET_PATH ?? "src/bench/data/puzzles.v1.json"
);
const RESULTS_DIR = path.resolve(
  process.cwd(),
  process.env.BENCH_RESULTS_DIR ?? "src/bench/results"
);
const PROMPTS_DIR = path.resolve(process.cwd(), "src/bench/prompts");
const PROMPT_MODE = process.env.BENCH_PROMPT_MODE ?? "benchmark";
const LIMIT = process.env.BENCH_LIMIT ? Number(process.env.BENCH_LIMIT) : null;
const TEMPERATURE = Number(process.env.BENCH_TEMPERATURE ?? 0);
const MAX_TOKENS = Number(
  process.env.BENCH_MAX_TOKENS ?? (PROMPT_MODE === "showcase" ? 350 : 70)
);
const RETRIES = Number(process.env.BENCH_RETRIES ?? 4);
const RETRY_BASE_MS = Number(process.env.BENCH_RETRY_BASE_MS ?? 1200);
const STORE_RAW_RESPONSE = process.env.BENCH_STORE_RAW_RESPONSE === "1";
const INCLUDE_SHOWCASE_THINKING =
  process.env.BENCH_INCLUDE_SHOWCASE_THINKING !== "0";
const VALIDATE_SUPPORTED_PARAMS =
  process.env.BENCH_VALIDATE_SUPPORTED_PARAMS !== "0";
const DRY_RUN = process.env.BENCH_DRY_RUN === "1";

const PROMPT_PROFILE = {
  benchmark: {
    version: "benchmark-uci-v2",
    systemFile: "benchmark-uci-v1.system.txt",
    userFile: "benchmark-uci-v1.user.txt",
  },
  showcase: {
    version: "showcase-analysis-v2",
    systemFile: "showcase-analysis-v1.system.txt",
    userFile: "showcase-analysis-v1.user.txt",
  },
};

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeModelId(modelId) {
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, "__");
}

function displayModelName(modelId) {
  const baseName = MODEL_NAME || modelId;
  if (!BENCHMARK_LABEL) return baseName;
  return `${baseName} (${BENCHMARK_LABEL})`;
}

function normalizeLine(line) {
  return String(line).trim().toLowerCase().replace(/\s+/g, " ");
}

function isUciMove(token) {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token);
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

function parseShowcaseOutput(raw, requiredPlies) {
  const normalizedRaw = String(raw ?? "");
  const lineMatch = normalizedRaw.match(/^\s*LINE:\s*(.+)\s*$/im);
  const thinkingMatch = normalizedRaw.match(/^\s*THINKING:\s*([\s\S]*)$/im);
  const lineCandidate = lineMatch ? lineMatch[1] : "";
  const parsed = parseLineStrict(lineCandidate, requiredPlies);
  const thinkingText =
    INCLUDE_SHOWCASE_THINKING && thinkingMatch
      ? thinkingMatch[1].trim() || null
      : null;

  return {
    ...parsed,
    thinkingText,
    parseStatus: lineMatch ? parsed.parseStatus : "missing_line_label",
  };
}

function parseBenchmarkOutput(raw, requiredPlies) {
  const text = String(raw ?? "");
  const singleLine = normalizeLine(text);
  const strictParsed = parseLineStrict(singleLine, requiredPlies);
  if (strictParsed.parsedLine) {
    return { ...strictParsed, thinkingText: null };
  }

  // Best-effort fallback parser for models that include extra text.
  const looseTokens = (text.toLowerCase().match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ??
    []).slice(0, requiredPlies);
  if (looseTokens.length === requiredPlies && looseTokens.every(isUciMove)) {
    return {
      parsedLine: looseTokens.join(" "),
      parseStatus: `loose_${strictParsed.parseStatus}`,
      formatValid: false,
      thinkingText: null,
    };
  }

  return { ...strictParsed, thinkingText: null };
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

function extractApiReasoning(choice) {
  const reasoningCandidates = [
    choice?.message?.reasoning,
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

function applyTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return "";
    const value = values[key];
    return value == null ? "" : String(value);
  });
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

function getPromptContext(puzzle) {
  const sourceFen = puzzle.fen;
  const currentFen = applyUciToFen(sourceFen, puzzle.initialMove) ?? sourceFen;
  const sideToMove = currentFen.split(/\s+/)[1] === "b" ? "Black" : "White";
  return {
    sourceFen,
    currentFen,
    sideToMove,
  };
}

async function readPromptFiles(mode) {
  const profile = PROMPT_PROFILE[mode];
  assert(profile, `Unknown BENCH_PROMPT_MODE: ${mode}`);
  const [systemPrompt, userTemplate] = await Promise.all([
    readFile(path.join(PROMPTS_DIR, profile.systemFile), "utf8"),
    readFile(path.join(PROMPTS_DIR, profile.userFile), "utf8"),
  ]);
  return { ...profile, systemPrompt: systemPrompt.trim(), userTemplate: userTemplate.trim() };
}

function createUserPrompt(template, puzzle) {
  const context = getPromptContext(puzzle);
  return applyTemplate(template, {
    puzzleId: puzzle.puzzleId,
    track: puzzle.track,
    ratingBucket: puzzle.ratingBucket,
    rating: puzzle.rating,
    fen: puzzle.fen,
    sourceFen: context.sourceFen,
    currentFen: context.currentFen,
    sideToMove: context.sideToMove,
    initialMove: puzzle.initialMove,
    requiredPlies: puzzle.requiredPlies,
  });
}

async function fetchModelMetadata() {
  const url = `${OPENROUTER_BASE_URL}/models`;
  const headers = { Accept: "application/json" };
  if (OPENROUTER_API_KEY) headers.Authorization = `Bearer ${OPENROUTER_API_KEY}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Unable to fetch model metadata (${res.status} ${res.statusText})`);
  }
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows;
}

async function validateSupportedParameters(modelId) {
  if (!VALIDATE_SUPPORTED_PARAMS) return;
  try {
    const models = await fetchModelMetadata();
    const row = models.find((m) => m?.id === modelId);
    if (!row) {
      console.warn(`Warning: model "${modelId}" not found in /models; skipping parameter validation.`);
      return;
    }

    const supported = new Set(Array.isArray(row.supported_parameters) ? row.supported_parameters : []);
    const expected = ["temperature", "max_tokens"];
    const missing = expected.filter((param) => !supported.has(param));
    if (missing.length > 0) {
      console.warn(
        `Warning: model "${modelId}" does not list support for [${missing.join(", ")}]. Benchmark may be inconsistent.`
      );
    }
  } catch (error) {
    console.warn(
      `Warning: supported parameter validation failed (${error instanceof Error ? error.message : String(error)}). Continuing.`
    );
  }
}

function buildCompletionBody({ modelId, systemPrompt, userPrompt }) {
  return {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
    },
  };
}

async function postCompletion(body) {
  const url = `${OPENROUTER_BASE_URL}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
  const cost = toNumber(usage.cost, 0);
  return { promptTokens, completionTokens, reasoningTokens, totalTokens, cost };
}

function summarizeAttempts(attempts) {
  const total = attempts.length;
  const parsed = attempts.filter((a) => a.parsedLine).length;
  const correctStrict = attempts.filter((a) => a.correctStrict).length;
  const totalPromptTokens = attempts.reduce((sum, a) => sum + a.usage.promptTokens, 0);
  const totalCompletionTokens = attempts.reduce((sum, a) => sum + a.usage.completionTokens, 0);
  const totalReasoningTokens = attempts.reduce((sum, a) => sum + a.usage.reasoningTokens, 0);
  const totalCost = attempts.reduce((sum, a) => sum + a.usage.cost, 0);
  const averageLatencyMs =
    total === 0 ? 0 : attempts.reduce((sum, a) => sum + a.latencyMs, 0) / total;
  return {
    total,
    parsed,
    correctStrict,
    accuracyStrict: total === 0 ? 0 : correctStrict / total,
    totalPromptTokens,
    totalCompletionTokens,
    totalReasoningTokens,
    totalCost,
    averageLatencyMs,
  };
}

async function main() {
  if (!DRY_RUN) {
    assert(OPENROUTER_API_KEY, "Missing OPENROUTER_API_KEY.");
    assert(MODEL_ID, "Missing BENCH_MODEL_ID.");
  }
  assert(PROMPT_PROFILE[PROMPT_MODE], `Unsupported BENCH_PROMPT_MODE: ${PROMPT_MODE}`);
  assert(Number.isFinite(TEMPERATURE), "BENCH_TEMPERATURE must be numeric.");
  assert(Number.isFinite(MAX_TOKENS) && MAX_TOKENS > 0, "BENCH_MAX_TOKENS must be > 0.");
  const modelId = MODEL_ID || "dry-run/model";
  const modelDisplayName = displayModelName(modelId);

  const promptProfile = await readPromptFiles(PROMPT_MODE);
  if (!DRY_RUN) {
    await validateSupportedParameters(modelId);
  }

  const datasetRaw = await readFile(DATASET_PATH, "utf8");
  const dataset = JSON.parse(datasetRaw);
  const puzzlesAll = Array.isArray(dataset?.puzzles) ? dataset.puzzles : [];
  assert(puzzlesAll.length > 0, `Dataset has no puzzles: ${DATASET_PATH}`);
  const puzzles = LIMIT ? puzzlesAll.slice(0, LIMIT) : puzzlesAll;

  const runStart = Date.now();
  const attempts = [];
  console.log(
    `Running ${puzzles.length} puzzle(s) with model=${modelDisplayName}, mode=${PROMPT_MODE}, prompt=${promptProfile.version}${DRY_RUN ? " [DRY RUN]" : ""}`
  );

  for (let i = 0; i < puzzles.length; i += 1) {
    const puzzle = puzzles[i];
    const promptContext = getPromptContext(puzzle);
    const expectedLine = normalizeLine(puzzle.expectedLine ?? "");
    const userPrompt = createUserPrompt(promptProfile.userTemplate, puzzle);
    const body = buildCompletionBody({
      modelId,
      systemPrompt: promptProfile.systemPrompt,
      userPrompt,
    });

    const started = Date.now();
    try {
      let rawOutput = "";
      let apiReasoning = null;
      let usage = {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
      let providerResponse = null;
      if (DRY_RUN) {
        rawOutput =
          PROMPT_MODE === "showcase"
            ? `LINE: ${expectedLine}\nTHINKING:\n- Dry run output\n- Replace with real model run`
            : expectedLine;
      } else {
        const response = await postCompletion(body);
        providerResponse = response;
        const choice = response?.choices?.[0] ?? null;
        rawOutput = extractMessageText(choice?.message?.content);
        apiReasoning = extractApiReasoning(choice);
        usage = extractUsage(response);
      }
      const latencyMs = Date.now() - started;
      const parsed =
        PROMPT_MODE === "showcase"
          ? parseShowcaseOutput(rawOutput, puzzle.requiredPlies)
          : parseBenchmarkOutput(rawOutput, puzzle.requiredPlies);
      const parsedLine = parsed.parsedLine;
      const correctStrict = parsedLine ? normalizeLine(parsedLine) === expectedLine : false;

      attempts.push({
        index: i,
        puzzleId: puzzle.puzzleId,
        track: puzzle.track,
        ratingBucket: puzzle.ratingBucket,
        sourceFen: promptContext.sourceFen,
        initialMove: puzzle.initialMove,
        currentFen: promptContext.currentFen,
        sideToMove: promptContext.sideToMove,
        expectedLine,
        rawOutput,
        parsedLine,
        parseStatus: parsed.parseStatus,
        formatValid: parsed.formatValid,
        correctStrict,
        thinkingText: parsed.thinkingText ?? apiReasoning ?? null,
        latencyMs,
        usage,
        responseError: null,
        ...(STORE_RAW_RESPONSE && providerResponse ? { providerResponse } : {}),
      });
      console.log(
        `[${i + 1}/${puzzles.length}] ${puzzle.puzzleId} ${puzzle.track} ${puzzle.ratingBucket} -> ${correctStrict ? "OK" : "MISS"}`
      );
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        index: i,
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
      });
      console.error(`[${i + 1}/${puzzles.length}] ${puzzle.puzzleId} failed: ${message}`);
    }
  }

  const summary = summarizeAttempts(attempts);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${hashShort(
    `${modelId}|${dataset.datasetId}|${promptProfile.version}|${runStart}`
  )}`;
  const provider = "openrouter";
  const result = {
    schemaVersion: "benchmark-run.v1",
    runId,
    createdAt: new Date().toISOString(),
    datasetId: dataset.datasetId ?? "unknown",
    modelId,
    modelName: modelDisplayName,
    benchmarkLabel: BENCHMARK_LABEL || null,
    provider,
    promptMode: PROMPT_MODE,
    promptVersion: promptProfile.version,
    promptFiles: {
      system: path.relative(process.cwd(), path.join(PROMPTS_DIR, promptProfile.systemFile)),
      user: path.relative(process.cwd(), path.join(PROMPTS_DIR, promptProfile.userFile)),
    },
    config: {
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      retries: RETRIES,
      limit: LIMIT,
      datasetPath: path.relative(process.cwd(), DATASET_PATH),
    },
    summary,
    attempts,
  };

  const modelResultsDir = path.join(RESULTS_DIR, sanitizeModelId(modelId));
  await mkdir(modelResultsDir, { recursive: true });
  const outputFile = path.join(
    modelResultsDir,
    `${runId}.${PROMPT_MODE}.json`
  );
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`Saved run: ${path.relative(process.cwd(), outputFile)}`);
  console.log(
    `Accuracy(strict): ${(summary.accuracyStrict * 100).toFixed(2)}% (${summary.correctStrict}/${summary.total})`
  );
  console.log(
    `Tokens prompt/completion/reasoning: ${summary.totalPromptTokens}/${summary.totalCompletionTokens}/${summary.totalReasoningTokens}`
  );
  console.log(`Total cost: ${summary.totalCost.toFixed(6)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
