/** Shared shimmer primitives. Skeletons mirror the shape of the real content,
 *  so the layout does not jump when data lands. */
export function Bar({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <span className={`block ${h} ${w} animate-pulse rounded bg-neutral-200 dark:bg-neutral-800`} />;
}

export function Chip({ w = 'w-20' }: { w?: string }) {
  return <span className={`inline-block h-6 ${w} animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800`} />;
}

/** Step 2 — product summary beside the competitor list. */
export function CompetitorsSkeleton() {
  return (
    <div className="grid gap-8 rounded-2xl border border-neutral-200 p-6 md:grid-cols-2 dark:border-neutral-800">
      <div className="space-y-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400">Product</p>
        <Bar w="w-2/3" h="h-8" />
        <div className="space-y-2 pt-2">
          <Bar w="w-5/6" /><Bar w="w-4/6" /><Bar w="w-3/6" />
        </div>
        <p className="pt-4 text-xs uppercase tracking-wide text-neutral-400">Queries</p>
        <div className="space-y-2">
          <Bar w="w-3/4" h="h-9" /><Bar w="w-2/3" h="h-9" /><Bar w="w-4/5" h="h-9" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-neutral-400">Competitors</p>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-neutral-100 px-3 py-2.5 dark:border-neutral-900">
            <span className="size-4 shrink-0 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <Bar w={`w-${['3/5', '2/5', '4/5', '1/2'][i % 4]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Step 3 — a grid of campaign cards. */
export function CampaignsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-3">
            <Bar w="w-1/2" h="h-5" />
            <span className="size-8 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <Bar w="w-5/6" />
          <div className="space-y-2 pt-1">
            <Chip w="w-12" />
            <Bar w="w-4/5" />
          </div>
          <div className="space-y-2">
            <Chip w="w-16" />
            <Bar w="w-3/4" /><Bar w="w-2/3" /><Bar w="w-4/5" />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Chip w="w-24" /><Chip w="w-20" /><Chip w="w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Steps 4 and 5 — a dense results table. */
export function TableSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        {Array.from({ length: cols }).map((_, i) => <Bar key={i} w="w-24" h="h-2.5" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-neutral-100 px-4 py-3 last:border-0 dark:border-neutral-900">
          <span className="size-4 shrink-0 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="flex-1 space-y-1.5">
            <Bar w={`w-${['1/3', '2/5', '1/4'][r % 3]}`} />
            <Bar w={`w-${['3/5', '1/2', '2/3'][r % 3]}`} h="h-2" />
          </div>
          <Bar w="w-24" /><Bar w="w-12" />
        </div>
      ))}
    </div>
  );
}

/** Step 6 — the drafted email. */
export function EmailSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <span className="size-9 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <div className="flex-1 space-y-1.5"><Bar w="w-40" /><Bar w="w-56" h="h-2" /></div>
      </div>
      <div className="space-y-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
        <Bar w="w-2/3" h="h-4" />
        <div className="space-y-2 pt-3">
          <Bar w="w-1/4" /><Bar w="w-full" /><Bar w="w-5/6" />
          <Bar w="w-full" /><Bar w="w-3/4" /><Bar w="w-2/3" />
        </div>
      </div>
    </div>
  );
}
