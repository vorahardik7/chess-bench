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

- Prompt asks for final answer as UCI move line.
- `Accuracy(strict)` = exact expected UCI line match across all puzzles.
- `Accuracy(parsed)` = exact match only among parsed outputs.
- `Parse rate` = parseable outputs / total outputs.
- Parser can recover:
  - strict UCI
  - loose UCI extraction
  - SAN -> UCI conversion

Notes:
- If model supports reasoning, benchmark enables it automatically.
- If a response has no valid final move line, benchmark does one short repair call asking for move-only output.
- Interrupted runs auto-resume from an in-progress checkpoint for the same model + dataset.
- Sakana runs leave `usage.cost` as `0`; add the billed cost manually afterward if needed.

## Outputs

- Dataset: `src/bench/data/puzzles.json`
- Runs: `src/bench/results/<model>/...benchmark.json`
- Prompt template: `src/bench/prompt.ts`

`BENCH_API_PROVIDER`, `BENCH_MODEL_ID`, `BENCH_VARIANT_ID`, `BENCH_API_MODEL_ID`, `BENCH_MODEL_NAME`, and `BENCH_REASONING_EFFORT` env vars can still be used as fallbacks for scripting.
