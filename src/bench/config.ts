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
  modelId: "openai/gpt-6-astra",
  variantId: "xhigh",
  modelName: "GPT-6 Astra",
  reasoningEffort: "xhigh",
  providerOrder: ["openai/flex"],
};

export default config;
