/**
 * The header's 2×2 board mark, animated: the gold diagonal flips back and forth.
 * Used for route loading and the lazily loaded leaderboard.
 */
export default function BrandLoader({ label = 'Loading', size = 44 }: { label?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="brand-loader grid grid-cols-2 grid-rows-2 overflow-hidden rounded-[22%] ring-1 ring-[var(--accent-border)]"
        style={{ width: size, height: size }}
      >
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</span>
    </div>
  );
}
