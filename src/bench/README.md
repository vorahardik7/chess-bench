# Bench Scripts

## Dataset

Generate fixed puzzle dataset:

```bash
pnpm run bench:fetch-puzzles
```

This writes:

- `src/bench/data/puzzles.v1.json`

## Run Benchmark (strict scoring)

```bash
OPENROUTER_API_KEY=... \
BENCH_MODEL_ID="openai/gpt-5.4-mini" \
BENCH_MODEL_NAME="GPT-5.4 Mini" \
pnpm run bench:run
```

Optional vars:

- `BENCH_PROMPT_MODE=benchmark|showcase` (default `benchmark`)
- `BENCH_MODEL_NAME="Gemini 3 Flash"`
- `BENCH_BENCHMARK_LABEL="Reasoning"`
- `BENCH_LIMIT=20`
- `BENCH_MAX_TOKENS=70`
- `BENCH_TEMPERATURE=0`
- `BENCH_STORE_RAW_RESPONSE=1`

Results are written to `src/bench/results/`.
