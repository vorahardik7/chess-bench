import { Chess } from "chess.js";

/**
 * Parsing and grading for the v2 (Lichess-style, move-by-move) harness.
 *
 * Each turn the model answers with ONE move. It is judged exactly like the Lichess
 * puzzle UI (lila ui/puzzle/src/moveTest.ts):
 *   - a move that gives checkmate always wins the puzzle;
 *   - otherwise the move must equal the solution move (UCI, promotion piece included),
 *     with king-takes-rook castling (e1h1) accepted as the normal form (e1g1);
 *   - anything else fails the puzzle.
 * The opponent's replies come from the stored solution and are played by the harness,
 * never predicted by the model. (lichess-puzzler only enforces uniqueness on the
 * solver's moves; defender replies are just the engine's choice.)
 */

export type ParseResult = {
  /** Lowercase UCI as written by the model (not yet checked for legality). */
  move: string | null;
  parseStatus: string;
  formatValid: boolean;
};

export type MoveJudgement = {
  /** The model's move normalized against the position (castling alias applied), or null if illegal. */
  move: string | null;
  san: string | null;
  legal: boolean;
  correct: boolean;
  matchType: "exact" | "checkmate" | null;
  /** Position after the model's move (only when legal). */
  fenAfter: string | null;
};

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isUciMove(token: string): boolean {
  return UCI_RE.test(token);
}

