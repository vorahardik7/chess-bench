export type TrackId = 'mateIn1' | 'mateIn2' | 'fork' | 'pin' | 'hangingPiece' | string;

export type PuzzleView = {
  id: string;
  level: TrackId;
  fen: string;
  requiredPlies: number;
  rating: number | null;
  ratingBucket: string | null;
  expectedLine: string;
  initialMove: string;
  source?: {
    url?: string;
    gameUrl?: string;
  };
};

export type PuzzleAttemptView = {
  puzzleId: string;
  track: TrackId;
  expectedLine: string;
  expectedSanLine: string | null;
  parsedLine: string | null;
  sanLine: string | null;
  rawOutput: string;
  rawOutputTruncated: boolean;
  thinkingText: string | null;
  thinkingChars: number;
  parseStatus: string;
  formatValid: boolean;
  correctStrict: boolean;
  latencyMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cost: number;
  };
};

export type ModelView = {
  id: string;
  name: string;
  sublabel?: string;
  benchmarkLabel?: string | null;
  updatedAt: string | null;
  score: number;
  breakdown: Record<string, number>;
  summary: {
    total: number;
    correct: number;
    accuracy: number;
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalReasoningTokens: number;
    /** Mean wall-clock time per puzzle, all turns included; 0 when no attempt recorded a time. */
    avgLatencyMs: number;
    /** Mean output tokens (reasoning included) per puzzle. */
    avgCompletionTokens: number;
  };
  /**
   * One character per puzzle, in `puzzles` order.
   * `1` correct, `0` incorrect, `.` no attempt.
   * Lets the puzzle list paint without embedding every model's full attempts.
   */
  marks: string;
  /** Request settings the run actually used; null when the run file predates them. */
  runConfig: {
    temperature: number | null;
    maxTokens: number | null;
    reasoningEffort: string | null;
    /** Whether the prompt named the tactic ("Mate in 2", "Fork"). */
    revealTheme: boolean | null;
  };
  attemptsByPuzzleId: Record<string, PuzzleAttemptView>;
};

export type ExplorerResults = {
  datasetId: string | null;
  generatedAt: string | null;
  puzzles: PuzzleView[];
  models: ModelView[];
  runCount: number;
};
