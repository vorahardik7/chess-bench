import type { Key } from '@lichess-org/chessground/types';
import { read, write } from '@lichess-org/chessground/fen';

const PROMOTION_ROLE_MAP = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
} as const;

export function asKey(square: string): Key {
  return square as Key;
}

function fileIndex(square: string): number {
  return square.charCodeAt(0) - 97;
}

function flipTurn(turn: string): 'w' | 'b' {
  return turn === 'b' ? 'w' : 'b';
}

export function applyUciToFen(fen: string, move?: string): string | null {
  if (!fen || !move || move.length < 4) return null;

  const [boardPart, activeColor = 'w', , , halfmove = '0', fullmove = '1'] = fen.trim().split(/\s+/);
  const from = move.slice(0, 2) as Key;
  const to = move.slice(2, 4) as Key;
  const promotion = move[4]?.toLowerCase() as keyof typeof PROMOTION_ROLE_MAP | undefined;
  const pieces = read(boardPart);
  const piece = pieces.get(from);

  if (!piece) return null;

  const nextPieces = new Map(pieces);
  nextPieces.delete(from);

  if (
    piece.role === 'pawn' &&
    from[0] !== to[0] &&
    !nextPieces.has(to)
  ) {
    const captureSquare = `${to[0]}${from[1]}` as Key;
    nextPieces.delete(captureSquare);
  }

  if (piece.role === 'king' && Math.abs(fileIndex(from) - fileIndex(to)) === 2) {
    const isKingSide = fileIndex(to) > fileIndex(from);
    const rookFrom = `${isKingSide ? 'h' : 'a'}${from[1]}` as Key;
    const rookTo = `${isKingSide ? 'f' : 'd'}${from[1]}` as Key;
    const rook = nextPieces.get(rookFrom);

    if (rook?.role === 'rook' && rook.color === piece.color) {
      nextPieces.delete(rookFrom);
      nextPieces.set(rookTo, rook);
    }
  }

  const movedPiece =
    promotion && piece.role === 'pawn'
      ? { ...piece, role: PROMOTION_ROLE_MAP[promotion] }
      : piece;

  nextPieces.set(to, movedPiece);

  return `${write(nextPieces)} ${flipTurn(activeColor)} - - ${halfmove} ${fullmove}`;
}

export function getDisplayFen(fen: string, initialMove?: string): string {
  return applyUciToFen(fen, initialMove) ?? fen;
}

export function uciLineToSan(fen: string, uciLine: string): string {
  void fen;
  if (!uciLine.trim()) return '';
  return uciLine;
}

export function getModelLogoPath(modelId: string): string | null {
  const provider = modelId.split('/')[0];
  
  const logoMap: Record<string, string> = {
    'x-ai': 'xai',
    'google': 'google',
    'openai': 'openai',
    'anthropic': 'anthropic',
    'mistralai': 'mistral',
    'nex-agi': 'deepseek',
    'deepseek': 'deepseek',
    'xiaomi': 'ai2-color',
    'allenai': 'ai2-color',
    'z-ai': 'zai',
    'qwen': 'qwen',
  };
  
  const logoName = logoMap[provider];
  if (!logoName) return null;
  
  return `/model_icons/${logoName}.svg`;
}
