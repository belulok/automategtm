const PATHS = ['', '/about', '/pricing'];
// A plain bot UA gets 403 from a lot of sites behind Cloudflare.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Crude but dependency-free HTML -> text. Good enough to feed an LLM. */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
  if (og) return og[1].trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t ? t[1].split(/[|–—-]/)[0].trim() : null;
}


/**
 * Client-rendered sites return a near-empty body, so the only real signal is in
 * <head>. This matters more than it sounds: much of the target market ships an
 * unprerendered SPA, and a crawler that ignores metadata sees nothing at all.
 */
function metaOf(html: string): string {
  const keys = ['description', 'og:title', 'og:description', 'twitter:description', 'keywords'];
  const out: string[] = [];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) out.push(`title: ${title[1].trim()}`);
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]+content=["']([^"']+)`, 'i');
    const m = html.match(re);
    if (m) out.push(`${k}: ${m[1].trim()}`);
  }
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (h1.length) out.push(`h1: ${h1.join(' | ')}`);
  return out.join('\n');
}

export type Crawled = {
  domain: string;
  title: string | null;
  pages: { path: string; text: string }[];
  /** True when the site rendered almost nothing server-side. */
  thin: boolean;
};

export class CrawlBlockedError extends Error {
  constructor(public host: string, public status: number | null) {
    super(`Could not read ${host} directly (${status ?? 'no response'}).`);
    this.name = 'CrawlBlockedError';
  }
}

/** Try the bare host, then www, then plain http. */
function originsFor(host: string): string[] {
  const bare = host.replace(/^www\./, '');
  return [`https://${bare}`, `https://www.${bare}`, `http://${bare}`];
}

export async function crawl(domain: string, signal?: AbortSignal): Promise<Crawled> {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const pages: { path: string; text: string }[] = [];
  let title: string | null = null;
  let lastStatus: number | null = null;

  // Find an origin that answers before spending requests on sub-pages: some
  // hosts only serve www, and some redirect http -> https only.
  let origin: string | null = null;
  for (const candidate of originsFor(host)) {
    try {
      const res = await fetch(candidate, {
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
        signal: signal ?? AbortSignal.timeout(15_000),
        redirect: 'follow',
      });
      lastStatus = res.status;
      if (res.ok) {
        origin = new URL(res.url).origin;
        break;
      }
    } catch {
      // try the next origin
    }
  }

  if (!origin) throw new CrawlBlockedError(host, lastStatus);

  for (const path of PATHS) {
    try {
      const res = await fetch(`${origin}${path}`, {
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
        signal: signal ?? AbortSignal.timeout(15_000),
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const html = await res.text();
      title ??= titleOf(html);
      const body = toText(html).slice(0, 6_000);
      const meta = metaOf(html);
      // Prefer the body, but always keep the metadata — on an SPA it is all there is.
      const text = [meta, body].filter((s) => s.length > 0).join('\n\n');
      if (text.length > 40) pages.push({ path: path || '/', text });
    } catch {
      // A missing /about or /pricing is normal. Only the root really matters.
    }
  }

  if (pages.length === 0) throw new CrawlBlockedError(host, lastStatus);
  // Under ~400 chars means client-rendered: metadata only, no real copy.
  const thin = pages.reduce((n, p) => n + p.text.length, 0) < 400;
  return { domain: host, title, pages, thin };
}
