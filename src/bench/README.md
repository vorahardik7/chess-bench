# Bench Scripts

## Versions

| Version | Where | Protocol |
|---|---|---|
| v1 | git tag `bench-v1`, results in `src/bench/results/` | One reply per puzzle containing the whole line, including the opponent's replies. 8192 max_tokens. Kept as published; superseded. |
| v2 | this code, results in `src/bench/results-v2/` | Lichess-style, one move per turn (below). |

Runs from different versions are not comparable. Bump `HARNESS_VERSION` in
`run-benchmark.ts` whenever anything that can change a score changes (prompt,
parsing, grading, protocol), and re-run everything you publish together.

## Build Dataset

```bash
pnpm run bench:fetch-puzzles
```

Writes `src/bench/data/puzzles.json`: 150 Lichess puzzles, 10 per track
(mate in 1, mate in 2, fork, pin, hanging piece) per rating bucket
(1200-1600, 1600-2000, 2000-2400), reservoir-sampled with a fixed seed from the cached
dump (its sha256 is recorded in the manifest).

Only short puzzles (at most 3 plies, Lichess `oneMove`/`short` theme) whose rating has
settled and that players rate well: rating deviation <= 80, played >= 1000 times,
popularity >= 80. Low-popularity puzzles are the ones with disputed or alternative
solutions. The first v2 dataset (`lichess-6df9cced576f`, 800-2000, no quality filter) was
replaced because models scored 92-98% in its 800-1200 bucket; short puzzles above 2400 are
too rare to fill every track.

## Run Benchmark

1. Pick model in `src/bench/config.ts`
2. Commit any harness changes first: each run records the git commit and whether
   the harness files had uncommitted changes (`harnessFilesDirty`).
3. Run:

```bash
OPENROUTER_API_KEY=... pnpm run bench:run
```

For Sakana runs, set `apiProvider: "sakana"` and use `SAKANA_API_KEY`.

Env fallbacks (optional): `BENCH_API_PROVIDER`, `BENCH_MODEL_ID`, `BENCH_VARIANT_ID`,
`BENCH_API_MODEL_ID`, `BENCH_MODEL_NAME`, `BENCH_REASONING_EFFORT`.

Use `variantId` when benchmarking the same base model under different settings
(for example `reasoningEffort: "medium"` vs `"high"`). Results are saved under
`${modelId}-${variantId}` so each run appears separately on the leaderboard.

Before any puzzle runs, the harness checks the model against OpenRouter `/models`
and stops if the model is unknown, the reasoning effort isn't in its
`supported_efforts` (OpenRouter would otherwise silently map e.g. xhigh to high),
`maxTokens` exceeds its output limit, or `temperature` is set for a model that
doesn't accept it. Errors that would hit every puzzle (400/401/402/403/404) stop the
run immediately.

### Resuming and errors

Interrupted runs resume on the next `bench:run` for the same model + dataset.
Puzzles that failed with a request error (timeout, 5xx, empty or errored provider
response, each retried with backoff first) are retried on resume, and a run with
request errors is not saved as final until they succeed (set
`BENCH_FINALIZE_WITH_ERRORS=1` to save it anyway, errors scored as misses). Resuming
is refused if the harness code, `maxTokens`, effort, model, provider routing,
temperature or `revealTheme` changed, so one run never mixes settings.

### Cost

Each run saves the model's standard per-token price from OpenRouter `/models`
(`config.model.pricing`). The site shows cost as tokens x that price for every run, so
runs routed to a discounted endpoint or billed through BYOK compare fairly; the amount
actually billed stays in each turn's `usage.cost` and `summary.totalCost`. Runs without a
saved price (e.g. Sakana) show the billed cost.

### Token budget

`maxTokens` (default 32768 for reasoning models) caps reasoning + answer for each
turn. Answers that hit it are recorded as `truncated` and score as misses, so check
the "truncated at max_tokens" count at the end of a run. Keep the value the same
across runs you compare: OpenRouter sets Anthropic's thinking budget to a share of it
(medium 50%, high 80%, xhigh/max 95%).

## Protocol (v2)

This mirrors how a person solves a puzzle on Lichess.

1. The model sees the position after the opponent's setup move: FEN, an ASCII board,
   the side it plays, the opponent's last move and (unless `revealTheme: false`) the
   puzzle theme. Nothing that identifies the puzzle (Lichess id, rating) is shown.
2. It answers with one move in UCI.
3. If the move is correct and the solution continues, the harness plays the
   opponent's reply from the stored Lichess solution, shows the new position in the
   same conversation, and asks for the next move.
4. The puzzle is solved only if every move the model plays is correct.

The opponent's replies are never predicted by the model. Lichess's generator
(lichess-puzzler) checks that the solver's moves are clearly the only good moves,
but the defender's replies are just the engine's choice and often one of many, so
requiring them would grade the model on guessing that choice.

Reasoning from earlier turns is not passed back (OpenRouter only requires that for
tool calling); every turn shows the full current position instead. Sampling
parameters are left at provider defaults for every model.

## Scoring (v2)

Moves are judged like the Lichess puzzle UI (`lila ui/puzzle/src/moveTest.ts`):

- any move that gives checkmate solves the puzzle;
- otherwise the move must equal the solution move, promotion piece included
  (underpromotion must match; a promotion without a piece is illegal);
- king-takes-rook castling (`e1h1`) is accepted as normal castling (`e1g1`).

The answer is read from the reply in this order (first hit wins): the whole reply
is one UCI move (`ok`), the last line that is one UCI move (`last_line`), the last
line that is one SAN move (`san_converted`), exactly one UCI-shaped token anywhere
(`loose`). Failures: `missing` (blank), `ambiguous` (several moves, none on its own
line), `invalid_format`, `truncated` (hit max_tokens), `illegal_move`,
`request_error`.

Each attempt stores every turn (`turns[]`: position, prompt, raw reply, parsed move,
legality, correctness, finish reason, the provider and model version that actually
served it, usage). The summary reports `accuracyStrict` (solved / total, the
leaderboard score), `firstMoveAccuracy`, `checkmateAlternatives`, `illegalMoves`,
`truncated` and `requestErrors`; the run records `servedBy` and full provenance in
`config` (harness version and hash, git commit, model metadata).
