'use client';

import { useEffect, useRef, useState } from 'react';
import { CompetitorsSkeleton, CampaignsSkeleton, TableSkeleton, EmailSkeleton } from './skeleton';
import { Outreach, type Person, type Email } from './outreach';

type Profile = { name: string; description: string; product: string; bullets: string[]; queries: string[] };
type Hit = { domain: string; name: string | null; snippet: string | null; verified: boolean };
type Enrichment = {
  live: boolean | null; acceptsMail: boolean | null; mailProvider: string | null;
  isUniversity: boolean; country: string | null; faviconUrl: string;
};
type Scored = Hit & { fit: number; reason: string; enrichment?: Enrichment };
type Campaign = {
  id: string; name: string; pitch: string; pain: string;
  criteria: string[]; exampleClients: string[]; searchQuery: string;
};

const STEPS = [
  'Research your company',
  'Explore competitors',
  'Define campaigns',
  'Find potential customers',
  'Find decision makers',
  'Write emails',
];

const favicon = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;

export type Start = { domain: string } | { oneLiner: string; detail: string };

export function Pipeline({ start, onReset }: { start: Start; onReset: () => void }) {
  const domain = 'domain' in start ? start.domain : null;
  const label = domain ?? ('oneLiner' in start ? start.oneLiner : '');
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comps, setComps] = useState<Hit[] | null>(null);
  const [camps, setCamps] = useState<Campaign[] | null>(null);
  const [found, setFound] = useState<Record<string, Scored[]>>({});
  const [leads, setLeads] = useState<Record<string, Person[]>>({});
  const [mails, setMails] = useState<Record<string, Email[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'companies' | 'people' | 'email'>('companies');
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('none');
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(start),
      });
      if (!res.body) return setError('No response stream');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
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
            case 'companies': setFound((f) => ({ ...f, [ev.campaignId]: ev.data })); break;
            case 'people': setLeads((p) => ({ ...p, [ev.campaignId]: ev.data })); break;
            case 'email':
              setMails((m) => ({ ...m, [ev.campaignId]: [...(m[ev.campaignId] ?? []), ev.data] }));
              break;
            case 'error': setError(ev.message); break;
            case 'done': setFinished(true); break;
          }
        }
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [start]);

  const current = camps?.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        domain={domain} label={label} onReset={onReset} profile={profile} logs={logs}
        comps={comps} camps={camps} found={found} leads={leads} mails={mails}
        done={done} active={active} provider={provider}
        selected={selected} onSelect={setSelected}
      />

      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mb-8 flex flex-col items-start justify-between gap-5 xl:flex-row xl:gap-6">
          <Stepper steps={STEPS} done={done} active={active} />
          <WhatHappensNext ready={done.has(6)} />
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!error && active === 1 && !profile && <Logs logs={logs} />}

        {!error && active === 2 && (comps === null ? <CompetitorsSkeleton /> : <CompetitorsPanel profile={profile} comps={comps} provider={provider} />)}

        {!error && active === 3 && (camps === null ? <CampaignsSkeleton /> : <CampaignsGrid camps={camps} counts={found} />)}

        {!error && active >= 4 && current && (
          <section>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{current.name}</h2>
                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{current.pitch}</p>
              </div>
              <Tabs view={view} setView={setView} />
            </div>

            {view === 'companies' &&
              (found[current.id] === undefined ? <TableSkeleton rows={8} /> : <Companies rows={found[current.id]} provider={provider} />)}

            {view === 'people' &&
              (leads[current.id] === undefined
                ? (done.has(5) ? <Empty what="decision makers" /> : <TableSkeleton rows={6} />)
                : <People rows={leads[current.id]} />)}

            {view === 'email' &&
              // The lead list stands on its own, so show it whenever there are
              // leads — a segment with no draft yet is not an empty screen.
              (!done.has(6) && (leads[current.id] ?? []).length === 0 ? (
                <EmailSkeleton />
              ) : (
                <Outreach leads={leads[current.id] ?? []} emails={mails[current.id] ?? []} />
              ))}
          </section>
        )}

        {finished && (
          <p className="mt-8 text-sm text-neutral-500">
            Done. {camps?.length ?? 0} segments ·{' '}
            {Object.values(found).flat().length} companies ·{' '}
            {Object.values(leads).flat().length} people
          </p>
        )}
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function Stepper({ steps, done, active }: { steps: string[]; done: Set<number>; active: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = done.has(n) ? 'done' : active === n ? 'active' : 'idle';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
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
  );
}

