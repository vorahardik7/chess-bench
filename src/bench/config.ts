export type BenchmarkConfig = {
  /**
   * Public model id used in ChessBench results and routes.
   */
  modelId: string;
  /**
   * API model slug. Leave undefined when the public id is also the provider slug.
   */
  apiModelId?: string;
  modelName: string;
  apiProvider?: "openrouter" | "sakana";
  apiBaseUrl?: string;
  reasoningEffort?: string;
  supportedParams?: string[];
  requestTimeoutMs?: number;
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
  modelId: "anthropic/claude-sonnet-5",
  // apiModelId: "claude-sonnet-5",
  modelName: "Claude Sonnet 5",
  reasoningEffort: "medium",
  providerOrder: ["anthropic"]
};

export default config;
