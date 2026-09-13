# Organic Content Ideation

A prototype of the "O" step in the STORMING process: harvest the Instagram home feed, rank posts by how far they beat their own account's baseline, dissect the hooks that made them work, and send the winners to MarioBot for ad copy.

**Live demo — https://organic-content-ideation.vercel.app** · [what's real on it and what isn't](docs/DEMO.md)

> Test project prototype. Runs locally, single operator, no auth. See [`PLAN.md`](PLAN.md) for the approach, [`docs/DEMO.md`](docs/DEMO.md) for verification status, and [`docs/QUESTIONS.md`](docs/QUESTIONS.md) for open items.

## What it does

1. **Harvest** — a Playwright session drives a manually logged-in Instagram account and captures the first N home-feed posts.
2. **Rank** — each post gets an outlier multiple: its engagement divided by the median of that account's recent posts. The same arithmetic the strategist does by eye.
3. **Dissect** — visual hook, audio hook, caption and full transcript, each extracted automatically and each editable.
4. **Write** — one button sends the selected hooks to MarioBot and streams the response back beside the source post.

Everything lands in one SQLite file, readable from the UI or the CLI.

## Setup

Requires Node 20+, Python 3.11+, and `ffmpeg` on PATH.

```bash
npm install
cp .env.example .env     # then fill in the keys
npm run db:push          # creates data.db
npm run seed             # loads fixtures/sample-feed.json
                         # (add -- --reset to wipe edits and start clean)
npm run dev              # http://localhost:3000
```

That is enough to see the whole flow, including live copy generation. The two extra
pieces are only needed to harvest real posts:

```bash
npx patchright install chromium      # the feed harvester (patched Playwright)

python3 -m venv .venv                # enrichment: frames, OCR, transcription
.venv/bin/pip install -r scraper/requirements.txt
```

Enrichment needs its own virtualenv — Homebrew and system Pythons refuse global
installs (PEP 668). `npm run enrich` uses `.venv` when it exists.

## Connecting an Instagram account

One-time, and a human does the login:

```bash
npm run ig:login                  # opens Chromium; log in by hand, 2FA included, then close
npm run ig:status                 # confirms the session is live, and whose it is
npm run ig:harvest -- --limit=10
```

`ig:status` exists because a dead session fails quietly: Instagram serves its login
form at the feed URL without redirecting, so a logged-out harvest returns nothing
and looks like an empty feed rather than an expired login.

The session persists in `.ig-profile/` (gitignored). Use a burner account, not a business one — see the risk section of [`PLAN.md`](PLAN.md).

## CLI

The same SQLite file the UI reads, so anything triaged in the browser is immediately
queryable here.

```bash
npm run cli -- posts list                     # ranked by outlier multiple
npm run cli -- posts list --min-multiple=3    # only the ones worth a look
npm run cli -- posts show <id>                # all four hook fields
npm run cli -- write <id> --hooks=10          # MarioBot, streamed to stdout
npm run cli -- export --format=md --status=saved
```

```
  id                          multiple  account                visual hook
  --------------------------------------------------------------------------------
  cmtxqjwrj0002ryc167zltzn5        11x  @thegreyzone.hrt       your doctor called this "normal"
  cmtxqjwrm0007ryc1s3tkb7qd       6.8x  @hormonehonest         why you need to be SLAMMING carbs for fat loss
  cmtxqjwrp000cryc1r0c1ogsl       6.2x  @nightshiftgains       the 4am cortisol trap
  cmtxqjws5001bryc1xjdlxfma   unscored  @rawprotocol           stop eating the seed oils. all of them.
```

## Layout

```
src/lib/outlier.ts      the scoring logic — the arithmetic from the Loom, made explicit
src/lib/store.ts        one data interface, two backings (SQLite locally, memory on the demo)
src/lib/mariobot.ts     the writing bot client, with the Genesis transport wired and waiting
scraper/harvest.ts      Playwright home-feed harvester
scraper/enrich.py       frames -> visual hook, audio -> spoken hook and transcript
src/components/         the workbench UI
scripts/cli.ts          CLI over the same database
prisma/schema.prisma    accounts, posts, hooks, generations
fixtures/               captured runs, so any demo is reproducible
docs/                   design direction, demo notes, open questions
```

## Tests

```bash
npm test                 # scoring rules, payload parser, then the browser smoke test
npm run test:outlier     # what the multiple means, and when it refuses to guess
npm run test:harvest     # the feed payload walker, against captured response shapes
npm run test:smoke       # a real browser against a running dev server
```

`test:smoke` needs `npm run dev` running, or point it at the deployed demo:

```bash
SMOKE_URL=https://organic-content-ideation.vercel.app npm run test:smoke
```
 These are the checks that caught actual
bugs while building — switching posts must swap every field, long transcripts must
not be clipped, and typing `x` in a caption must not reject the post.

## Limitations

Stated up front rather than discovered later:

- Instagram has no home-feed API. This scrapes an authenticated session, which breaches their ToS and carries account-restriction risk. Burner accounts only.
- The DOM and payload shapes change without notice. Expect the harvester to need maintenance.
- Outlier multiples are only as good as the visible counts. Private accounts and hidden like counts degrade the score, and the UI says so rather than guessing.
- Extraction is a first draft. Every field is editable because the strategist's judgment is the product.
