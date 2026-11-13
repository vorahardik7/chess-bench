export type BenchmarkConfig = {
  /**
   * Base model id / API slug (e.g. OpenRouter model id).
   * When variantId is set, results are saved under `${modelId}-${variantId}`.
   */
  modelId: string;
  /**
   * API model slug. Leave undefined when the public id is also the provider slug.
   */
  apiModelId?: string;
  /**
   * Optional suffix for the public results id when running the same base model
   * under different settings (e.g. reasoning effort). Saved as `${modelId}-${variantId}`.
   */
  variantId?: string;
  modelName: string;
  apiProvider?: "openrouter" | "sakana";
  apiBaseUrl?: string;
  reasoningEffort?: string;
  /**
   * Sampling temperature. Leave unset (provider default) for published runs: OpenAI and
   * Anthropic reasoning models don't accept it, and Google documents it as ignored for
   * current Gemini models, so setting it would only affect some vendors.
   */
  temperature?: number;
  /**
   * Show the puzzle theme ("Mate in 2", "Fork", ...) and a theme-specific task in the
   * prompt. Default true. false = Lichess rated-puzzle conditions ("Find the best move.").
   */
  revealTheme?: boolean;
  supportedParams?: string[];
  /**
   * max_tokens for every request/turn (reasoning + answer). Defaults to 32768 for reasoning
   * models and 4096 otherwise. Keep it the same across runs you compare: on OpenRouter,
   * Anthropic's thinking budget is a share of this value (medium 50%, high 80%,
   * xhigh/max 95%), so changing it changes how much those models think.
   */
  maxTokens?: number;
  /** Per-request (per-turn) timeout. Defaults to 600000 (10 min); xhigh/max reasoning can be slow. */
  requestTimeoutMs?: number;
  /**
   * By default a run with request errors is not saved as final; the checkpoint is kept so
   * the next `bench:run` retries only the failed puzzles. Set true to save it anyway
   * (errors scored as misses). Env: BENCH_FINALIZE_WITH_ERRORS=1.
   */
  finalizeWithErrors?: boolean;
  /**
   * Forces OpenRouter to route through a specific provider (uses your BYOK key for that provider).
   * Required if you have BYOK set up and want to avoid OpenRouter shared credits.
   *
   * Common provider slugs:
   *   Anthropic models  → "Anthropic"
   *   Google AI Studio  → "Google AI Studio"
   *   Google Vertex AI  → "Google Vertex AI"
   *   OpenAI            → "OpenAI"
   *   Azure OpenAI      → "Azure"
   *   Meta (via BYOK)   → "Together" | "Fireworks" | "DeepInfra"
   *
   * Leave undefined to let OpenRouter auto-route (will use shared credits if BYOK isn't forced).
   */
  providerOrder?: string[];
};

const config: BenchmarkConfig = {
  apiProvider: "openrouter",
  modelId: "google/gemini-4-hydrogen",
  variantId: "high",
  modelName: "Gemini 4 Hydrogen [high]",
  reasoningEffort: "high",
  requestTimeoutMs: 1800000,
  providerOrder: ["google-vertex/global"],
};

export default config;