/** The three stages this tool stops before: sending, booking, optimising. */
function WhatHappensNext({ ready }: { ready: boolean }) {
  const next = ['Send emails', 'Book meetings', 'Learn & double down'];
  return (
    <div className="w-full shrink-0 xl:w-auto">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-neutral-400 xl:text-right">
        What happens next
      </p>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {next.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">—</span>}
            <span
              className={`flex size-6 items-center justify-center rounded-full border border-dashed text-xs ${
                ready
                  ? 'border-neutral-400 text-neutral-500'
                  : 'border-neutral-300 text-neutral-300 dark:border-neutral-700 dark:text-neutral-700'
              }`}
            >
              {i + 7}
            </span>
            <span className={`text-sm ${ready ? 'text-neutral-500' : 'text-neutral-400 dark:text-neutral-600'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>
      {ready && (
        <p className="mt-2 text-xs text-neutral-400 xl:text-right">
          not built — sending needs pre-warmed inboxes
        </p>
      )}
    </div>
  );
}

function Tabs({ view, setView }: { view: string; setView: (v: 'companies' | 'people' | 'email') => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
      {(['companies', 'people', 'email'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
            view === v
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function CompetitorsPanel({ profile, comps, provider }: { profile: Profile | null; comps: Hit[]; provider: string }) {
  return (
    <div className="grid gap-8 rounded-2xl border border-neutral-200 p-6 md:grid-cols-2 dark:border-neutral-800">
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-400">Product</p>
        <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 font-medium dark:bg-neutral-800">{profile?.product}</p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          {profile?.bullets.map((b) => <li key={b}>{b}</li>)}
        </ul>
        <p className="mt-6 text-xs uppercase tracking-wide text-neutral-400">Queries</p>
        <div className="mt-2 space-y-2">
          {profile?.queries.map((q) => (
            <p key={q} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
              <span className="mr-2 text-neutral-400">⌕</span>{q}
            </p>
          ))}
        </div>
      </div>
      <div>
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
          Competitors
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
            {comps.length} found
          </span>
        </p>
        <div className="mt-2 space-y-1.5">
          {comps.map((c) => (
            <a
              key={c.domain}
              href={`https://${c.domain}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm transition hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon(c.domain)} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm" />
              <span className="truncate font-mono text-xs">{c.domain}</span>
            </a>
          ))}
        </div>
        {comps.length > 0 && !comps[0].verified && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
            From the model, not searched. Add a search key to verify.
          </p>
        )}
        {comps.length > 0 && comps[0].verified && (
          <p className="mt-3 text-xs text-neutral-500">searched via {provider}</p>
        )}
      </div>
    </div>
  );
}

