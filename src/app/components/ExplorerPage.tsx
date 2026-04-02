import Image from 'next/image';
import BenchmarkExplorer from './BenchmarkExplorer';
import { getLatestResults } from '../lib/results';
import logo from '../icon.png';

export default async function ExplorerPage({
  defaultView = 'puzzle',
}: {
  defaultView?: 'puzzle' | 'benchmark';
}) {
  const results = await getLatestResults();
  const modelCount = results.models.length;
  const puzzleCount = results.puzzles.length;

  return (
    <main className="h-screen flex flex-col overflow-hidden font-sans" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <div className="flex-1 min-h-0 flex flex-col max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
        <header className="mb-6 relative flex flex-col items-center justify-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-12 h-12 shrink-0 rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-white border border-[#e2e8f0] overflow-hidden">
              <Image
                src={logo}
                alt="ChessBench Logo"
                fill
                sizes="48px"
                className="object-contain scale-110 p-0.5"
                priority
              />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                chess-bench
              </h1>
              <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {modelCount}
                </span>{' '}
                models
                <span className="mx-1.5 opacity-40" aria-hidden>
                  ·
                </span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {puzzleCount}
                </span>{' '}
                puzzles
              </p>
            </div>
          </div>
          <div className="sm:absolute sm:right-0 sm:top-0 h-full flex items-center">
            <a
              href="https://github.com/vorahardik7/chess-bench"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Star it on GitHub (opens in new tab)"
              className="group inline-flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent-light)] hover:shadow-[0_4px_14px_rgba(37,99,235,0.12)] focus-visible:outline focus-visible:outline-[var(--accent)]"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current opacity-90 group-hover:opacity-100" style={{ color: 'var(--text-primary)' }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.09-.74.09-.72.09-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.77.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.91 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.9 1.24 3.22 0 4.59-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.57 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
              </svg>
              <span className="leading-tight">Star it on GitHub</span>
            </a>
          </div>
        </header>

        <BenchmarkExplorer defaultView={defaultView} results={results} />
      </div>
    </main>
  );
}
