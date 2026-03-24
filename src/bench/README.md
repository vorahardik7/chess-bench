# Bench Scripts

## Dataset

Generate fixed puzzle dataset:

```bash
pnpm run bench:fetch-puzzles
```

This writes:

- `src/bench/data/puzzles.json`

## Run Benchmark (strict scoring)

```bash
OPENROUTER_API_KEY=... \
BENCH_MODEL_ID="openai/gpt-5.4-mini" \
BENCH_MODEL_NAME="GPT-5.4 Mini" \
pnpm run bench:run
```

Optional vars:

- `BENCH_MODEL_NAME="Gemini 3 Flash"`

Results are written to `src/bench/results/`.
