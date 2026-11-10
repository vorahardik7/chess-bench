/**
 * Parse statuses written by the bench runner are composed: an optional `repair_`
 * (a follow-up was sent) and an optional `loose_` (moves pulled from prose), then
 * the outcome. `loose_invalid_count` is a failure, not a successful extraction.
 */
export type ParseGroup =
  | 'ok'
  | 'loose'
  | 'san_converted'
  | 'repair'
  | 'invalid_count'
  | 'invalid_uci'
  | 'missing'
  | 'truncated'
  | 'request_error';

const FAILURES = new Set<ParseGroup>(['invalid_count', 'invalid_uci', 'missing', 'truncated', 'request_error']);

export function parseGroupOf(status: string): ParseGroup {
  let rest = status;
  const repaired = rest.startsWith('repair_');
  if (repaired) rest = rest.slice('repair_'.length);
  const loose = rest.startsWith('loose_');
  if (loose) rest = rest.slice('loose_'.length);

  if (FAILURES.has(rest as ParseGroup)) return rest as ParseGroup;
  if (repaired) return 'repair';
  if (loose) return 'loose';
  if (rest === 'ok' || rest === 'san_converted') return rest;
  return 'invalid_uci';
}

export function isScoredGroup(group: ParseGroup): boolean {
  return !FAILURES.has(group);
}

const LABELS: Record<ParseGroup, string> = {
  ok: 'Clean',
  loose: 'Pulled from text',
  san_converted: 'Converted from SAN',
  repair: 'Asked again',
  invalid_count: 'Wrong length',
  invalid_uci: 'Unreadable',
  missing: 'Blank reply',
  truncated: 'Cut off',
  request_error: 'Request failed',
};

export function parseStatusLabel(status: string): string {
  return LABELS[parseGroupOf(status)];
}
