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
SAKANA_API_KEY=... pnpm run bench:run
```

For OpenRouter runs, set `apiProvider: "openrouter"` in `src/bench/config.ts` and use `OPENROUTER_API_KEY`.

Env fallbacks (optional):
- `BENCH_API_PROVIDER`
- `BENCH_MODEL_ID`
- `BENCH_API_MODEL_ID`
- `BENCH_MODEL_NAME`
- `BENCH_REASONING_EFFORT`

Interrupted runs auto-resume on the next `bench:run` for the same model + dataset.

Results are written to `src/bench/results/`.
Sakana runs leave `usage.cost` as `0` so billed cost can be filled in manually afterward.
