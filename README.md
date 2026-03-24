# chess-bench

`chess-bench` is a small project for testing how well language models solve short Lichess puzzles.

The benchmark focuses on simple tactical puzzles like:

- mate in 1
- mate in 2
- fork
- pin
- hanging piece

The idea is simple:

1. fetch a fixed set of puzzles from the Lichess puzzle dump
2. run one model against that set
3. save the answers, tokens, cost, and accuracy
4. view the results in the app

## What It Does

This project gives each model the same puzzle set and checks whether the model's final UCI move line matches the expected Lichess answer.

It also stores:

- raw model output
- parsed move line
- prompt tokens
- completion tokens
- reasoning tokens if the provider returns them
- cost
- latency

## Fetch Puzzles

Fetch the benchmark puzzle set once with:

```bash
pnpm run bench:fetch-puzzles
```

This builds the local puzzle file used by the benchmark.

## Run A Benchmark

To run one model, you only need:

- `OPENROUTER_API_KEY`
- `BENCH_MODEL_ID`

Example:

```bash
OPENROUTER_API_KEY=your_key_here \
BENCH_MODEL_ID="google/gemini-2.5-flash" \
pnpm run bench:run
```

If you want a cleaner display name in the UI, you can also set:

```bash
OPENROUTER_API_KEY=your_key_here \
BENCH_MODEL_ID="google/gemini-2.5-flash" \
BENCH_MODEL_NAME="Gemini 2.5 Flash" \
pnpm run bench:run
```

## View Results

Start the app with:

```bash
pnpm dev
```

Then open:

- `http://localhost:3000/puzzle`
- `http://localhost:3000/benchmark`

The puzzle page shows individual puzzle responses.

The benchmark page shows the leaderboard, per-track scores, cost, and tokens.

## Notes

- Results are saved under `src/bench/results/`
- The fetched raw puzzle dump is not committed
- The prompt lives in `src/bench/prompt.ts`
- The benchmark is meant for short puzzles, not long chess analysis
