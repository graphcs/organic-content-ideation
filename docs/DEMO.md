# Demo notes

**Live demo:** https://organic-content-ideation.vercel.app

## What is real on the hosted demo

- The full interface, triage, keyboard shortcuts and editable hook fields.
- Outlier scoring — the multiples you see are computed at runtime from each account's baseline sample, not hardcoded.
- **The writing step is live.** "Write copy" makes a real streaming API call and renders the response token by token.

## What is not

- **The feed is a sample harvest, not a live scrape.** Reading the Instagram home feed needs a logged-in browser session, which cannot run on a serverless host — and should not, since unattended automation is the main account-restriction risk. The harvester is real code that runs locally; see below.
- **Triage does not persist.** The demo holds its posts in memory so every visitor gets a clean feed and nobody's triage leaks into anyone else's. Locally, everything is in SQLite and the CLI reads the same records.
- **The writing bot is not yet MarioBot.** The brief's OpenRouter key is a standard inference key and OpenRouter has no `mario` slug, so this runs against Claude Haiku 4.5 on the same OpenAI-compatible interface. Pointing it at your bot is one environment variable — see `docs/QUESTIONS.md`.
- **Post thumbnails are placeholders.** Instagram's CDN URLs are signed and expire within hours, so a captured thumbnail is not something a demo can depend on. Each post gets a deterministic colour instead, which turns out to be useful for recognising posts while triaging.

The demo's writing endpoint is rate limited to 12 calls per IP per hour, because it spends the client's OpenRouter credit and the link is public.

## Seeing the real harvester

```bash
npm run ig:login                  # log in by hand, once, on a burner account
npm run ig:harvest -- --limit=10  # scroll the feed, capture 10 posts, build baselines
npm run enrich                    # opening frames and audio -> visual and spoken hooks
npm run dev
```

Each run is also written to `fixtures/feed-<timestamp>.json`, so any harvest can be replayed later without touching Instagram again.

## Verification status

| Piece | Status |
|---|---|
| UI, triage, scoring, CLI | Run against the sample harvest end to end |
| Streaming writing bot | Verified live, in the browser and from the CLI |
| Playwright harvester | **Written, not yet run against a live account** — no Instagram account has been connected. This is the piece that needs the burner account decision in `docs/QUESTIONS.md` |
| Enrichment worker | **Written, not yet run** — it needs videos from a real harvest |

Those last two are stated plainly rather than glossed: the brief asks for one manually connected account, and that account does not exist yet.
