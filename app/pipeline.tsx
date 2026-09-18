'use client';

import { useEffect, useRef, useState } from 'react';
import { CompetitorsSkeleton, CampaignsSkeleton, TableSkeleton, EmailSkeleton } from './skeleton';

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
type Person = { name: string; title: string; companyDomain: string; companyName: string | null; linkedinUrl: string | null };
type Email = { subject: string; body: string; toName: string; toTitle: string; toCompany: string };

const STEPS = [
  'Research your company',
  'Explore competitors',
  'Define campaigns',
  'Find potential customers',
  'Find decision makers',
  'Write emails',
];

const favicon = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;

export function Pipeline({ domain, onReset }: { domain: string; onReset: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comps, setComps] = useState<Hit[] | null>(null);
  const [camps, setCamps] = useState<Campaign[] | null>(null);
  const [found, setFound] = useState<Record<string, Scored[]>>({});
  const [leads, setLeads] = useState<Record<string, Person[]>>({});
  const [mails, setMails] = useState<Record<string, Email>>({});
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
        body: JSON.stringify({ domain }),
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
            case 'email': setMails((m) => ({ ...m, [ev.campaignId]: ev.data })); break;
            case 'error': setError(ev.message); break;
            case 'done': setFinished(true); break;
          }
        }
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [domain]);

  const current = camps?.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        domain={domain} onReset={onReset} profile={profile} logs={logs}
        comps={comps} camps={camps} found={found} done={done} provider={provider}
        selected={selected} onSelect={setSelected}
      />

      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
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
              (mails[current.id] === undefined
                ? (done.has(6) ? <Empty what="email" /> : <EmailSkeleton />)
                : <EmailCard email={mails[current.id]} />)}
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
    <div className="shrink-0">
      <p className="mb-2 text-right text-[10px] uppercase tracking-wider text-neutral-400">
        What happens next
      </p>
      <ol className="flex items-center gap-3">
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
        <p className="mt-2 text-right text-xs text-neutral-400">
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

function EmailCard({ email }: { email: Email }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 p-5 dark:border-neutral-800">
        <p className="font-medium">{email.toName}</p>
        <p className="text-sm text-neutral-500">{email.toTitle} · {email.toCompany}</p>
      </div>
      <div className="space-y-1 border-b border-neutral-200 px-5 py-3 text-sm dark:border-neutral-800">
        <p><span className="mr-3 text-neutral-400">Subj</span><span className="font-medium">{email.subject}</span></p>
      </div>
      <pre className="whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed">{email.body}</pre>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
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
  domain: string; onReset: () => void; profile: Profile | null; logs: string[];
  comps: Hit[] | null; camps: Campaign[] | null; found: Record<string, Scored[]>;
  done: Set<number>; provider: string; selected: string | null; onSelect: (id: string) => void;
}) {
  const { domain, onReset, profile, logs, comps, camps, found, done, selected, onSelect } = props;
  return (
    <aside className="shrink-0 border-b border-neutral-200 p-5 lg:w-80 lg:border-b-0 lg:border-r dark:border-neutral-800">
      <button onClick={onReset} className="mb-6 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100">
        ← new search
      </button>

      <Section label="step 1 · research" done={done.has(1)}>
        {profile ? (
          <>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon(domain)} alt="" width={20} height={20} className="size-5 rounded" />
              <p className="font-semibold">{profile.name}</p>
            </div>
            <p className="mt-0.5 font-mono text-xs text-neutral-500">{domain}</p>
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
              <span key={c.domain} className="flex items-center gap-1.5 truncate rounded-md border border-neutral-200 px-2 py-1.5 font-mono text-[11px] dark:border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon(c.domain)} alt="" width={12} height={12} className="size-3 shrink-0 rounded-sm" />
                <span className="truncate">{c.domain}</span>
              </span>
            ))}
          </div>
          {comps.length > 8 && <p className="mt-2 text-xs text-neutral-500">+{comps.length - 8} more</p>}
        </Section>
      )}

      {camps && (
        <Section label={`step 3 · campaigns ${camps.length}`} done={done.has(3)}>
          <div className="space-y-1">
            {camps.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selected === c.id
                    ? 'border-neutral-900 dark:border-neutral-100'
                    : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-neutral-500">{found[c.id]?.length ?? '·'}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </aside>
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
