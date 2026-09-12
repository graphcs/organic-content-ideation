# Organic Content Ideation

A prototype of the "O" step in the STORMING process: harvest the Instagram home feed, rank posts by how far they beat their own account's baseline, dissect the hooks that made them work, and send the winners to MarioBot for ad copy.

> Test project prototype. Runs locally, single operator, no auth. See [`PLAN.md`](PLAN.md) for the approach and [`docs/QUESTIONS.md`](docs/QUESTIONS.md) for open items.

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
npx playwright install chromium
pip install -r scraper/requirements.txt

cp .env.example .env     # then fill in the keys
npx prisma migrate dev
npm run seed             # loads fixtures/sample-feed.json
npm run dev              # http://localhost:3000
```

The app boots against fixture data, so you can see the whole flow before connecting an account.

## Connecting an Instagram account

One-time, and a human does the login:

```bash
npm run ig:login    # opens Chromium, log in by hand including 2FA, then close
npm run ig:harvest -- --limit 10
```

The session persists in `.ig-profile/` (gitignored). Use a burner account, not a business one — see the risk section of [`PLAN.md`](PLAN.md).

## CLI

```bash
npm run cli -- posts list --min-multiple 3
npm run cli -- posts show <id>
npm run cli -- write <id> --hooks 10
npm run cli -- export --format md
```

## Layout

```
prisma/schema.prisma    accounts, posts, hooks, generations
scraper/                Playwright harvester + Python enrichment worker
src/app/                Next.js UI and API routes
src/lib/outlier.ts      the scoring logic
fixtures/               captured runs, for reproducible demos
docs/                   design direction, open questions
```

## Limitations

Stated up front rather than discovered later:

- Instagram has no home-feed API. This scrapes an authenticated session, which breaches their ToS and carries account-restriction risk. Burner accounts only.
- The DOM and payload shapes change without notice. Expect the harvester to need maintenance.
- Outlier multiples are only as good as the visible counts. Private accounts and hidden like counts degrade the score, and the UI says so rather than guessing.
- Extraction is a first draft. Every field is editable because the strategist's judgment is the product.
