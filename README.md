# chess-bench

`chess-bench` benchmarks LLMs on short Lichess tactics using a fixed dataset.

Tracks:
- mate in 1
- mate in 2
- fork
- pin
- hanging piece

## Quick Start

```bash
pnpm install
pnpm run bench:fetch-puzzles
```

Set your model in `src/bench/config.ts`:

```ts
const config = {
  apiProvider: "sakana",
  modelId: "sakana/fugu-ultra",
  apiModelId: "fugu-ultra",
  modelName: "Fugu Ultra",
  reasoningEffort: "high",
};
```

Then run:

```bash
SAKANA_API_KEY=your_key_here pnpm run bench:run
```

For OpenRouter runs, set `apiProvider: "openrouter"` and use `OPENROUTER_API_KEY`.

Start the UI:

```bash
pnpm dev
```

Open `http://localhost:3000` and use the in-app tabs (instant switch). Deep links: `/?tab=benchmark`. Legacy paths `/puzzle` and `/benchmark` redirect to the same UI.

## How Scoring Works

Harness v2 plays each puzzle like Lichess: the model gives one UCI move per turn, and
after each correct move the opponent's reply from the stored solution is played and the
model is asked again. A move counts if it is the solution move or gives checkmate.

- `accuracyStrict` = puzzles solved / all puzzles (the leaderboard score).
- `firstMoveAccuracy` = first move correct / all puzzles.
- Answers are read as: the whole reply is one move, else the last line that is one move,
  else a SAN move converted with the board, else the only UCI move in the text. Blank,
  ambiguous, unreadable, illegal and truncated answers score as misses. No repair calls.
- Interrupted runs auto-resume; requests that failed are retried before a run is saved.
- Sakana runs leave `usage.cost` as `0`; add the billed cost manually afterward if needed.

Full details: [`src/bench/README.md`](src/bench/README.md). v1 results (whole line in one
reply) are kept at git tag `bench-v1` and are not comparable with v2.

## Outputs

- Dataset: `src/bench/data/puzzles.json`
- Runs: `src/bench/results-v2/<model>/...benchmark.json`
- Prompt: `src/bench/prompt.ts`; parsing and grading: `src/bench/scoring.ts`

`BENCH_API_PROVIDER`, `BENCH_MODEL_ID`, `BENCH_VARIANT_ID`, `BENCH_API_MODEL_ID`, `BENCH_MODEL_NAME`, and `BENCH_REASONING_EFFORT` env vars can still be used as fallbacks for scripting.
