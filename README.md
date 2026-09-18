# auto-gtm

Point it at a domain. It reads the site, finds competitors, splits the market
into buyer segments, and scores candidate customers against each segment's own
criteria.

## Run it

```bash
npm install
npm run dev
```

`.env` needs three vars (any OpenAI-compatible endpoint):

```
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=...
AI_MODEL=minimax/minimax-m2
```

Search is optional but it is what makes steps 2 and 4 real rather than recalled.
The first key found wins:

| Var | Provider | Free tier |
|---|---|---|
| `TAVILY_API_KEY` | Tavily | **1,000 searches/month, no credit card** |
| `EXA_API_KEY` | Exa | usage-based, free credits to start |
| `BRAVE_API_KEY` | Brave | $5/month credits, **card required** |
| `SEARXNG_URL` | SearXNG you host | free and unlimited, you run it |

Self-hosting SearXNG, if you would rather run it than sign up:

```bash
docker run -d --name searxng -p 8080:8080 \
  -e SEARXNG_SETTINGS__SEARCH__FORMATS='["html","json"]' searxng/searxng
# then: SEARXNG_URL=http://localhost:8080
```

There is no keyless option. DuckDuckGo's `html/` and `lite/` endpoints both
answer `202` with an anti-bot page, and public SearXNG instances disable JSON
or rate-limit on the first request. Both were tested, not assumed.

## The pipeline

| Step | What it does | Needs |
|---|---|---|
| 1 Research | Fetch `/`, `/about`, `/pricing`; extract what you sell and to whom | nothing |
| 2 Competitors | Three generated queries → search → dedupe by domain | a search key (falls back to model recall, flagged in UI) |
| 3 Campaigns | Split the market into 4–6 segments with pain, criteria, examples | nothing |
| 4 Customers | Search per segment, then **score 0–5 against that segment's criteria** | a search key |

Step 4's scoring pass is the point. Without it a segment named "University
Career Centers" quietly fills with staffing agencies.

## Notes

- **Client-rendered sites.** A plain `fetch` of an unprerendered SPA returns only
  `<head>`. The crawler falls back to title/description/og/h1 and marks the run
  `thin` so the model knows not to invent features. For real JS rendering, add
  Firecrawl.
- **Name normalisation.** Step 1 is told to fix stylised wordmarks, because this
  name ends up in email subject lines. A title tag reading `Web#Merger` should
  come out as `WebMerger`.
- **Storage** is SQLite via Drizzle, created inline on boot — no migration step.
  Swap `lib/db/index.ts` for Neon/Postgres to deploy; the schema is portable.

## Not built

Sending infrastructure, reply handling, email finding. Those are bought, not
built: pre-warmed mailboxes from Instantly/Smartlead/Mailreef, and emails from a
Hunter → Findymail → LeadMagic waterfall.