function CampaignsGrid({ camps, counts }: { camps: Campaign[]; counts: Record<string, Scored[]> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {camps.map((c) => (
        <div key={c.id} className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">{c.name}</h3>
            {counts[c.id] && (
              <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-800">
                {counts[c.id].length}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{c.pitch}</p>
          <p className="mt-4 text-[10px] uppercase tracking-wide text-neutral-400">Pain</p>
          <p className="mt-1 border-l-2 border-neutral-200 pl-3 text-sm dark:border-neutral-700">{c.pain}</p>
          <p className="mt-4 text-[10px] uppercase tracking-wide text-neutral-400">Criteria</p>
          <ul className="mt-1 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {c.criteria.map((x) => (
              <li key={x} className="flex gap-2"><span className="text-neutral-400">•</span>{x}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.exampleClients.map((x) => (
              <span key={x} className="rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{x}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Companies({ rows, provider }: { rows: Scored[]; provider: string }) {
  if (provider === 'none') return <Notice>No search provider configured. Add a free <code className="font-mono">TAVILY_API_KEY</code>.</Notice>;
  if (rows.length === 0) return <Empty what="companies" />;
  return (
    <Table head={['Company', 'Why it fits', 'Reachable', 'Fit']}>
      {rows.map((r) => (
        <tr key={r.domain}>
          <Td>
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.enrichment?.faviconUrl ?? favicon(r.domain)} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm" />
              <span className="font-medium">{r.name ?? r.domain}</span>
            </span>
            <span className="mt-0.5 block font-mono text-xs text-neutral-500">
              {r.domain}
              {r.enrichment?.isUniversity && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· university</span>}
              {r.enrichment?.country && <span className="ml-1.5">· {r.enrichment.country}</span>}
            </span>
          </Td>
          <Td muted>{r.reason}</Td>
          <Td>
            {r.enrichment?.acceptsMail === true ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {r.enrichment.mailProvider ?? 'mail ok'}
              </span>
            ) : r.enrichment?.acceptsMail === false ? (
              <span className="text-xs text-red-500">no MX</span>
            ) : (
              <span className="text-xs text-neutral-400">unknown</span>
            )}
          </Td>
          <Td right>
            <span className={`font-mono ${r.fit >= 4 ? 'text-emerald-600 dark:text-emerald-400' : r.fit <= 2 ? 'text-neutral-400' : ''}`}>{r.fit}/5</span>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function People({ rows }: { rows: Person[] }) {
  if (rows.length === 0) return <Empty what="decision makers" />;
  return (
    <Table head={['Name', 'Job title', 'Company', '']}>
      {rows.map((p, i) => (
        <tr key={`${p.name}-${i}`}>
          <Td><span className="font-medium">{p.name}</span></Td>
          <Td muted>{p.title}</Td>
          <Td>
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon(p.companyDomain)} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm" />
              <span className="font-mono text-xs">{p.companyDomain}</span>
            </span>
          </Td>
          <Td right>
            {p.linkedinUrl && (
              <a href={p.linkedinUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100">in</a>
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 lg:mx-0 lg:px-0">
      <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`border-b border-neutral-200 pb-2 dark:border-neutral-800 ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, muted, right }: { children: React.ReactNode; muted?: boolean; right?: boolean }) {
  return (
    <td className={`border-b border-neutral-100 py-3 pr-4 align-top dark:border-neutral-900 ${muted ? 'text-neutral-600 dark:text-neutral-400' : ''} ${right ? 'pr-0 text-right' : ''}`}>
      {children}
    </td>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </p>
  );
}

const Empty = ({ what }: { what: string }) => <p className="py-6 text-sm text-neutral-500">No {what} found for this segment.</p>;

function Logs({ logs }: { logs: string[] }) {
  return (
    <div className="space-y-1.5 font-mono text-sm text-neutral-500">
      {logs.map((l, i) => (
        <p key={i}>{i === logs.length - 1 ? '›' : '✓'} {l}</p>
      ))}
      {logs.length > 0 && <span className="inline-block h-4 w-2 animate-pulse bg-neutral-400 align-middle" />}
    </div>
  );
}

function Sidebar(props: {
  domain: string | null; label: string; onReset: () => void; profile: Profile | null; logs: string[];
  comps: Hit[] | null; camps: Campaign[] | null; found: Record<string, Scored[]>;
  leads: Record<string, Person[]>; mails: Record<string, Email[]>;
  done: Set<number>; active: number; provider: string;
  selected: string | null; onSelect: (id: string) => void;
}) {
  const { domain, label, onReset, profile, logs, comps, camps, found, leads, mails, done, active, selected, onSelect } = props;
  const companyCount = Object.values(found).flat().length;
  const peopleCount = Object.values(leads).flat().length;
  const emailCount = Object.values(mails).flat().length;
  const maxCount = Math.max(1, ...Object.values(found).map((f) => f.length));
  return (
    <aside className="shrink-0 border-b border-neutral-200 p-5 lg:w-80 lg:border-b-0 lg:border-r dark:border-neutral-800">
      <button onClick={onReset} className="mb-6 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100">
        ← new search
      </button>

      <Section label="step 1 · research" done={done.has(1)}>
        {profile ? (
          <>
            <div className="flex items-center gap-2">
              {domain && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={favicon(domain)} alt="" width={20} height={20} className="size-5 rounded" />
              )}
              <p className="font-semibold">{profile.name}</p>
            </div>
            <p className="mt-0.5 font-mono text-xs text-neutral-500">{domain ?? 'no website yet'}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{profile.description}</p>
          </>
        ) : (
          <Logs logs={logs} />
        )}
      </Section>

      {comps && (
        <Section label={`step 2 · competitors ${comps.length}`} done={done.has(2)}>
          <div className="grid grid-cols-2 gap-1.5">
            {comps.slice(0, 8).map((c) => (
              <a
                key={c.domain}
                href={`https://${c.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1.5 font-mono text-[11px] transition hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon(c.domain)} alt="" width={12} height={12} className="size-3 shrink-0 rounded-sm" />
                <span className="min-w-0 flex-1 truncate">{c.domain}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  aria-hidden className="size-2.5 shrink-0 text-neutral-400">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </a>
            ))}
          </div>
          {comps.length > 8 && <p className="mt-2 text-xs text-neutral-500">+{comps.length - 8} more</p>}
        </Section>
      )}

      {camps && (
        <Section label={`step 3 · campaigns ${camps.length}`} done={done.has(3)}>
          <div className="space-y-1">
            {camps.map((c, i) => {
              const n = found[c.id]?.length;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    selected === c.id
                      ? 'border-neutral-900 dark:border-neutral-100'
                      : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <CampaignIcon i={i} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {selected === c.id && <span className="shrink-0 text-xs text-emerald-500">✓</span>}
                    <span className="shrink-0 font-mono text-xs text-neutral-500">{n === undefined ? '·' : compact(n)}</span>
                  </span>
                  {/* how much of this run's total each segment accounts for */}
                  <span className="mt-1.5 block h-0.5 w-full rounded bg-neutral-200 dark:bg-neutral-800">
                    <span
                      className="block h-0.5 rounded bg-neutral-500 transition-[width] duration-500 dark:bg-neutral-400"
                      style={{ width: `${Math.round(((n ?? 0) / maxCount) * 100)}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {(done.has(4) || active >= 4) && (
        <Section label="step 4 · find potential customers" done={done.has(4)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {companyCount > 0 ? `${companyCount} companies scored` : 'searching…'}
          </p>
        </Section>
      )}

      {(done.has(5) || active >= 5) && (
        <Section label="step 5 · find decision makers" done={done.has(5)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {done.has(5) ? `${peopleCount} people found` : 'searching…'}
          </p>
        </Section>
      )}

      {(done.has(6) || active >= 6) && (
        <Section label="step 6 · write emails" done={done.has(6)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {done.has(6) ? `${emailCount} drafted` : 'drafting…'}
          </p>
        </Section>
      )}
    </aside>
  );
}

/** 1800 -> 1.8K, so long segment lists stay scannable. */
function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

const ICON_PATHS = [
  'M12 3 2 8l10 5 10-5-10-5Zm0 12v6M6 10.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5', // education
  'M5 19 3 21m6-5-2 2m10-14a6 6 0 0 1-7 9l-2 2-3-3 2-2a6 6 0 0 1 9-7l3 3Z',    // rocket
  'M3 8h18v12H3V8Zm5 0V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',                      // briefcase
  'M16 20v-2a4 4 0 0 0-8 0v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',               // people
  'M20 9c0 5-8 10-8 10S4 14 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1Z',                  // heart
  'M4 5h7v15H4V5Zm9 0h7v15h-7V5Z',                                              // book
];

function CampaignIcon({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className="size-4 shrink-0 text-neutral-400">
      <path d={ICON_PATHS[i % ICON_PATHS.length]} />
    </svg>
  );
}

function Section({ label, done, children }: { label: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-6 border-t border-neutral-200 pt-4 first:border-t-0 first:pt-0 dark:border-neutral-800">
      <p className="mb-2 font-mono text-xs text-neutral-500">{done ? '✓' : '›'} {label}</p>
      {children}
    </div>
  );
}
