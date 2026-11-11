/**
 * Attempt-level parse statuses written by the v2 bench runner (see src/bench/scoring.ts).
 * Readable: `ok` (the reply is just the move), `last_line` (the last line holding one move),
 * `san_converted` (an algebraic move converted with the board), `loose` (the only move in
 * the text). Failures end the puzzle as a miss.
 */
export type ParseGroup =
  | 'ok'
  | 'last_line'
  | 'san_converted'
  | 'loose'
  | 'illegal_move'
  | 'ambiguous'
  | 'invalid_format'
  | 'missing'
  | 'truncated'
  | 'request_error';

const READABLE = new Set<ParseGroup>(['ok', 'last_line', 'san_converted', 'loose']);
const FAILURES = new Set<ParseGroup>(['illegal_move', 'ambiguous', 'invalid_format', 'missing', 'truncated', 'request_error']);

export function parseGroupOf(status: string): ParseGroup {
  const group = status as ParseGroup;
  if (READABLE.has(group) || FAILURES.has(group)) return group;
  return 'invalid_format';
}

export function isScoredGroup(group: ParseGroup): boolean {
  return READABLE.has(group);
}

const LABELS: Record<ParseGroup, string> = {
  ok: 'Clean',
  last_line: 'Move on last line',
  san_converted: 'Converted from SAN',
  loose: 'Pulled from text',
  illegal_move: 'Illegal move',
  ambiguous: 'Several moves',
  invalid_format: 'Unreadable',
  missing: 'Blank reply',
  truncated: 'Cut off',
  request_error: 'Request failed',
};

export function parseStatusLabel(status: string): string {
  return LABELS[parseGroupOf(status)];
}
