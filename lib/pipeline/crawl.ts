const PATHS = ['', '/about', '/pricing'];
const UA = 'Mozilla/5.0 (compatible; auto-gtm/0.1; +https://example.com/bot)';

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

export async function crawl(domain: string, signal?: AbortSignal): Promise<Crawled> {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const pages: { path: string; text: string }[] = [];
  let title: string | null = null;

  for (const path of PATHS) {
    try {
      const res = await fetch(`https://${host}${path}`, {
        headers: { 'user-agent': UA },
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

  if (pages.length === 0) {
    throw new Error(`Could not read anything from ${host}. Is the domain correct and public?`);
  }
  // Under ~400 chars means client-rendered: metadata only, no real copy.
  const thin = pages.reduce((n, p) => n + p.text.length, 0) < 400;
  return { domain: host, title, pages, thin };
}
