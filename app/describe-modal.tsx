'use client';

import { useEffect, useRef, useState } from 'react';

export type Described = { oneLiner: string; detail: string; geography: string };

/**
 * For teams with nothing to crawl. Three questions rather than one free-text
 * box, because "who buys" and "where" are what steps 3 and 4 actually need and
 * a single paragraph rarely volunteers them.
 */
export function DescribeModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (d: Described) => void;
}) {
  const [sell, setSell] = useState('');
  const [customer, setCustomer] = useState('');
  const [geography, setGeography] = useState('');
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Stop the page scrolling behind the dialog.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const ready = sell.trim().length >= 10;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onSubmit({
      oneLiner: sell.trim(),
      // Everything the model should ground itself in, kept as one block.
      detail: [customer.trim() && `Ideal customer: ${customer.trim()}`]
        .filter(Boolean)
        .join('\n'),
      geography: geography.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/25 p-4 backdrop-blur-sm sm:items-center dark:bg-black/50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="describe-title"
        className="my-auto w-full max-w-lg rounded-3xl border border-neutral-200 bg-neutral-50 p-7 shadow-2xl sm:p-9 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="describe-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Tell us about your business
            </h2>
            <p className="mt-2 text-neutral-500">We&rsquo;ll build your campaigns from your answers</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" className="size-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-6">
          <Field label="What do you sell or want to build?">
            <textarea
              ref={first}
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="e.g. An AI tool that writes cold emails for B2B sales teams"
              className={INPUT}
            />
          </Field>

          <Field label="Who is your ideal customer?">
            <textarea
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="e.g. Founders and sales leaders at early-stage SaaS startups"
              className={INPUT}
            />
          </Field>

          <Field label="Which markets or geography?">
            <input
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              maxLength={160}
              placeholder="e.g. US and Western Europe"
              className={INPUT}
            />
          </Field>

          <button
            type="submit"
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-4 font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
          >
            Generate my campaigns <span aria-hidden>→</span>
          </button>
        </form>
      </div>
    </div>
  );
}

const INPUT =
  'w-full resize-y rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3 text-base outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-neutral-100 dark:focus:bg-neutral-900';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-medium text-neutral-600 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
