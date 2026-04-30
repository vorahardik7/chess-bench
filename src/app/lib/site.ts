import "server-only";

const DEFAULT_SITE_URL = "http://localhost:3000";

export const SITE_NAME = "ChessBench";
export const SITE_DESCRIPTION =
  "ChessBench benchmarks large language models on Lichess chess puzzles using strict UCI move output and a fixed public dataset.";

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeSiteUrl(candidate);
    }
  }

  return DEFAULT_SITE_URL;
}

export function toAbsoluteUrl(pathname = "/"): string {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}

export function splitModelId(modelId: string): {
  provider: string;
  model: string;
} {
  const [provider, ...rest] = modelId.split("/");
  if (!provider) {
    return { provider: "model", model: "unknown" };
  }
  if (rest.length === 0) {
    return { provider: "model", model: provider };
  }
  return {
    provider,
    model: rest.join("/"),
  };
}

export function modelIdFromParams(provider: string, model: string): string {
  if (provider === "model") {
    return model;
  }
  return `${provider}/${model}`;
}

export function getModelRoute(modelId: string): string {
  const { provider, model } = splitModelId(modelId);
  return `/models/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`;
}

export function formatTrackLabel(level: string): string {
  if (level === "mate1" || level === "mateIn1") return "Mate in 1";
  if (level === "mate2" || level === "mateIn2") return "Mate in 2";
  if (level === "hangingPiece") return "Hanging piece";
  return level
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTrackDescription(level: string): string {
  if (level === "mate1" || level === "mateIn1") {
    return "Solve a forced mate in one move.";
  }
  if (level === "mate2" || level === "mateIn2") {
    return "Solve a forced mate in two moves.";
  }
  if (level === "fork") {
    return "Find the tactical line that creates a fork.";
  }
  if (level === "pin") {
    return "Find the tactical line that exploits a pin.";
  }
  if (level === "hangingPiece") {
    return "Find the line that wins an undefended piece.";
  }
  return "Find the best tactical line from the benchmark position.";
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
