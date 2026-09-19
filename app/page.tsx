'use client';

import { useState } from 'react';
import { Pipeline } from './pipeline';
import { NodeField } from './nodefield';

type Start = { domain: string } | { oneLiner: string; detail: string };

export default function Home() {
  const [mode, setMode] = useState<'domain' | 'describe'>('domain');
  const [domain, setDomain] = useState('');
  const [oneLiner, setOneLiner] = useState('');
  const [detail, setDetail] = useState('');
  const [running, setRunning] = useState<Start | null>(null);

  const cleanDomain = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const ready = mode === 'domain' ? cleanDomain.includes('.') : oneLiner.trim().length >= 12;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setRunning(mode === 'domain' ? { domain: cleanDomain } : { oneLiner: oneLiner.trim(), detail: detail.trim() });
  }

  if (running) return <Pipeline start={running} onReset={() => setRunning(null)} />;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16 sm:px-6">
      <div className="relative w-full max-w-2xl">
        <h1 className="relative z-10 text-balance text-center text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Find out who buys
          <br />
          <span className="text-emerald-600 dark:text-emerald-400">and why</span>
        </h1>

        <p className="relative z-10 mx-auto mt-5 max-w-lg text-balance text-center leading-relaxed text-neutral-600 sm:mt-6 sm:text-lg dark:text-neutral-400">
          {mode === 'domain'
            ? 'Paste a website. It reads the site, finds the competitors, splits the market into segments, then scores real companies and names who to contact.'
            : 'Describe what you are building. Everything downstream works the same — you do not need a live site to know who your buyers are.'}
        </p>

        <div className="relative mx-auto mt-8 max-w-xl sm:mt-10">
          <NodeField />
          <form onSubmit={submit} className="relative z-10">
          {mode === 'domain' ? (
            <div className="flex flex-col gap-2 sm:flex-row">
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
              <SubmitButton ready={ready} />
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={oneLiner}
                onChange={(e) => setOneLiner(e.target.value)}
                placeholder="One line: what does it do, and for whom?"
                autoFocus
                maxLength={160}
                aria-label="One-line description"
                className="w-full rounded-xl border border-neutral-300 bg-white px-5 py-4 text-base shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
              />
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Optional: more detail — what it does, who it is for, what it is not."
                rows={4}
                maxLength={1200}
                aria-label="Longer description"
                className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-5 py-4 text-base shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
              />
              <SubmitButton ready={ready} full />
            </div>
          )}
          </form>
        </div>

        <div className="relative z-10 mt-5 text-center">
          <button
            onClick={() => setMode(mode === 'domain' ? 'describe' : 'domain')}
            className="text-sm text-neutral-500 underline-offset-4 transition hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
          >
            {mode === 'domain' ? "I don't have a website yet" : '← I have a website'}
          </button>
        </div>

        <ol className="relative z-10 mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs text-neutral-500 sm:mt-12">
          {['Research', 'Competitors', 'Campaigns', 'Customers', 'Decision makers', 'Email'].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">→</span>}
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function SubmitButton({ ready, full }: { ready: boolean; full?: boolean }) {
  return (
    <button
      type="submit"
      disabled={!ready}
      className={`relative z-10 shrink-0 rounded-xl bg-neutral-900 px-6 py-4 font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600 ${full ? 'w-full' : ''}`}
    >
      Research
    </button>
  );
}
