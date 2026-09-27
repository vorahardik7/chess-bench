import Link from 'next/link';
import { Star } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

type Stat = { value: number; label: string };

export default function SiteHeader({
  stats = [],
  page = 'explorer',
}: {
  stats?: Stat[];
  page?: 'explorer' | 'methodology';
}) {
  const Brand = page === 'explorer' ? 'h1' : 'span';

  return (
    <header className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-3 min-w-0" aria-label="ChessBench home">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-[5px] ring-1 ring-[var(--accent-border)]"
          >
            <span className="bg-[var(--accent)]" />
            <span className="bg-[var(--surface-raised)]" />
            <span className="bg-[var(--surface-raised)]" />
            <span className="bg-[var(--accent)]" />
          </span>
          <Brand className="text-[19px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
            ChessBench
          </Brand>
        </Link>
        {stats.length > 0 && (
          <ul className="ml-1 hidden md:flex items-center gap-1.5" aria-label="Benchmark size">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1"
              >
                <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--accent)]">
                  {stat.value}
                </span>
                <span className="text-[12px] text-[var(--text-secondary)]">{stat.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <nav className="flex shrink-0 items-center gap-2" aria-label="Site">
        <Link
          href={page === 'explorer' ? '/dataset' : '/'}
          className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
        >
          {page === 'explorer' ? 'Methodology' : 'Explorer'}
        </Link>
        <a
          href="https://github.com/vorahardik7/chess-bench"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Star ChessBench on GitHub (opens in new tab)"
          className="star-button inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-[13px] font-semibold text-[var(--on-accent)] shadow-[0_0_0_1px_var(--accent-border),0_4px_14px_-4px_var(--accent)] transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-[var(--accent-strong)]"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.09-.74.09-.72.09-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.77.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.91 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.59-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.57 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
          </svg>
          <span className="hidden sm:inline">Star on GitHub</span>
          <Star className="star-icon h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}
