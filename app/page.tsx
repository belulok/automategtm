'use client';

import { useState } from 'react';
import { Pipeline } from './pipeline';

export default function Home() {
  const [domain, setDomain] = useState('');
  const [running, setRunning] = useState<string | null>(null);

  function start() {
    const clean = domain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '');
    if (clean.includes('.')) setRunning(clean);
  }

  if (running) return <Pipeline domain={running} onReset={() => setRunning(null)} />;

  const valid = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').includes('.');

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-20">
      {/* quiet field of dots, the only decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] dark:opacity-[0.22]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 45%, #000 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 45%, #000 20%, transparent 75%)',
        }}
      />

      <div className="relative w-full max-w-2xl">
        <h1 className="text-balance text-center text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Find out who buys
          <br />
          <span className="text-emerald-600 dark:text-emerald-400">and why</span>
        </h1>

        <p className="mx-auto mt-6 max-w-lg text-balance text-center text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
          Paste a website. It reads the site, finds the competitors, splits the market
          into segments, then scores real companies and names who to contact.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
          className="mx-auto mt-10 flex max-w-xl gap-2"
        >
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourcompany.com"
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Website to research"
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-5 py-4 text-base shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
          />
          <button
            type="submit"
            disabled={!valid}
            className="shrink-0 rounded-xl bg-neutral-900 px-6 py-4 font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Research
          </button>
        </form>

        <ol className="mx-auto mt-12 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs text-neutral-500">
          {['Research', 'Competitors', 'Campaigns', 'Customers', 'Decision makers', 'Email'].map(
            (s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">→</span>}
                <span>{s}</span>
              </li>
            ),
          )}
        </ol>
      </div>
    </main>
  );
}
