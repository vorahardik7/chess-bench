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
  modelId: "anthropic/claude-sonnet-4.6",
  modelName: "Claude Sonnet 4.6",
  providerOrder: ["Anthropic"],
};
```

Then run:

```bash
OPENROUTER_API_KEY=your_key_here pnpm run bench:run
```

Start the UI:

```bash
pnpm dev
```

Open:
- `http://localhost:3000/puzzle`
- `http://localhost:3000/benchmark`

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

## Outputs

- Dataset: `src/bench/data/puzzles.json`
- Runs: `src/bench/results/<model>/...benchmark.json`
- Prompt template: `src/bench/prompt.ts`

`BENCH_MODEL_ID` and `BENCH_MODEL_NAME` env vars can still be used as fallback/override for scripting.
