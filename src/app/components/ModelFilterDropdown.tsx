'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Filter, Search, X } from 'lucide-react';
import { getModelLogoClass, getModelLogoPath, getModelProvider, getProviderLabel } from './utils';

function LabChip({
  active,
  label,
  logo,
  onClick,
}: {
  active: boolean;
  label: string;
  logo?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
        active
          ? 'bg-[color-mix(in_oklab,var(--accent)_18%,var(--surface))] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_0_1px_var(--accent-border)]'
          : 'bg-[var(--border-subtle)] border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {logo && (
        <Image
          src={logo}
          alt=""
          width={12}
          height={12}
          className={`h-3 w-3 ${getModelLogoClass(logo)}`}
          unoptimized
        />
      )}
      {label}
    </button>
  );
}

export default function ModelFilterDropdown({
  selected,
  options,
  onChange,
  totalCount,
  label = 'Filter models',
}: {
  selected: Set<string>;
  options: { id: string; label: string }[];
  onChange: (selected: Set<string>) => void;
  totalCount: number;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const toggleItem = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onChange(newSelected);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const [selectedLabIds, setSelectedLabIds] = useState<Set<string>>(() => new Set());

  const labs = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((o) => {
      const provider = getModelProvider(o.id);
      if (provider && !map.has(provider)) {
        map.set(provider, getProviderLabel(o.id));
      }
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [options]);

  const filteredOptions = useMemo(() => {
    return options.filter((o) => {
      const matchesLab = selectedLabIds.size === 0 || selectedLabIds.has(getModelProvider(o.id));
      if (!matchesLab) return false;
      if (normalizedQuery.length === 0) return true;
      return (
        o.label.toLowerCase().includes(normalizedQuery) ||
        o.id.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [options, normalizedQuery, selectedLabIds]);

  const isScoped = normalizedQuery.length > 0 || selectedLabIds.size > 0;
  const selectAll = () => {
    const newSelected = new Set(selected);
    filteredOptions.forEach((o) => newSelected.add(o.id));
    onChange(newSelected);
  };

  const selectNone = () => {
    const newSelected = new Set(selected);
    filteredOptions.forEach((o) => newSelected.delete(o.id));
    onChange(newSelected);
  };

  const applyLabSelection = (labIds: Set<string>) => {
    setSelectedLabIds(labIds);
    onChange(
      new Set(
        options
          .filter((o) => labIds.size === 0 || labIds.has(getModelProvider(o.id)))
          .map((o) => o.id)
      )
    );
  };

  const toggleLab = (labId: string) => {
    const nextLabIds = selectedLabIds.size === 0 ? new Set<string>([labId]) : new Set(selectedLabIds);
    if (selectedLabIds.has(labId)) {
      nextLabIds.delete(labId);
    } else {
      nextLabIds.add(labId);
    }
    applyLabSelection(nextLabIds);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (isOpen) setQuery('');
          setIsOpen(!isOpen);
        }}
        className="flex h-9 items-center gap-2 px-3 rounded-lg text-[13px] font-medium transition-colors hover:border-[var(--text-tertiary)]"
        style={{
          background: 'var(--surface-raised)',
          border: `1px solid ${isOpen ? 'var(--accent-border)' : 'var(--border-strong)'}`,
          color: 'var(--text-primary)',
        }}
      >
        <Filter className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        <span>{label}</span>
        <span
          className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold"
          style={
            selected.size < totalCount
              ? { background: 'var(--accent-light)', color: 'var(--accent)' }
              : { background: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          {selected.size}/{totalCount}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-auto sm:left-auto sm:right-0 z-50 top-full mt-1 h-[min(26rem,calc(100vh-160px))] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg shadow-lg flex flex-col"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="shrink-0 flex items-center gap-2 px-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Search
                className="w-4 h-4 shrink-0 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                data-seamless
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="flex-1 min-w-0 py-2.5 text-sm bg-transparent outline-none focus:outline-none focus-visible:outline-none placeholder:text-[var(--text-tertiary)]"
                style={{ color: 'var(--text-primary)' }}
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors hover:bg-[var(--border-subtle)]"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {labs.length > 1 && (
              <div
                className="shrink-0 px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                    Labs
                  </div>
                  <button
                    type="button"
                    onClick={() => applyLabSelection(new Set())}
                    className="rounded px-1.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                    style={{ color: selectedLabIds.size === 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}
                  >
                    All labs
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {labs.map((lab) => (
                    <LabChip
                      key={lab.id}
                      active={selectedLabIds.has(lab.id)}
                      label={lab.label}
                      logo={getModelLogoPath(`${lab.id}/x`)}
                      onClick={() => toggleLab(lab.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 p-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isScoped ? 'Select shown' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isScoped ? 'Clear shown' : 'Clear'}
              </button>
            </div>

            <div className="min-h-0 flex-1 p-1 overflow-y-auto overscroll-none custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  No matches found.
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isChecked = selected.has(option.id);
                  const logoPath = getModelLogoPath(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleItem(option.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0"
                        style={{
                          background: isChecked ? 'var(--accent)' : 'var(--surface)',
                          border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                        }}
                      >
                        {isChecked && <Check className="w-3 h-3" style={{ color: 'var(--on-accent)' }} />}
                      </div>
                      {logoPath && (
                        <Image
                          src={logoPath}
                          alt=""
                          width={16}
                          height={16}
                          className={`h-4 w-4 shrink-0 ${getModelLogoClass(logoPath)}`}
                          unoptimized
                        />
                      )}
                      <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{option.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