export function normalizeLine(line: unknown): string {
  return String(line ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stripCodeFences(text: string): string {
  return text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
}

/** Strip markdown emphasis, "Answer:"-style labels and trailing punctuation from one line. */
function cleanAnswerLine(line: string): string {
  return line
    .replace(/[*_`>]/g, " ")
    .replace(/^\s*(?:final\s+answer|final\s+move|final|answer|best\s+move|move|solution|uci)\s*[:\-–]\s*/i, "")
    .replace(/[.;,!]+\s*$/, "")
    .trim();
}

function applyUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function normalizeSanToken(token: string): string {
  let t = token.replace(/[+#!?]+$/, "");
  if (/^0-0(-0)?$/.test(t)) t = t.replace(/0/g, "O");
  if (/^o-o(-o)?$/i.test(t)) return t.toUpperCase();
  if (/^[kqrbn][a-h1-8x]/i.test(t) && t.length > 1) t = t[0].toUpperCase() + t.slice(1);
  if (/=[qrbn]$/i.test(t)) t = t.slice(0, -1) + t.slice(-1).toUpperCase();
  return t;
}

const MOVE_TOKEN_RE =
  /^(?:[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNqrbn])?|[a-h][1-8][a-h][1-8][qrbn]?|[O0]-[O0](?:-[O0])?)[+#!?]*$/i;

/** A line that is exactly one move in SAN (or piece-prefixed long form), converted to UCI. */
function sanLineToUci(line: string, fen: string): string | null {
  const tokens = cleanAnswerLine(line)
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length !== 1 || !MOVE_TOKEN_RE.test(tokens[0])) return null;
  try {
    const move = new Chess(fen).move(normalizeSanToken(tokens[0]));
    return move.from + move.to + (move.promotion ?? "");
  } catch {
    return null;
  }
}

/**
 * Extract the single move the model answered with. First hit wins:
 *   1. ok            – the whole response is one lowercase UCI move
 *   2. last_line     – the last line that is one UCI move (analysis first, answer last)
 *   3. san_converted – the last line that is one SAN move, converted via the position
 *   4. loose         – exactly one UCI-shaped token anywhere in the response
 * Lines are scanned bottom-up so the model's final answer wins over moves it merely
 * mentioned while thinking out loud.
 */
export function parseMoveOutput(raw: unknown, fen: string): ParseResult {
  const cleaned = stripCodeFences(String(raw ?? ""));
  if (!cleaned) return { move: null, parseStatus: "missing", formatValid: false };

  const whole = normalizeLine(cleaned);
  if (isUciMove(whole)) return { move: whole, parseStatus: "ok", formatValid: true };

  const linesBottomUp = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of linesBottomUp) {
    const candidate = normalizeLine(cleanAnswerLine(line));
    if (isUciMove(candidate)) return { move: candidate, parseStatus: "last_line", formatValid: false };
  }

  for (const line of linesBottomUp) {
    const uci = sanLineToUci(line, fen);
    if (uci) return { move: uci, parseStatus: "san_converted", formatValid: false };
  }

  const looseTokens = cleaned.toLowerCase().match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ?? [];
  if (looseTokens.length === 1) return { move: looseTokens[0], parseStatus: "loose", formatValid: false };

  return {
    move: null,
    parseStatus: looseTokens.length > 1 ? "ambiguous" : "invalid_format",
    formatValid: false,
  };
}

const CASTLING_ALIASES: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

/** Play a UCI move, accepting king-takes-rook castling like Lichess does. Returns null if illegal. */
export function playMove(fen: string, uci: string) {
  if (!isUciMove(uci)) return null;
  const candidates = [uci];
  if (CASTLING_ALIASES[uci]) candidates.push(CASTLING_ALIASES[uci]);
  for (const candidate of candidates) {
    try {
      const chess = new Chess(fen);
      const move = applyUci(chess, candidate);
      if (candidate !== uci && !move.san.startsWith("O-O")) continue;
      return { chess, uci: move.from + move.to + (move.promotion ?? ""), san: move.san };
    } catch {
      // illegal in this form; try the next one
    }
  }
  return null;
}

export function uciToSan(fen: string, uci: string): string | null {
  return playMove(fen, uci)?.san ?? null;
}

export function judgeMove(fen: string, uci: string | null, expected: string): MoveJudgement {
  const none: MoveJudgement = { move: null, san: null, legal: false, correct: false, matchType: null, fenAfter: null };
  if (!uci) return none;
  const played = playMove(fen, uci);
  if (!played) return none;
  const base = { move: played.uci, san: played.san, legal: true, fenAfter: played.chess.fen() };
  if (played.uci === normalizeLine(expected)) return { ...base, correct: true, matchType: "exact" };
  if (played.chess.isCheckmate()) return { ...base, correct: true, matchType: "checkmate" };
  return { ...base, correct: false, matchType: null };
}

type AttemptLike = {
  parseStatus?: string;
  correctStrict?: boolean;
  firstMoveCorrect?: boolean;
  illegalMove?: boolean;
  matchType?: string | null;
  turns?: unknown[];
  latencyMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    cost?: number;
  };
};

/** Attempt statuses where no move could be read from the model's answer. */
export const UNPARSED_STATUSES = new Set(["missing", "invalid_format", "ambiguous", "truncated", "request_error"]);

export function summarizeAttempts(attempts: AttemptLike[]) {
  const total = attempts.length;
  const count = (fn: (a: AttemptLike) => boolean) => attempts.filter(fn).length;
  const sum = (fn: (a: AttemptLike) => number | undefined) =>
    attempts.reduce((acc, a) => acc + (Number(fn(a)) || 0), 0);

  const solved = count((a) => a.correctStrict === true);
  const parsed = total - count((a) => UNPARSED_STATUSES.has(String(a.parseStatus)));
  const firstMoveCorrect = count((a) => a.firstMoveCorrect === true);
  return {
    total,
    /** Puzzles where every move the model played was correct (the leaderboard score). */
    correctStrict: solved,
    accuracyStrict: total === 0 ? 0 : solved / total,
    parsed,
    accuracyParsed: parsed === 0 ? 0 : solved / parsed,
    /** Solved with a checkmate that differs from the stored solution move. */
    checkmateAlternatives: count((a) => a.matchType === "checkmate"),
    /** Informational: the first move was correct, regardless of later turns. */
    firstMoveCorrect,
    firstMoveAccuracy: total === 0 ? 0 : firstMoveCorrect / total,
    illegalMoves: count((a) => a.illegalMove === true),
    sanConverted: count((a) => a.parseStatus === "san_converted"),
    truncated: count((a) => a.parseStatus === "truncated"),
    requestErrors: count((a) => a.parseStatus === "request_error"),
    totalTurns: sum((a) => a.turns?.length ?? 0),
    totalPromptTokens: sum((a) => a.usage?.promptTokens),
    totalCompletionTokens: sum((a) => a.usage?.completionTokens),
    totalReasoningTokens: sum((a) => a.usage?.reasoningTokens),
    totalCost: sum((a) => a.usage?.cost),
    averageLatencyMs: total === 0 ? 0 : sum((a) => a.latencyMs) / total,
  };
}
