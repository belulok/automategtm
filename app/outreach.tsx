'use client';

import { useEffect, useRef, useState } from 'react';

export type ProviderResult = {
  provider: string;
  status: 'hit' | 'miss' | 'not_configured' | 'error';
  email?: string;
};
export type FoundEmail = {
  email: string | null;
  via: string | null;
  confidence: 'valid' | 'catch_all' | 'unknown' | null;
  attempts: ProviderResult[];
};
export type Person = {
  name: string; title: string; companyDomain: string;
  companyName: string | null; linkedinUrl: string | null; found?: FoundEmail;
};
export type Email = {
  subject: string; body: string; toName: string; toTitle: string; toCompany: string;
};

const favicon = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;

/**
 * Step 6: the lead list beside the drafted email, the way the whole pipeline
 * has been building toward. Selecting a lead swaps the draft.
 */
export function Outreach({ leads, emails }: { leads: Person[]; emails: Email[] }) {
  const byName = new Map(emails.map((e) => [e.toName, e]));
  const firstWithEmail = leads.find((l) => byName.has(l.name)) ?? leads[0];
  const [selected, setSelected] = useState<string | null>(null);
  const active = leads.find((l) => l.name === selected) ?? firstWithEmail;
  const email = active ? byName.get(active.name) : undefined;

  if (leads.length === 0) {
    return <p className="py-6 text-sm text-neutral-500">No leads for this segment.</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {leads.map((l) => {
          const has = byName.has(l.name);
          const isActive = active?.name === l.name;
          return (
            <li key={`${l.name}-${l.companyDomain}`}>
              <button
                onClick={() => setSelected(l.name)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isActive
                    ? 'border-neutral-900 dark:border-neutral-100'
                    : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {l.title} · {l.companyDomain}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs ${has ? 'text-emerald-500' : 'text-neutral-300 dark:text-neutral-700'}`}>
                    {has ? '✓' : '○'}
                  </span>
                </span>
                <Waterfall attempts={l.found?.attempts ?? []} />
                <EmailLine found={l.found} />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0">
        {active && email ? (
          <EmailPane lead={active} email={email} />
        ) : (
          <p className="rounded-xl border border-neutral-200 p-6 text-sm text-neutral-500 dark:border-neutral-800">
            No draft for {active?.name}. Drafts are written for the first few leads in each segment.
          </p>
        )}
      </div>
    </div>
  );
}

/** The provider chain, with "never asked" visually distinct from "asked and missed". */
function Waterfall({ attempts }: { attempts: ProviderResult[] }) {
  if (attempts.length === 0) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1">
      {attempts.map((a) => {
        const mark = a.status === 'hit' ? '✓' : a.status === 'not_configured' ? '–' : '✗';
        const tone =
          a.status === 'hit'
            ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
            : a.status === 'not_configured'
              ? 'border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600'
              : 'border-neutral-200 text-neutral-500 dark:border-neutral-800';
        return (
          <span
            key={a.provider}
            title={a.status === 'not_configured' ? `${a.provider}: no API key set` : `${a.provider}: ${a.status}`}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}
          >
            {mark} {a.provider}
          </span>
        );
      })}
    </span>
  );
}

function EmailLine({ found }: { found?: FoundEmail }) {
  if (!found) return null;
  if (!found.email) {
    const none = found.attempts.every((a) => a.status === 'not_configured');
    return (
      <span className="mt-1.5 block font-mono text-[11px] text-neutral-400">
        {none ? 'no finder configured' : 'no email found'}
      </span>
    );
  }
  return (
    <span className="mt-1.5 block font-mono text-[11px] text-neutral-500">
      {found.email} via {found.via}
      {found.confidence && (
        <span className={found.confidence === 'valid' ? ' text-emerald-600 dark:text-emerald-400' : ' text-amber-600'}>
          {' '}· {found.confidence}
        </span>
      )}
    </span>
  );
}

function EmailPane({ lead, email }: { lead: Person; email: Email }) {
  const typed = useTypewriter(email.body, email.subject);
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 border-b border-neutral-200 p-5 dark:border-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon(lead.companyDomain)} alt="" width={32} height={32} className="size-8 rounded-full" />
        <div className="min-w-0">
          <p className="truncate font-medium">
            {lead.name}
            {lead.linkedinUrl && (
              <a href={lead.linkedinUrl} target="_blank" rel="noreferrer noopener"
                className="ml-2 text-xs text-neutral-400 underline-offset-2 hover:underline">in</a>
            )}
          </p>
          <p className="truncate text-sm text-neutral-500">{lead.title} · {lead.companyDomain}</p>
        </div>
      </div>

      <dl className="space-y-1 border-b border-neutral-200 px-5 py-3 text-sm dark:border-neutral-800">
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-neutral-400">To</dt>
          <dd className="min-w-0 truncate font-mono text-xs">
            {lead.found?.email ?? <span className="text-neutral-400">no address yet</span>}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-neutral-400">Subj</dt>
          <dd className="min-w-0 font-medium">{email.subject}</dd>
        </div>
      </dl>

      <pre className="min-h-[13rem] whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed">
        {typed}
        {typed.length < email.body.length && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-neutral-400" />
        )}
      </pre>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-400">
          {lead.found?.email ? 'Ready to send.' : 'Needs an address before this can send.'}
        </p>
        <button
          disabled
          title="Sending needs a pre-warmed inbox pool — not built"
          className="cursor-not-allowed rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white opacity-40 dark:bg-white dark:text-neutral-900"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/** Types the body out once per draft, then leaves it alone. */
function useTypewriter(body: string, key: string): string {
  const [n, setN] = useState(0);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setN(0);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(body.length);
      return;
    }
    // ~3 chars a frame reads as writing rather than as a slow reveal.
    const id = setInterval(() => {
      setN((prev) => {
        if (prev >= body.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 3;
      });
    }, 16);
    return () => clearInterval(id);
  }, [body, key]);

  return body.slice(0, n);
}
