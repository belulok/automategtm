/**
 * Free enrichment. No keys, no signup.
 *
 * Every call is best-effort: enrichment never fails a run, it just returns less.
 * The point is deciding which candidates are worth spending money on later —
 * a domain with no MX records can never receive outreach, so it should be
 * dropped before it reaches an email-finding waterfall.
 */
export type Enrichment = {
  /** Domain resolves. */
  live: boolean;
  /** Has MX records, so it can receive mail at all. */
  acceptsMail: boolean;
  /** Who runs their mail, inferred from MX hostnames. */
  mailProvider: string | null;
  disposable: boolean;
  /** Recognised as a university, via the free hipolabs dataset. */
  isUniversity: boolean;
  country: string | null;
  /** Explee uses this same endpoint for the favicons in their tables. */
  faviconUrl: string;
};

const MX_PROVIDERS: [RegExp, string][] = [
  [/aspmx.*google|googlemail|google\.com$/i, 'Google Workspace'],
  [/outlook\.com|protection\.outlook|microsoft/i, 'Microsoft 365'],
  [/zoho/i, 'Zoho'],
  [/protonmail|proton\.me/i, 'Proton'],
  [/mimecast/i, 'Mimecast'],
  [/barracuda/i, 'Barracuda'],
  [/proofpoint|pphosted/i, 'Proofpoint'],
  [/amazonaws|amazonses/i, 'Amazon SES'],
  [/mailgun|sendgrid|postmark/i, 'transactional ESP'],
  [/secureserver\.net|godaddy/i, 'GoDaddy'],
  [/ionos|1and1/i, 'IONOS'],
  [/yandex/i, 'Yandex'],
];

function providerOf(mx: string[]): string | null {
  for (const host of mx) {
    for (const [re, name] of MX_PROVIDERS) if (re.test(host)) return name;
  }
  return mx.length > 0 ? 'self-hosted / other' : null;
}

type DisifyResponse = {
  dns?: boolean;
  disposable?: boolean;
  mx_info?: string[];
};

/** Disify: DNS, MX and disposable-domain checks. Free, no key. */
async function viaDisify(domain: string): Promise<Partial<Enrichment>> {
  const res = await fetch(`https://disify.com/api/domain/${encodeURIComponent(domain)}`, {
    headers: { accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`disify ${res.status}`);
  const j = (await res.json()) as DisifyResponse;
  const mx = Array.isArray(j.mx_info) ? j.mx_info : [];
  return {
    live: Boolean(j.dns),
    acceptsMail: mx.length > 0,
    mailProvider: providerOf(mx),
    disposable: Boolean(j.disposable),
  };
}

type HipoUniversity = { name: string; domains?: string[]; country?: string };

/** hipolabs university list: ~10k institutions with their domains. Free, no key. */
async function viaUniversities(domain: string): Promise<Partial<Enrichment>> {
  const root = domain.split('.').slice(-3).join('.');
  const res = await fetch(
    `http://universities.hipolabs.com/search?domain=${encodeURIComponent(root)}`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) throw new Error(`universities ${res.status}`);
  const list = (await res.json()) as HipoUniversity[];
  const hit = list.find((u) => u.domains?.some((d) => domain === d || domain.endsWith(`.${d}`)));
  return hit ? { isUniversity: true, country: hit.country ?? null } : { isUniversity: false };
}

export async function enrichDomain(domain: string): Promise<Enrichment> {
  const base: Enrichment = {
    live: false,
    acceptsMail: false,
    mailProvider: null,
    disposable: false,
    isUniversity: false,
    country: null,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
  };

  const [mail, uni] = await Promise.allSettled([viaDisify(domain), viaUniversities(domain)]);
  return {
    ...base,
    ...(mail.status === 'fulfilled' ? mail.value : {}),
    ...(uni.status === 'fulfilled' ? uni.value : {}),
  };
}

/** Enrich a batch with bounded concurrency, so we stay polite to free endpoints. */
export async function enrichAll(domains: string[], concurrency = 4): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();
  const queue = [...domains];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        try {
          out.set(d, await enrichDomain(d));
        } catch {
          // Non-fatal by design.
        }
      }
    }),
  );
  return out;
}
