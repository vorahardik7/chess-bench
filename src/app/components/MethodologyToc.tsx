'use client';

import { useEffect, useState } from 'react';

export type TocItem = { id: string; index: string; title: string };

/** Sticky section index for the methodology page; highlights the section being read. */
export default function MethodologyToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // A section is "current" once its top passes the upper third of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    sections.forEach((section) => observer.observe(section));

    // The last section is too short to ever reach the trigger band; claim it at the page bottom.
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) setActive(items[items.length - 1].id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [items]);

  return (
    <nav aria-label="On this page" className="sticky top-8">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">On this page</p>
      <ol className="relative space-y-0.5 border-l border-[var(--border-subtle)]">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={() => setActive(item.id)}
                aria-current={current ? 'location' : undefined}
                className={`-ml-px flex items-baseline gap-2.5 border-l py-1.5 pl-3.5 text-[13px] transition-colors ${
                  current
                    ? 'border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span
                  className={`font-mono text-[10.5px] tabular-nums ${current ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}
                >
                  {item.index}
                </span>
                {item.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
