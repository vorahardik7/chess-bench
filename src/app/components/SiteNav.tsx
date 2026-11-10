'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';

const NAV = [
  { href: '/', label: 'Explorer' },
  { href: '/methodology', label: 'Methodology' },
] as const;

/** Page switcher. Lives in the root layout, so it stays mounted and the pill slides between pages. */
export default function SiteNav() {
  const pathname = usePathname();

  return (
    <div className="relative flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-0.5">
      {NAV.map((item) => {
        const current = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`relative rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
              current ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {current && (
              <motion.span
                layoutId="site-nav-pill"
                className="absolute inset-0 rounded-md bg-[var(--surface-raised)] shadow-[inset_0_0_0_1px_var(--border)]"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
