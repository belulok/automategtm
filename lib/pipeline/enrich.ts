import { promises as dns } from 'node:dns';

/**
 * Free enrichment. No keys, no signup.
 *
 * `null` means "we could not find out", which is NOT the same as `false`. An
 * earlier version collapsed the two, so a timed-out lookup rendered as
 * "no MX — unreachable" and silently disqualified good companies from the
 * later steps. Unknown must stay unknown.
 */
export type Enrichment = {
  /** Domain resolves. null = lookup failed. */
  live: boolean | null;
  /** Has MX records. null = lookup failed. */
  acceptsMail: boolean | null;
  /** Who runs their mail, inferred from MX hostnames. */
  mailProvider: string | null;
  isUniversity: boolean;
  country: string | null;
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
  [/mailgun|sendgrid|postmark|mandrill/i, 'transactional ESP'],
  [/secureserver\.net|godaddy/i, 'GoDaddy'],
  [/ionos|1and1/i, 'IONOS'],
  [/yandex/i, 'Yandex'],
  [/qq\.com|exmail/i, 'Tencent Exmail'],
  [/alibaba|aliyun/i, 'Alibaba Mail'],
  [/zimbra|hostinger|namecheap|privateemail/i, 'shared host'],
];

function providerOf(mx: string[]): string | null {
  for (const host of mx) {
    for (const [re, name] of MX_PROVIDERS) if (re.test(host)) return name;
  }
  return mx.length > 0 ? 'self-hosted / other' : null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * MX lookup over DNS rather than a third-party HTTP API: authoritative,
 * milliseconds, no rate limit and nothing to sign up for.
 */
async function mailInfo(domain: string): Promise<Pick<Enrichment, 'live' | 'acceptsMail' | 'mailProvider'>> {
  const root = domain.replace(/^www\./, '');
  try {
    const mx = await withTimeout(dns.resolveMx(root), 5_000);
    const hosts = mx.filter((r) => r.exchange && r.exchange !== '.').map((r) => r.exchange.toLowerCase());
    return { live: true, acceptsMail: hosts.length > 0, mailProvider: providerOf(hosts) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENODATA/ENOTFOUND are real answers: the domain has no MX (or does not
    // exist). Anything else — timeout, SERVFAIL — is a failed lookup.
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      try {
        await withTimeout(dns.resolve(root), 4_000);
        return { live: true, acceptsMail: false, mailProvider: null };
      } catch {
        return { live: code === 'ENODATA', acceptsMail: false, mailProvider: null };
      }
    }
    return { live: null, acceptsMail: null, mailProvider: null };
  }
}

type HipoUniversity = { name: string; domains?: string[]; country?: string };

/** hipolabs university list: ~10k institutions with their domains. Free, no key. */
async function universityInfo(domain: string): Promise<Pick<Enrichment, 'isUniversity' | 'country'>> {
  const root = domain.split('.').slice(-3).join('.');
  try {
    const res = await fetch(`http://universities.hipolabs.com/search?domain=${encodeURIComponent(root)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return { isUniversity: false, country: null };
    const list = (await res.json()) as HipoUniversity[];
    const hit = list.find((u) => u.domains?.some((d) => domain === d || domain.endsWith(`.${d}`)));
    return hit ? { isUniversity: true, country: hit.country ?? null } : { isUniversity: false, country: null };
  } catch {
    return { isUniversity: false, country: null };
  }
}

export async function enrichDomain(domain: string): Promise<Enrichment> {
  const [mail, uni] = await Promise.all([mailInfo(domain), universityInfo(domain)]);
  return {
    ...mail,
    ...uni,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
  };
}

/** Enrich a batch with bounded concurrency. */
export async function enrichAll(domains: string[], concurrency = 8): Promise<Map<string, Enrichment>> {
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
