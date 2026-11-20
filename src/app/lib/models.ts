export type ModelFamilyInfo = {
  key: string;
  name: string;
  effort: string | null;
  provider: string;
};

/**
 * Splits a variant display name like "GPT-6 Astra [high]" into its base model
 * family ("GPT-6 Astra") and optional reasoning effort ("high").
 */
export function parseModelFamily(model: { id: string; name: string }): ModelFamilyInfo {
  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(model.name);
  const provider = model.id.split('/')[0] ?? '';
  const name = match ? match[1] : model.name;
  return {
    key: `${provider}:${name}`,
    name,
    effort: match ? match[2] : null,
    provider,
  };
}

/** Number of distinct base models across all reasoning-effort variants. */
export function countBaseModels(models: { id: string; name: string }[]): number {
  const keys = new Set<string>();
  for (const model of models) {
    keys.add(parseModelFamily(model).key);
  }
  return keys.size;
}
