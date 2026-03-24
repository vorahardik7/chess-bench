#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const SOURCE_URL =
  process.env.BENCH_LICHESS_PUZZLE_URL ??
  "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const OUTPUT_DIR = path.resolve(process.cwd(), "src/bench/data");
const CACHE_DIR = path.join(OUTPUT_DIR, ".cache");
const ZST_PATH = path.join(CACHE_DIR, "lichess_db_puzzle.csv.zst");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "puzzles.v1.json");
const TARGET_PER_STRATUM = Number(process.env.BENCH_PUZZLES_PER_STRATUM ?? 10);
const FORCE_FETCH = process.env.BENCH_FORCE_FETCH === "1";
const SEED_INPUT = process.env.BENCH_SEED ?? "20260322";

const TRACKS = [
  { id: "mateIn1", theme: "mateIn1" },
  { id: "mateIn2", theme: "mateIn2" },
  { id: "fork", theme: "fork" },
  { id: "pin", theme: "pin" },
  { id: "hangingPiece", theme: "hangingPiece" },
];

const RATING_BUCKETS = [
  { id: "800-1200", min: 800, maxExclusive: 1200 },
  { id: "1200-1600", min: 1200, maxExclusive: 1600 },
  { id: "1600-2000", min: 1600, maxExclusive: 2001 },
];

function assertPositiveInt(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }
}

function toSeedInt(input) {
  const hash = createHash("sha256").update(String(input)).digest();
  return hash.readUInt32BE(0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableHashInt(input) {
  const hash = createHash("sha1").update(input).digest();
  return hash.readUInt32BE(0);
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  fields.push(current);
  return fields;
}

function runCommand(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: opts.stdio ?? "inherit",
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...opts.env },
    });

    child.on("error", (error) => {
      reject(
        new Error(`Failed to run "${bin} ${args.join(" ")}": ${error.message}`)
      );
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `"${bin} ${args.join(" ")}" exited with code ${code ?? "null"} and signal ${signal ?? "null"}`
        )
      );
    });
  });
}

async function ensureToolAvailable(bin) {
  try {
    await runCommand(bin, ["--version"], { stdio: "ignore" });
  } catch (error) {
    throw new Error(
      `Required tool "${bin}" is missing. Install it and retry. Original error: ${error.message}`
    );
  }
}

async function downloadPuzzleDump() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(ZST_PATH) && !FORCE_FETCH) {
    const existingBytes = statSync(ZST_PATH).size;
    console.log(
      `Using cached dump ${path.relative(process.cwd(), ZST_PATH)} (${existingBytes.toLocaleString()} bytes).`
    );
    return;
  }

  const tmpPath = `${ZST_PATH}.part`;
  console.log(`Downloading puzzle dump from ${SOURCE_URL}`);
  await runCommand("curl", [
    "-fL",
    "--retry",
    "5",
    "--retry-delay",
    "2",
    "--retry-all-errors",
    "--continue-at",
    "-",
    "-o",
    tmpPath,
    SOURCE_URL,
  ]);
  await rename(tmpPath, ZST_PATH);
  const bytes = statSync(ZST_PATH).size;
  console.log(`Saved ${path.relative(process.cwd(), ZST_PATH)} (${bytes.toLocaleString()} bytes).`);
}

function ratingBucketFor(rating) {
  for (const bucket of RATING_BUCKETS) {
    if (rating >= bucket.min && rating < bucket.maxExclusive) return bucket;
  }
  return null;
}

function chooseNonMateTrack(themes, puzzleId) {
  const candidates = [];
  if (themes.has("fork")) candidates.push("fork");
  if (themes.has("pin")) candidates.push("pin");
  if (themes.has("hangingPiece")) candidates.push("hangingPiece");
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const index = stableHashInt(puzzleId) % candidates.length;
  return candidates[index];
}

function classifyTrack(themes, puzzleId) {
  if (themes.has("mateIn1")) return "mateIn1";
  if (themes.has("mateIn2")) return "mateIn2";

  const hasMateTheme = Array.from(themes).some(
    (theme) => theme === "mate" || theme.startsWith("mateIn")
  );
  if (hasMateTheme) return null;

  return chooseNonMateTrack(themes, puzzleId);
}

function reservoirPush(state, sample, random) {
  state.seen += 1;
  if (state.samples.length < TARGET_PER_STRATUM) {
    state.samples.push(sample);
    return;
  }
  const index = Math.floor(random() * state.seen);
  if (index < TARGET_PER_STRATUM) {
    state.samples[index] = sample;
  }
}

function initStrata() {
  const strata = new Map();
  for (const track of TRACKS) {
    for (const bucket of RATING_BUCKETS) {
      const key = `${track.id}|${bucket.id}`;
      strata.set(key, {
        track: track.id,
        bucket: bucket.id,
        seen: 0,
        samples: [],
      });
    }
  }
  return strata;
}

