/**
 * v2 prompts. The model plays one move per turn, like a human on Lichess: after each
 * correct move the harness plays the opponent's reply from the stored solution and
 * shows the new position. Nothing that could identify the puzzle (Lichess id, rating)
 * is included, so the model can't recall a memorized solution.
 */

export const SYSTEM_PROMPT = `You are solving chess puzzles taken from real games. In each puzzle one side has a winning tactic, and you play that side. You answer with one move at a time. After each correct move you are shown the opponent's reply and the new position, and you play your next move, until the puzzle is complete.

Answer format:
- Reply with exactly one move in lowercase UCI notation: the source square followed by the destination square, for example e2e4 or g1f3.
- Castling is written as the king's move: e1g1, e1c1, e8g8 or e8c8.
- Promotions add the piece letter: e7e8q, a2a1n.
- Do not use SAN or algebraic notation (Nf3, Qxe5, O-O). No move numbers, check symbols, punctuation, markdown or explanation.
- You may think before answering, but your final response must be only the move.`;

export type PositionView = {
  fen: string;
  sideToMove: string;
  boardAscii: string;
};

function describePosition(view: PositionView) {
  return `Position (FEN):
${view.fen}

Board (White's side at the bottom; uppercase = White, lowercase = Black):
${view.boardAscii}

${view.sideToMove} to move.`;
}

export function buildFirstTurnPrompt(input: {
  trackLabel: string | null;
  taskDescription: string;
  playerSide: string;
  lastMoveUci: string;
  lastMoveSan: string | null;
  position: PositionView;
}) {
  const typeLine = input.trackLabel ? `Puzzle type: ${input.trackLabel}\n` : "";
  const lastMove = input.lastMoveSan ? `${input.lastMoveUci} (${input.lastMoveSan})` : input.lastMoveUci;
  return `${typeLine}You play ${input.playerSide}. ${input.taskDescription}

Opponent's last move: ${lastMove}

${describePosition(input.position)}

Reply with your move in UCI.`;
}

export function buildFollowUpPrompt(input: {
  replyUci: string;
  replySan: string | null;
  position: PositionView;
}) {
  const reply = input.replySan ? `${input.replyUci} (${input.replySan})` : input.replyUci;
  return `Correct. The opponent replied ${reply}.

${describePosition(input.position)}

Reply with your next move in UCI.`;
}
