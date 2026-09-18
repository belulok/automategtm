'use client';

import { useState } from 'react';
import { Pipeline } from './pipeline';

const EXAMPLES = ['webmerger.vercel.app', 'consolto.com', 'linear.app'];

export default function Home() {
  const [domain, setDomain] = useState('');
  const [running, setRunning] = useState<string | null>(null);

  function start(value: string) {
    const clean = value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (clean) setRunning(clean);
  }

  if (running) return <Pipeline domain={running} onReset={() => setRunning(null)} />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-16">
      <h1 className="text-balance text-center text-5xl font-semibold tracking-tight sm:text-6xl">
        Find out who buys<br />
        <span className="text-emerald-500">and why</span>
      </h1>
      <p className="mt-5 text-center text-lg text-neutral-500 dark:text-neutral-400">
        Point it at a domain. It reads the site, finds the competitors, and splits
        the market into segments you can actually sell to.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(domain);
        }}
        className="mt-10 flex gap-2"
      >
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Paste your website, e.g. consolto.com"
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-base outline-none transition focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
        />
        <button
          type="submit"
          disabled={!domain.trim()}
          className="shrink-0 rounded-xl bg-neutral-900 px-5 py-3.5 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Research
        </button>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => start(e)}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600"
          >
            {e}
          </button>
        ))}
      </div>
    </main>
  );
}
