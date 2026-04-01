function LoadingPanel() {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      aria-hidden="true"
    >
      <div className="animate-pulse space-y-4">
        <div className="h-5 w-40 rounded-full bg-[var(--border-subtle)]" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-20 rounded-xl bg-[var(--border-subtle)]" />
          <div className="h-20 rounded-xl bg-[var(--border-subtle)]" />
          <div className="h-20 rounded-xl bg-[var(--border-subtle)]" />
        </div>
        <div className="h-72 rounded-xl bg-[var(--border-subtle)]" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <main
      className="h-screen flex flex-col overflow-hidden font-sans"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      <div className="flex-1 min-h-0 flex flex-col max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 gap-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-[10px] bg-[var(--border-subtle)]" />
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded-full bg-[var(--border-subtle)] mx-auto animate-pulse" />
            <div className="h-4 w-40 rounded-full bg-[var(--border-subtle)] mx-auto animate-pulse" />
          </div>
        </div>
        <div className="h-11 w-64 rounded-lg bg-[var(--border-subtle)] animate-pulse" />
        <LoadingPanel />
      </div>
    </main>
  );
}
