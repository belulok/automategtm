import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, ensureSchema, hasDb, runs, profiles, competitors, campaigns, companies, people, emails } from '@/lib/db';
import { crawl } from '@/lib/pipeline/crawl';
import {
  buildProfile, buildProfileFromSearch, buildProfileFromDescription,
  findCompetitors, defineCampaigns, findCompanies,
  findDecisionMakers, writeEmail, type ScoredCompany,
} from '@/lib/pipeline/steps';
import { CrawlBlockedError } from '@/lib/pipeline/crawl';
import { activeProvider } from '@/lib/pipeline/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const eqRun = (id: string) => eq(runs.id, id);

export async function POST(req: Request) {
  const body = (await req.json()) as { domain?: string; oneLiner?: string; detail?: string };
  const { domain, oneLiner, detail } = body;
  if (!domain && !oneLiner?.trim()) {
    return new Response('domain or oneLiner required', { status: 400 });
  }
  const label = domain ?? oneLiner!.slice(0, 80);

  const runId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      try {
        await ensureSchema();
        const db = getDb();
        await db?.insert(runs).values({ id: runId, domain: label });
        send({ type: 'run', runId, provider: activeProvider(), persisted: hasDb() });

        /* step 1 ------------------------------------------------------- */
        send({ type: 'step', step: 1, status: 'start' });

        let profile;
        let selfDomain: string | undefined;

        if (!domain) {
          // No website yet: the description IS the source.
          send({ type: 'log', text: 'reading your description…' });
          send({ type: 'log', text: 'working out what you sell and to whom…' });
          profile = await buildProfileFromDescription(oneLiner!, detail ?? '');
        } else {
          selfDomain = domain;
          send({ type: 'log', text: `fetching ${domain}…` });
          try {
            const crawled = await crawl(domain);
            selfDomain = crawled.domain;
            send({ type: 'log', text: `read ${crawled.pages.map((p) => p.path).join(' and ')}…` });
            send({ type: 'log', text: 'extracting what you sell and to whom…' });
            profile = await buildProfile(crawled);
          } catch (err) {
            if (!(err instanceof CrawlBlockedError)) throw err;
            // Blocked or unreachable from this host. Ask the search index what
            // it knows instead of failing the whole run.
            send({ type: 'log', text: `${domain} blocked a direct read, asking search instead…` });
            profile = await buildProfileFromSearch(domain);
          }
        }
        await db?.insert(profiles).values({ runId, ...profile });
        send({ type: 'profile', data: profile });
        send({ type: 'step', step: 1, status: 'done' });

        /* step 2 ------------------------------------------------------- */
        send({ type: 'step', step: 2, status: 'start' });
        const hits = await findCompetitors(profile, selfDomain);
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
              const { found: _f, ...row } = l;
              await db?.insert(people).values({ id: randomUUID(), runId, campaignId: c.id, ...row });
            }
            send({ type: 'people', campaignId: c.id, data: leads });
          }),
        );
        send({ type: 'step', step: 5, status: 'done' });

        send({ type: 'step', step: 6, status: 'start' });
        await Promise.all(
          saved.map(async (c) => {
            // Draft for the first few leads so the list is browsable, not a
            // single take-it-or-leave-it email.
            const top = (leadsByCampaign.get(c.id) ?? []).slice(0, 3);
            for (const lead of top) {
              const company = (foundByCampaign.get(c.id) ?? []).find((x) => x.domain === lead.companyDomain);
              try {
                const email = await writeEmail(profile, c, lead, company, profile.name);
                await db?.insert(emails).values({ id: randomUUID(), runId, campaignId: c.id, ...email });
                send({ type: 'email', campaignId: c.id, data: email });
              } catch {
                // A failed draft should not fail the run.
              }
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
