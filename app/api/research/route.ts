import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, ensureSchema, hasDb, runs, profiles, competitors, campaigns, companies, people, emails } from '@/lib/db';
import { crawl } from '@/lib/pipeline/crawl';
import {
  buildProfile, findCompetitors, defineCampaigns, findCompanies,
  findDecisionMakers, writeEmail, type ScoredCompany,
} from '@/lib/pipeline/steps';
import { activeProvider } from '@/lib/pipeline/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const eqRun = (id: string) => eq(runs.id, id);

export async function POST(req: Request) {
  const { domain } = (await req.json()) as { domain?: string };
  if (!domain) return new Response('domain required', { status: 400 });

  const runId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      try {
        await ensureSchema();
        const db = getDb();
        await db?.insert(runs).values({ id: runId, domain });
        send({ type: 'run', runId, provider: activeProvider(), persisted: hasDb() });

        /* step 1 ------------------------------------------------------- */
        send({ type: 'step', step: 1, status: 'start' });
        send({ type: 'log', text: `fetching ${domain}…` });
        const crawled = await crawl(domain);
        send({ type: 'log', text: `read ${crawled.pages.map((p) => p.path).join(' and ')}…` });
        send({ type: 'log', text: 'extracting what you sell and to whom…' });
        const profile = await buildProfile(crawled);
        await db?.insert(profiles).values({ runId, ...profile });
        send({ type: 'profile', data: profile });
        send({ type: 'step', step: 1, status: 'done' });

        /* step 2 ------------------------------------------------------- */
        send({ type: 'step', step: 2, status: 'start' });
        const hits = await findCompetitors(profile, crawled.domain);
        for (const h of hits) {
          await db
            ?.insert(competitors)
            .values({ id: randomUUID(), runId, domain: h.domain, name: h.name, note: h.snippet });
        }
        send({ type: 'competitors', data: hits });
        send({ type: 'step', step: 2, status: 'done' });

        /* step 3 ------------------------------------------------------- */
        send({ type: 'step', step: 3, status: 'start' });
        const defined = await defineCampaigns(profile, hits);
        const saved = defined.map((c) => ({ ...c, id: randomUUID() }));
        for (const c of saved) {
          await db?.insert(campaigns).values({
              id: c.id,
              runId,
              name: c.name,
              pitch: c.pitch,
              pain: c.pain,
              criteria: c.criteria,
              exampleClients: c.exampleClients,
            searchQuery: c.searchQuery,
          });
        }
        send({ type: 'campaigns', data: saved });
        send({ type: 'step', step: 3, status: 'done' });

        /* steps 4-6 ---------------------------------------------------- */
        // Campaigns are independent, so they run concurrently and each one
        // streams as soon as it lands. Sequentially this took long enough that
        // the last two steps looked stuck.
        send({ type: 'step', step: 4, status: 'start' });
        const foundByCampaign = new Map<string, ScoredCompany[]>();
        await Promise.all(
          saved.map(async (c) => {
            const found = await findCompanies(c).catch(() => []);
            foundByCampaign.set(c.id, found);
            for (const f of found) {
              await db?.insert(companies).values({
                id: randomUUID(), runId, campaignId: c.id,
                name: f.name ?? f.domain, domain: f.domain, description: f.snippet,
                fitScore: f.fit, fitReason: f.reason,
                acceptsMail: f.enrichment?.acceptsMail ?? null,
                mailProvider: f.enrichment?.mailProvider ?? null,
                isUniversity: f.enrichment?.isUniversity ?? null,
                country: f.enrichment?.country ?? null,
                faviconUrl: f.enrichment?.faviconUrl ?? null,
              });
            }
            send({ type: 'companies', campaignId: c.id, data: found });
          }),
        );
        send({ type: 'step', step: 4, status: 'done' });

        send({ type: 'step', step: 5, status: 'start' });
        const leadsByCampaign = new Map<string, Awaited<ReturnType<typeof findDecisionMakers>>>();
        await Promise.all(
          saved.map(async (c) => {
            const leads = await findDecisionMakers(
              { name: c.name },
              foundByCampaign.get(c.id) ?? [],
            ).catch(() => []);
            leadsByCampaign.set(c.id, leads);
            for (const l of leads) {
              await db?.insert(people).values({ id: randomUUID(), runId, campaignId: c.id, ...l });
            }
            send({ type: 'people', campaignId: c.id, data: leads });
          }),
        );
        send({ type: 'step', step: 5, status: 'done' });

        send({ type: 'step', step: 6, status: 'start' });
        await Promise.all(
          saved.map(async (c) => {
            const lead = (leadsByCampaign.get(c.id) ?? [])[0];
            if (!lead) return;
            const company = (foundByCampaign.get(c.id) ?? []).find((x) => x.domain === lead.companyDomain);
            try {
              const email = await writeEmail(profile, c, lead, company, profile.name);
              await db?.insert(emails).values({ id: randomUUID(), runId, campaignId: c.id, ...email });
              send({ type: 'email', campaignId: c.id, data: email });
            } catch {
              // A failed draft should not fail the run.
            }
          }),
        );
        send({ type: 'step', step: 6, status: 'done' });

        await db?.update(runs).set({ status: 'done' }).where(eqRun(runId));
        send({ type: 'done', runId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await getDb()?.update(runs).set({ status: 'error', error: message }).where(eqRun(runId));
        } catch {}
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
