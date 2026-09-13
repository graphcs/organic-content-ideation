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
| UI, triage, editing, filters, keyboard | Verified in a real browser — `npm run test:smoke` |
| Outlier scoring, including refusing to score | Verified — `npm run test:outlier` |
| Streaming writing bot | Verified live, in the browser and from the CLI |
| CLI, and that it reads the UI's edits | Verified end to end |
| Enrichment: audio hooks and transcripts | **Verified** against generated speech, music-only and silent clips — all three classified correctly |
| Enrichment: visual hooks from frames | Frame extraction verified; the vision call itself needs an `ANTHROPIC_API_KEY`, and degrades to "keep what is there" without one |
| Harvester: feed payload parser | Verified against captured response shapes — `npm run test:harvest` |
| Harvester: session detection | Verified — correctly reports a logged-out profile, and refuses to harvest rather than returning an empty feed |
| Harvester: the live scroll | **Not run against a live account.** No Instagram account is connected yet — this needs the burner decision in `docs/QUESTIONS.md` |

The last row is stated plainly rather than glossed. Everything above it has been executed; that one has not, because the account the brief asks for does not exist yet.

## Bugs this testing found

Worth listing, because they are the kind that survive a demo and surface a week later:

1. **Prisma wrote the database somewhere nothing else looked.** `file:./data.db` resolves relative to `prisma/schema.prisma`, not the project root, so the Python enrichment worker would never have found it.
2. **A failed extraction wiped good data.** An expired video URL or a missing API key would null out hooks the harvester had already captured. Enrichment now fills gaps and never destroys.
3. **Switching posts left the previous post's text on screen.** The editable fields used `defaultValue`, which React only reads once — so the header said one account and the hooks belonged to another. The single worst bug for a tool whose entire job is reading the right hooks.
4. **Long captions and transcripts were clipped to one line.** The autosizing field measured its height before the web font loaded, then never re-measured.
5. **`export --format=md` silently returned JSON.** The flag parser only looked at arguments after the first two positions.
6. **A logged-out session read as logged in.** Instagram serves its login form at the feed URL without redirecting, so checking the address for `/accounts/login` never fired. A dead session would have produced an empty harvest that looked like a quiet feed.