function parseMoves(movesRaw) {
  return movesRaw
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseIntOrNull(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function makePuzzleRecord({
  puzzleId,
  fen,
  moves,
  rating,
  ratingDeviation,
  popularity,
  nbPlays,
  themes,
  gameUrl,
  openingTags,
  track,
  bucket,
}) {
  const requiredPlies = moves.length - 1;
  return {
    puzzleId,
    track,
    ratingBucket: bucket.id,
    rating,
    ratingDeviation,
    popularity,
    nbPlays,
    fen,
    initialMove: moves[0],
    expectedLine: moves.slice(1).join(" "),
    requiredPlies,
    themes: [...themes].sort(),
    puzzleUrl: `https://lichess.org/training/${puzzleId}`,
    gameUrl,
    openingTags: openingTags ? openingTags.split(/\s+/).filter(Boolean) : [],
  };
}

async function samplePuzzlesFromDump() {
  const strata = initStrata();
  const random = mulberry32(toSeedInt(SEED_INPUT));
  const decompressor = spawn("zstd", ["-dc", ZST_PATH], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  const exitPromise = new Promise((resolve, reject) => {
    decompressor.on("error", (error) => {
      reject(new Error(`zstd failed to start: ${error.message}`));
    });
    decompressor.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`zstd exited with code ${code ?? "null"} and signal ${signal ?? "null"}`)
      );
    });
  });

  const rl = readline.createInterface({
    input: decompressor.stdout,
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  let candidateCount = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (lineNo === 1 && line.startsWith("PuzzleId,")) {
      continue;
    }

    const fields = parseCsvLine(line);
    if (fields.length < 10) continue;

    const [
      puzzleId,
      fen,
      movesRaw,
      ratingRaw,
      rdRaw,
      popularityRaw,
      playsRaw,
      themesRaw,
      gameUrl,
      openingTags,
    ] = fields;

    const rating = Number.parseInt(ratingRaw, 10);
    if (!Number.isFinite(rating)) continue;
    const bucket = ratingBucketFor(rating);
    if (!bucket) continue;

    const moves = parseMoves(movesRaw);
    if (moves.length < 2) continue;
    const requiredPlies = moves.length - 1;
    if (requiredPlies > 3) continue;

    const themes = new Set(themesRaw.trim().split(/\s+/).filter(Boolean));
    const shortPuzzle = themes.has("oneMove") || themes.has("short");
    if (!shortPuzzle) continue;
    if (themes.has("long") || themes.has("veryLong")) continue;

    const track = classifyTrack(themes, puzzleId);
    if (!track) continue;

    const key = `${track}|${bucket.id}`;
    const state = strata.get(key);
    if (!state) continue;

    const record = makePuzzleRecord({
      puzzleId,
      fen,
      moves,
      rating,
      ratingDeviation: parseIntOrNull(rdRaw),
      popularity: parseIntOrNull(popularityRaw),
      nbPlays: parseIntOrNull(playsRaw),
      themes,
      gameUrl,
      openingTags,
      track,
      bucket,
    });

    reservoirPush(state, record, random);
    candidateCount += 1;

    if (lineNo % 500000 === 0) {
      console.log(`Processed ${lineNo.toLocaleString()} lines (${candidateCount.toLocaleString()} candidate rows).`);
    }
  }

  await exitPromise;

  const shortages = [];
  for (const state of strata.values()) {
    if (state.samples.length < TARGET_PER_STRATUM) {
      shortages.push(
        `${state.track} @ ${state.bucket}: have ${state.samples.length}, need ${TARGET_PER_STRATUM} (seen ${state.seen})`
      );
    }
  }
  if (shortages.length > 0) {
    throw new Error(
      `Not enough puzzles for at least one stratum.\n${shortages.join("\n")}`
    );
  }

  return { strata, lineNo, candidateCount };
}

function buildManifest(strata) {
  const puzzles = [];
  for (const track of TRACKS) {
    for (const bucket of RATING_BUCKETS) {
      const key = `${track.id}|${bucket.id}`;
      const state = strata.get(key);
      const picked = [...state.samples].sort((a, b) =>
        a.puzzleId.localeCompare(b.puzzleId)
      );
      puzzles.push(...picked);
    }
  }

  const signature = puzzles
    .map((p) => `${p.track}|${p.ratingBucket}|${p.puzzleId}`)
    .join("\n");
  const datasetHash = createHash("sha256").update(signature).digest("hex").slice(0, 12);

  return {
    datasetId: `lichess-v1-${datasetHash}`,
    generatedAt: new Date().toISOString(),
    source: {
      url: SOURCE_URL,
      dumpPath: path.relative(process.cwd(), ZST_PATH),
      dumpSizeBytes: statSync(ZST_PATH).size,
    },
    config: {
      seed: String(SEED_INPUT),
      targetPerTrackBucket: TARGET_PER_STRATUM,
      tracks: TRACKS.map((t) => t.id),
      ratingBuckets: RATING_BUCKETS.map((b) => ({
        id: b.id,
        min: b.min,
        maxExclusive: b.maxExclusive,
      })),
      filters: {
        maxRequiredPlies: 3,
        requiresLengthThemeAnyOf: ["oneMove", "short"],
        excludesLengthThemeAnyOf: ["long", "veryLong"],
      },
    },
    puzzles,
  };
}

async function main() {
  assertPositiveInt("BENCH_PUZZLES_PER_STRATUM", TARGET_PER_STRATUM);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  await ensureToolAvailable("curl");
  await ensureToolAvailable("zstd");
  await downloadPuzzleDump();

  console.log("Sampling puzzles...");
  const { strata, lineNo, candidateCount } = await samplePuzzlesFromDump();
  const manifest = buildManifest(strata);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Done. Wrote ${manifest.puzzles.length} puzzles to ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
  console.log(
    `Dataset ${manifest.datasetId} from ${lineNo.toLocaleString()} rows (${candidateCount.toLocaleString()} candidate rows).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
