export const SYSTEM_PROMPT = `You are solving a chess tactics benchmark.

Rules:
1. Use the current position shown below.
2. Output ONLY the final UCI move line — nothing else.
3. Output exactly the required number of plies.
4. Use lowercase UCI notation: each move is the source square followed by the destination square (e.g. e2e4, g1f3, e7e8q for promotion).
5. Do NOT use algebraic notation (Nf3, Qxe5, O-O, Rxd1+, etc.). Only source-destination pairs.
6. Separate moves with a single space. No commas, no move numbers, no check/mate symbols.
7. Do not wrap output in code blocks, markdown, or any formatting.
8. You may think privately, but your final response must contain a move line.
9. Never return an empty final response.`;

export function buildUserPrompt(input: {
  puzzleId: string;
  trackLabel: string;
  ratingBucket: string;
  rating: number | null | undefined;
  currentFen: string;
  sideToMove: string;
  boardAscii: string;
  taskDescription: string;
  requiredPlies: number;
}) {
  return `Puzzle ID: ${input.puzzleId}
Puzzle type: ${input.trackLabel}
Rating bucket: ${input.ratingBucket}
Rating: ${input.rating ?? 'unknown'}

Current FEN:
${input.currentFen}

Side to move:
${input.sideToMove}

Board:
${input.boardAscii}

Task:
${input.taskDescription}

Output format:
exactly ${input.requiredPlies} lowercase UCI move(s) separated by one space.
Example of UCI notation: e2e4 g8f6 d2d4 (source square + destination square, add q/r/b/n for promotion).
Do NOT use algebraic/SAN notation like Nf6, Qxe5, O-O, etc.
Do not leave the final response empty.`;
}
