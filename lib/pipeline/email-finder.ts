import type { Enrichment } from './enrich';

/**
 * Email-finder waterfall.
 *
 * Explee runs hunter -> exreacher -> findymail -> leadmagic and shows which one
 * hit. Those are all commodity APIs; the value is in the ordering and in not
 * paying twice for the same contact.
 *
 * Providers without a key report `not_configured`, which is deliberately
 * distinct from `miss`. Rendering "not attempted" as "failed" is the same
 * mistake that once painted every company as unreachable.
 */
export type ProviderName = 'hunter' | 'exreacher' | 'findymail' | 'leadmagic';

export type ProviderResult = {
  provider: ProviderName;
  status: 'hit' | 'miss' | 'not_configured' | 'error';
  email?: string;
};

export type FoundEmail = {
  email: string | null;
  /** Which provider produced it. */
  via: ProviderName | null;
  /** valid | catch_all | unknown — from the domain's MX posture. */
  confidence: 'valid' | 'catch_all' | 'unknown' | null;
  attempts: ProviderResult[];
};

const KEYS: Record<ProviderName, string | undefined> = {
  hunter: process.env.HUNTER_API_KEY,
  exreacher: process.env.EXREACHER_API_KEY,
  findymail: process.env.FINDYMAIL_API_KEY,
  leadmagic: process.env.LEADMAGIC_API_KEY,
};

/** Cheapest first, so a hit avoids paying the dearer providers. */
const ORDER: ProviderName[] = ['hunter', 'exreacher', 'findymail', 'leadmagic'];

export const anyFinderConfigured = () => ORDER.some((p) => Boolean(KEYS[p]));

type Lookup = (first: string, last: string, domain: string, key: string) => Promise<string | null>;

const LOOKUPS: Record<ProviderName, Lookup> = {
  hunter: async (first, last, domain, key) => {
    const u = new URL('https://api.hunter.io/v2/email-finder');
    u.searchParams.set('domain', domain);
    u.searchParams.set('first_name', first);
    u.searchParams.set('last_name', last);
    u.searchParams.set('api_key', key);
    const r = await fetch(u, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { email?: string | null } };
    return j.data?.email ?? null;
  },
  exreacher: async (first, last, domain, key) => {
    const r = await fetch('https://api.exreacher.com/v1/find', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ first_name: first, last_name: last, domain }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { email?: string | null };
    return j.email ?? null;
  },
  findymail: async (first, last, domain, key) => {
    const r = await fetch('https://app.findymail.com/api/search/name', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ name: `${first} ${last}`, domain }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { contact?: { email?: string | null } };
    return j.contact?.email ?? null;
  },
  leadmagic: async (first, last, domain, key) => {
    const r = await fetch('https://api.leadmagic.io/email-finder', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ first_name: first, last_name: last, domain }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { email?: string | null };
    return j.email ?? null;
  },
};

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts[parts.length - 1]];
}

/**
 * The MX posture we already know decides how far to trust an address: a
 * catch-all domain accepts anything, so a "found" address there is unproven.
 */
function confidenceFor(enrichment?: Enrichment): FoundEmail['confidence'] {
  if (!enrichment) return null;
  if (enrichment.acceptsMail === false) return 'unknown';
  if (enrichment.acceptsMail === null) return 'unknown';
  return enrichment.mailProvider === 'self-hosted / other' ? 'catch_all' : 'valid';
}

export async function findEmail(
  fullName: string,
  domain: string,
  enrichment?: Enrichment,
): Promise<FoundEmail> {
  const [first, last] = splitName(fullName);
  const attempts: ProviderResult[] = [];

  // No point spending a lookup on a domain that cannot receive mail at all.
  const dead = enrichment?.acceptsMail === false;

  for (const provider of ORDER) {
    const key = KEYS[provider];
    if (!key) {
      attempts.push({ provider, status: 'not_configured' });
      continue;
    }
    if (dead || !first || !last) {
      attempts.push({ provider, status: 'miss' });
      continue;
    }
    try {
      const email = await LOOKUPS[provider](first, last, domain, key);
      if (email) {
        attempts.push({ provider, status: 'hit', email });
        // Mark the providers we never had to call.
        for (const rest of ORDER.slice(ORDER.indexOf(provider) + 1)) {
          attempts.push({ provider: rest, status: KEYS[rest] ? 'miss' : 'not_configured' });
        }
        return { email, via: provider, confidence: confidenceFor(enrichment), attempts };
      }
      attempts.push({ provider, status: 'miss' });
    } catch {
      attempts.push({ provider, status: 'error' });
    }
  }

  return { email: null, via: null, confidence: null, attempts };
}
