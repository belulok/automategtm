'use client';

import { useEffect, useRef, useState } from 'react';

type Profile = { name: string; description: string; product: string; bullets: string[]; queries: string[] };
type Hit = { domain: string; name: string | null; snippet: string | null; verified: boolean };
type Campaign = {
  id: string; name: string; pitch: string; pain: string;
  criteria: string[]; exampleClients: string[]; searchQuery: string;
};
type Scored = Hit & { fit: number; reason: string };

const STEPS = ['Research your company', 'Explore competitors', 'Define campaigns', 'Find potential customers'];

export function Pipeline({ domain, onReset }: { domain: string; onReset: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comps, setComps] = useState<Hit[]>([]);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [found, setFound] = useState<Record<string, Scored[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>('none');
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      if (!res.body) return setError('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          switch (ev.type) {
            case 'run': setProvider(ev.provider); break;
            case 'log': setLogs((l) => [...l, ev.text]); break;
            case 'step':
              if (ev.status === 'start') setActive(ev.step);
              else setDone((d) => new Set(d).add(ev.step));
              break;
            case 'profile': setProfile(ev.data); break;
            case 'competitors': setComps(ev.data); break;
            case 'campaigns':
              setCamps(ev.data);
              setSelected((s) => s ?? ev.data[0]?.id ?? null);
              break;
            case 'companies':
              setFound((f) => ({ ...f, [ev.campaignId]: ev.data }));
              break;
            case 'error': setError(ev.message); break;
            case 'done': setFinished(true); break;
          }
        }
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [domain]);

  const current = camps.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* sidebar ------------------------------------------------------ */}
      <aside className="shrink-0 border-b border-neutral-200 p-5 lg:w-80 lg:border-b-0 lg:border-r dark:border-neutral-800">
        <button onClick={onReset} className="mb-6 text-sm text-neutral-500 hover:underline">
          ← new search
        </button>

        <Section label="step 1 · research" done={done.has(1)}>
          {profile ? (
            <>
              <p className="font-semibold">{profile.name}</p>
              <p className="font-mono text-xs text-neutral-500">{domain}</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{profile.description}</p>
            </>
          ) : (
            <Logs logs={logs} />
          )}
        </Section>

        {comps.length > 0 && (
          <Section label={`step 2 · competitors (${comps.length})`} done={done.has(2)}>
            <div className="flex flex-wrap gap-1.5">
              {comps.slice(0, 10).map((c) => (
                <span key={c.domain} className="rounded-md border border-neutral-200 px-2 py-1 font-mono text-xs dark:border-neutral-800">
                  {c.domain}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {comps.some((c) => c.verified)
                ? `searched via ${provider}`
                : 'from the model, not searched'}
            </p>
          </Section>
        )}

        {camps.length > 0 && (
          <Section label={`step 3 · campaigns (${camps.length})`} done={done.has(3)}>
            <div className="space-y-1">
              {camps.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selected === c.id
                      ? 'border-neutral-900 dark:border-neutral-100'
                      : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    {found[c.id]?.length ?? '·'}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </aside>

      {/* main --------------------------------------------------------- */}
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <ol className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = done.has(n) ? 'done' : active === n ? 'active' : 'idle';
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                    state === 'done'
                      ? 'bg-emerald-500 text-white'
                      : state === 'active'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'border border-neutral-300 text-neutral-400 dark:border-neutral-700'
                  }`}
                >
                  {state === 'done' ? '✓' : n}
                </span>
                <span className={state === 'idle' ? 'text-neutral-400' : ''}>{label}</span>
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!profile && !error && <Logs logs={logs} big />}

        {profile && (
          <div className="mb-8 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Product</p>
            <p className="mt-1 text-lg font-medium">{profile.product}</p>
            <ul className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {profile.bullets.map((b) => (
                <li key={b}>— {b}</li>
              ))}
            </ul>
          </div>
        )}

        {current && (
          <section>
            <h2 className="text-xl font-semibold">{current.name}</h2>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{current.pitch}</p>
            <p className="mt-3 text-sm">
              <span className="text-neutral-500">Pain — </span>
              {current.pain}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {current.criteria.map((c) => (
                <span key={c} className="rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">
                  {c}
                </span>
              ))}
            </div>

            <Results rows={found[current.id]} provider={provider} pending={!finished} />
          </section>
        )}
      </main>
    </div>
  );
}

function Results({ rows, provider, pending }: { rows?: Scored[]; provider: string; pending: boolean }) {
  if (provider === 'none') {
    return (
      <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        No search provider configured, so steps 2 and 4 fall back to the model&rsquo;s own recall.
        Add a free <code className="font-mono">TAVILY_API_KEY</code> (1,000/month, no card) to
        <code className="font-mono"> .env</code>.
      </p>
    );
  }
  if (!rows) return <p className="mt-6 text-sm text-neutral-500">{pending ? `searching via ${provider}…` : 'nothing found'}</p>;
  if (rows.length === 0) {
    return (
      <p className="mt-6 text-sm text-neutral-500">
        No results from {provider}. It may be rate-limiting — a
        <code className="font-mono"> TAVILY_API_KEY</code> is free and more reliable.
      </p>
    );
  }

  return (
    <table className="mt-6 w-full border-separate border-spacing-0 text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
        <tr>
          <th className="border-b border-neutral-200 pb-2 dark:border-neutral-800">Company</th>
          <th className="border-b border-neutral-200 pb-2 dark:border-neutral-800">Why</th>
          <th className="border-b border-neutral-200 pb-2 text-right dark:border-neutral-800">Fit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domain}>
            <td className="border-b border-neutral-100 py-2.5 pr-4 align-top dark:border-neutral-900">
              <span className="font-medium">{r.name ?? r.domain}</span>
              <span className="block font-mono text-xs text-neutral-500">{r.domain}</span>
            </td>
            <td className="border-b border-neutral-100 py-2.5 pr-4 align-top text-neutral-600 dark:border-neutral-900 dark:text-neutral-400">
              {r.reason}
            </td>
            <td className="border-b border-neutral-100 py-2.5 text-right align-top font-mono dark:border-neutral-900">
              <span className={r.fit >= 4 ? 'text-emerald-600 dark:text-emerald-400' : r.fit <= 2 ? 'text-neutral-400' : ''}>
                {r.fit}/5
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ label, done, children }: { label: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-6 border-t border-neutral-200 pt-4 first:border-t-0 first:pt-0 dark:border-neutral-800">
      <p className="mb-2 font-mono text-xs text-neutral-500">
        {done ? '✓' : '›'} {label}
      </p>
      {children}
    </div>
  );
}

function Logs({ logs, big }: { logs: string[]; big?: boolean }) {
  return (
    <div className={`space-y-1 font-mono ${big ? 'text-sm' : 'text-xs'} text-neutral-500`}>
      {logs.map((l, i) => (
        <p key={i}>
          {i === logs.length - 1 ? '›' : '✓'} {l}
        </p>
      ))}
      {logs.length > 0 && <span className="inline-block h-4 w-2 animate-pulse bg-neutral-400 align-middle" />}
    </div>
  );
}
