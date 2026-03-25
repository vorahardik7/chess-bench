# Bench Scripts

## Build Dataset

```bash
pnpm run bench:fetch-puzzles
```

Writes `src/bench/data/puzzles.json`.

## Run Benchmark

1. Pick model in `src/bench/config.ts`
2. Run:

```bash
OPENROUTER_API_KEY=... pnpm run bench:run
```

Env fallback/override (optional):
- `BENCH_MODEL_ID`
- `BENCH_MODEL_NAME`

Interrupted runs auto-resume on the next `bench:run` for the same model + dataset.

Results are written to `src/bench/results/`.
