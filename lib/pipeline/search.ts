/**
 * Web search, with whatever you have.
 *
 * Picks the first provider that has a key, and falls back to DuckDuckGo, which
 * needs no key at all. Every hit carries `verified` so the UI can distinguish a
 * real search result from the model's own recall.
 */
export type SearchHit = {
  domain: string;
  name: string | null;
  snippet: string | null;
  verified: boolean;
};

export type Provider = 'exa' | 'tavily' | 'brave' | 'searxng' | 'none';

/**
 * Ranked best-first.
 *
 * There is no keyless option any more: DuckDuckGo's html/ and lite/ endpoints
 * both answer 202 with an anti-bot page, and public SearXNG instances disable
 * JSON or rate-limit immediately. SEARXNG_URL is for an instance you run
 * yourself, which is free and unlimited but yours to host.
 */
export function activeProvider(): Provider {
  if (process.env.EXA_API_KEY) return 'exa';
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.BRAVE_API_KEY) return 'brave';
  if (process.env.SEARXNG_URL) return 'searxng';
  return 'none';
}

export const hasSearch = () => activeProvider() !== 'none';

const SKIP = new Set([
  'duckduckgo.com', 'google.com', 'bing.com', 'youtube.com', 'facebook.com',
  'twitter.com', 'x.com', 'linkedin.com', 'instagram.com', 'reddit.com',
  'wikipedia.org', 'medium.com', 'quora.com', 'pinterest.com', 'amazon.com',
  'g2.com', 'capterra.com', 'producthunt.com', 'trustpilot.com', 'github.com',
]);

function hostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (SKIP.has(h) || h.endsWith('.wikipedia.org')) return null;
    return h;
  } catch {
    return null;
  }
}

function dedupe(rows: SearchHit[], limit: number): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const r of rows) {
    if (seen.has(r.domain)) continue;
    seen.add(r.domain);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();

/* ------------------------------------------------------------- providers */

async function viaExa(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
    body: JSON.stringify({ query, numResults: limit, type: 'auto', contents: { text: { maxCharacters: 400 } } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { results?: { url: string; title?: string; text?: string }[] };
  return (json.results ?? []).flatMap((r) => {
    const domain = hostOf(r.url);
    return domain ? [{ domain, name: r.title ?? null, snippet: r.text?.slice(0, 300) ?? null, verified: true }] : [];
  });
}

async function viaTavily(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TAVILY_API_KEY!}` },
    body: JSON.stringify({ query, max_results: limit, search_depth: 'basic' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { results?: { url: string; title?: string; content?: string }[] };
  return (json.results ?? []).flatMap((r) => {
    const domain = hostOf(r.url);
    return domain ? [{ domain, name: r.title ?? null, snippet: r.content?.slice(0, 300) ?? null, verified: true }] : [];
  });
}

async function viaBrave(query: string, limit: number): Promise<SearchHit[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(limit, 20)));
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'x-subscription-token': process.env.BRAVE_API_KEY! },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { web?: { results?: { url: string; title?: string; description?: string }[] } };
  return (json.web?.results ?? []).flatMap((r) => {
    const domain = hostOf(r.url);
    return domain ? [{ domain, name: r.title ? decode(r.title) : null, snippet: r.description ? decode(r.description) : null, verified: true }] : [];
  });
}

/**
 * A SearXNG instance you host. Free, unlimited, no signup, no card.
 *
 *   docker run -d --name searxng -p 8080:8080 \
 *     -e SEARXNG_SETTINGS__SEARCH__FORMATS='["html","json"]' searxng/searxng
 *
 * Then set SEARXNG_URL=http://localhost:8080. JSON output is off by default,
 * which is why the env var above is not optional.
 */
async function viaSearxng(query: string, limit: number): Promise<SearchHit[]> {
  const base = process.env.SEARXNG_URL!.replace(/\/+$/, '');
  const url = new URL(`${base}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');

  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`SearXNG ${res.status}: is JSON enabled in settings.yml?`);

  const json = (await res.json()) as { results?: { url: string; title?: string; content?: string }[] };
  return (json.results ?? []).slice(0, limit * 2).flatMap((r) => {
    const domain = hostOf(r.url);
    return domain ? [{ domain, name: r.title ?? null, snippet: r.content?.slice(0, 300) ?? null, verified: true }] : [];
  });
}

/* ------------------------------------------------------------------ api */

export async function searchWeb(query: string, limit = 12): Promise<SearchHit[]> {
  const provider = activeProvider();
  try {
    switch (provider) {
      case 'exa':
        return dedupe(await viaExa(query, limit), limit);
      case 'tavily':
        return dedupe(await viaTavily(query, limit), limit);
      case 'brave':
        return dedupe(await viaBrave(query, limit), limit);
      case 'searxng':
        return dedupe(await viaSearxng(query, limit), limit);
      default:
        return [];
    }
  } catch (err) {
    // A failed search degrades the run, it does not end it.
    console.warn(`[search:${provider}] ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
