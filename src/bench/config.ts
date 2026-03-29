export type BenchmarkConfig = {
  modelId: string;
  modelName: string;
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
  modelId: "qwen/qwen3.5-122b-a10b",
  modelName: "Qwen 3.5 (122B)",
  providerOrder: ["novita/bf16"],
};

export default config;
