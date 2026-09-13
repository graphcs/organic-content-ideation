# Implementation Plan — Organic Content Ideation Prototype

**Client:** Creative Strategy System (STORMING → "O")
**Budget:** $1,200 fixed
**Goal:** Demonstrate the end-to-end ideation loop — Instagram home feed → outlier detection → hook capture → MarioBot copy generation — with one manually connected account and a sample of 10 recent feed posts.

---

## 1. My reading of the workflow

From the Loom walkthroughs, the current manual process is four steps:

| Step | What the strategist does today | What the prototype does |
|---|---|---|
| **Scroll** | Opens a feed that's been primed for the product market (testosterone) and scrolls | A Playwright session drives the real home feed and captures the first N posts |
| **Judge outlier** | Eyeballs the account's follower count and typical view count, then asks "how much more did *this* one get?" (the "3–4×" reasoning at 1:52) | Compute an **outlier multiple** = post engagement ÷ that account's median engagement across its recent posts, and surface it as the primary sort key |
| **Dissect** | Manually writes the visual hook, audio hook, caption and body into a Google Doc | Auto-extract all four into structured DB fields, editable in the UI |
| **Write** | Pastes the idea into MarioBot: *"write me 10 hooks based on this idea…"* | One button → streamed MarioBot response rendered next to the source post |

The key insight from the Looms is that **the outlier multiple is the signal, and the hooks are the payload.** Everything else is plumbing. The strategist explicitly says they're "not attached to how this is broken down" — so the breakdown is a design decision I own, and it should optimise for *fast triage* (skim 30 posts, keep 3) rather than exhaustive capture.

Second insight: the strategist is "willing to take risks" on relevance because their own judgment is the filter. So the bot should **over-collect and rank**, not pre-filter aggressively. A false positive costs one second of scrolling; a false negative costs a viral idea.

---

## 2. Architecture

```
┌─────────────────┐
│  Playwright     │  headed Chromium, persistent profile
│  feed harvester │  (one manually logged-in IG account)
└────────┬────────┘
         │ posts + media URLs
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Enrichment     │────▶│  ffmpeg → frame  │ visual hook OCR
│  worker (Python)│     │  ffmpeg → audio  │ Whisper transcript
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐
│  SQLite/Prisma  │  accounts, posts, hooks, generations
└────────┬────────┘
         │
    ┌────┴─────┬──────────────┐
    ▼          ▼              ▼
┌────────┐ ┌────────┐  ┌─────────────┐
│ Next.js│ │  CLI   │  │  MarioBot   │ streamed SSE
│  UI    │ │ (node) │  │  via API    │
└────────┘ └────────┘  └─────────────┘
```

**Stack:** Next.js 15 (App Router) + Prisma/SQLite + a Python enrichment worker. SQLite is deliberate — the brief asks for CLI access to the same data, and a single `data.db` file means the reviewer runs `npm run dev` and it works, with no Postgres or Docker.

---

## 3. Feed access — approach, trade-offs, risks

There is no official API for the Instagram **home feed**. The Graph API covers only owned business accounts; third-party scraper APIs (Apify, Bright Data) reach public profiles and hashtags but **cannot see a personalised home feed**, which is the entire premise of the workflow — the feed *is* the curation layer.

### Chosen approach: Playwright with a persisted logged-in session

A headed Chromium instance with a persistent user-data directory. The account is logged in **once, manually, by a human**, including any 2FA. From then on the session cookie is reused. The script scrolls the home feed, reads each post from the DOM, and records post URL, author, caption, like/comment/view counts, and media URLs.

**Why this and not the alternatives:**

| Option | Sees home feed? | Ban risk | Cost | Verdict |
|---|---|---|---|---|
| Graph API | No | None | Free | Wrong surface entirely |
| Apify / Bright Data | No (profiles/hashtags only) | Low | see below | Misses the premise — but see the hybrid |
| Private mobile API (instagrapi etc.) | Yes | **High** — unofficial signed endpoints, known ban vector | Free | Fastest to break, worst risk |
| **Playwright, real session** | **Yes** | **Moderate** | Free | Chosen |
| Chrome extension on the strategist's own browsing | Yes | Lowest | Free | Best long-term; too many moving parts for a prototype demo |

**Why Playwright and not an agentic browser tool.** Three things were considered:

- **Stagehand** (LLM-driven browser automation) earns its cost when you are scraping the *DOM* and the DOM keeps changing — you ask for "the view count" instead of writing a selector. This harvester reads the feed's own XHR payloads instead, so that resilience is already bought a cheaper way. Putting an LLM in the extraction path would also mean a hallucinated view count could silently corrupt every outlier multiple downstream, which is the one number the whole tool is built around. It does nothing for detection either — it is Playwright underneath.
- **An agent driving the operator's real Chrome** has the lowest detection risk of anything here, because it *is* a real human session. But it cannot ship as `npm run ig:harvest`, it needs an agent running to work at all, and it is not something the client can hand to someone else. That approach is the right long-term answer as a browser extension, which is why it is listed in the table above.
- **Plain Playwright** is trivially fingerprinted. Instagram checks. So the harvester runs on **patchright**, a drop-in patched Playwright that closes the well-known CDP leaks, and falls back to stock Playwright with a warning if it is not installed.

Stealth only stops you being identified as automation. It does nothing about *behaving* like a bot, which is the larger risk and is handled by pacing — see below.

### The hybrid: session for discovery, Apify for metrics

Checked rather than assumed. No actor in Apify's store reads a logged-in home feed; their first-party scraper works from the logged-out page and takes only profile, hashtag and post URLs. A handful of community actors accept a session cookie, but the general-purpose one shows 4,718 failed runs against 1,477 succeeded over thirty days. Apify cannot replace the session.

It can, however, take over the most expensive part of a harvest. Scoring an outlier needs the author's recent posts as a denominator, which means visiting every unique author's grid — roughly tripling the automated requests a ten-post harvest makes from the burner account. Request volume, not scrolling, is what gets accounts limited. Those profiles are public data, so there is no reason to spend the burner's risk budget on them.

So the split is: **the logged-in session discovers which posts are in the feed; Apify supplies the numbers.** The burner does only the thing a human does anyway — scroll. `apify/instagram-scraper` returns exact integers (`videoPlayCount`, `videoViewCount`, `likesCount`), not rendered strings like "402K".

There is a methodological trap here worth naming. Instagram shows logged-in viewers metrics it hides from logged-out ones, so a numerator read from the feed and a denominator read from Apify are not strictly comparable, and the ratio between them would be quietly wrong. When Apify is in use the harvester therefore takes the post's *own* count from the Apify sample as well, so both halves of the multiple come from the same viewing context.

Two details that bite: `likesCount` comes back as **`-1`** when a creator has hidden engagement, which must read as "unknown" rather than as a number; and `videoPlayCount` and `videoViewCount` are different figures for the same reel. Both are handled and tested.

**Cost.** About 120 items per ten-author harvest: **$0.32** on the free tier, $0.23 on Scale. The free plan's $5/month allowance covers roughly fifteen harvests. Set `APIFY_TOKEN` to switch it on; unset, it falls back to visiting profiles from the session and costs nothing but risk.

**Risks, stated plainly:**

1. **Terms of Service.** Automated collection breaches Instagram's ToS. This is true of every method that reaches the home feed, including the manual copy-paste the team does today, at a different scale. Mitigation is behavioural, not technical: use a **dedicated burner account** that is not linked to a business asset, never the client's real account.
2. **Account restriction.** Rate is the main trigger. The harvester runs headed, at human-like scroll speed with randomised dwell times, caps at ~30 posts per run, and does not run unattended on a schedule. For a 10-post demo this is well inside normal usage.
3. **DOM fragility.** Instagram's class names are obfuscated and rotate. I select on stable structural signals (`article` elements, `<video>`/`<img>` descendants, `time[datetime]`, anchors matching `/p/` and `/reel/`) rather than class names, and **intercept the GraphQL/XHR responses the feed itself fetches** — those payloads are far more stable than the rendered DOM and give exact counts rather than parsed strings like "12.4K".
4. **Metric availability.** Reels expose play counts; feed images often expose only likes, and some accounts hide like counts entirely. The outlier score degrades gracefully: it uses the richest metric available and labels which one it used, rather than silently comparing incomparable numbers.
5. **Demo reliability.** A live login can fail in front of a client. Every harvested run is written to `fixtures/feed-*.json`, and the app can boot from a fixture with `SEED_FROM_FIXTURE=1`. **The demo never depends on a live Instagram session** — the live harvest is shown as a separate, deliberate step.

---

## 4. Outlier scoring

The strategist's mental model, made explicit:

```
outlier_multiple = post_engagement / median(recent_engagement_for_that_account)
```

To get the denominator, the harvester makes one extra visit to each author's profile grid and reads the visible counts of their last ~12 posts. That's one page load per unique author — cheap, and it's exactly the check performed manually in the Loom ("he's got about 2,000 followers, most of his views are around 2,000… this is like a 3 to 4×").

Fallback when the profile is private or counts are hidden: `engagement / follower_count` as a weaker **engagement rate** signal, flagged in the UI as a different, less trustworthy measurement. Never blend the two into one number.

**Bands:** ≥5× standout · 2–5× worth a look · <2× baseline. Bands are honest about sample size — an account with three visible posts produces a wide band, and the UI says so rather than pretending to precision.

---

## 5. Hook extraction

Four fields per post, matching the Loom vocabulary exactly:

- **Visual hook** — text burned into the opening frame. `ffmpeg` pulls frames at 0.0s / 0.5s / 1.0s, then OCR. *Plan: Claude vision on the frame rather than Tesseract — Instagram text overlays are stylised, animated and often low-contrast, which is where classical OCR fails, and a vision model also reports what's physically happening in the shot, which Tesseract cannot.*
- **Audio hook** — first spoken sentence. `ffmpeg` strips audio → Whisper. Music-only clips are detected and marked "no spoken hook" rather than transcribed into nonsense — the Loom shows this case at 2:50 and it matters that the UI says "music only" instead of leaving a blank.
- **Caption** — captured verbatim from the feed payload.
- **Body / transcript** — the full Whisper transcript when speech exists.

Every field is **editable**. The strategist's judgment is the product; extraction is a first draft, never the final word.

---

## 6. MarioBot integration

One button on a selected post composes a prompt from the captured fields and POSTs to the MarioBot slug via OpenRouter, streaming the response back over SSE and rendering it token-by-token beside the source post. Every generation is persisted against the post so the swipe file accumulates both the raw material and what was written from it.

Default prompt mirrors the Loom verbatim — *"please write me 10 hooks based on this idea: {visual_hook}"* — with the caption and transcript supplied as context. The prompt is editable in the UI before sending, because the Loom shows the strategist iterating on phrasing.

**Open items for the client** — see `docs/QUESTIONS.md`. Chiefly: the exact request shape for the Mario-Bot slug and what the Genesis API key authenticates.

---

## 7. CLI

The brief asks for CLI access to the same data. `npm run cli` against the same SQLite file:

```
ideation feed sync --limit 10        # run the harvester
ideation posts list --min-multiple 3 # ranked outliers
ideation posts show <id>             # all four hook fields
ideation write <id> --hooks 10       # MarioBot, streamed to stdout
ideation export --format json|md     # the swipe file
```

---

## 8. Scope and priorities

Ranked by what demonstrates understanding of the workflow, which is what the brief says is being evaluated.

**Must ship**
1. Harvest 10 real home-feed posts from one connected account
2. Outlier multiple computed against per-account baseline, ranked
3. Four hook fields extracted and editable
4. Save/reject triage with persistence
5. One-button MarioBot call with streamed output
6. CLI over the same database
7. Fixture mode so the demo is reproducible

**Cut, and why**
- *Auth / multi-user* — one local operator is the stated scope
- *Deployment* — runs locally; a hosted Instagram session is a separate problem with its own risks
- *Product-relevance scoring* — the Loom is explicit that the strategist wants to make this call themselves and is "willing to take risks"
- *Background scheduling* — unattended runs are precisely the ban vector worth avoiding
- *Video archival* — store URLs and one keyframe, not the files

**If budget forces a further cut,** the first thing to go is Whisper transcription (fall back to caption + visual hook only). The visual hook and the outlier multiple carry most of the signal in the Looms; the transcript is supporting evidence.

---

## 9. Third-party costs

| Item | Purpose | Cost | Ongoing? |
|---|---|---|---|
| OpenRouter / MarioBot | Copy generation | Client's key | Per call, client's account |
| Claude API (vision) | Visual hook extraction from frames | ~$2–5 for the whole build | Yes, per post if used in production |
| Apify (optional) | Author baselines, off-session | ~$0.32 per 10-author harvest | Only if enabled |
| Whisper | Audio hooks | $0 local (`faster-whisper`) | No |
| Playwright, ffmpeg, SQLite | Harvest, media, storage | $0 | No |

Nothing paid gets used without written sign-off first. Realistic total exposure for the prototype: **under $10.** The only item that scales with usage later is the vision call — roughly a cent per post, and it can be swapped for local OCR at a quality cost if that matters.

---

## 10. Build sequence

| # | Milestone | Output |
|---|---|---|
| 1 | Schema, fixtures, app shell | Runs against sample data end to end |
| 2 | Playwright harvester | 10 real posts in the DB |
| 3 | Outlier scoring | Ranked feed matching the Loom's reasoning |
| 4 | Enrichment (frames, OCR, Whisper) | Four hook fields populated |
| 5 | MarioBot streaming | End-to-end loop closed |
| 6 | CLI, README, demo recording | Deliverable |

---

## 11. Assumptions

1. The connected Instagram account is a burner already primed for the target market, supplied by the client or created by me — **the client confirms which.**
2. "10 recent feed posts" means the first 10 harvested, not 10 pre-qualified outliers. The tool ranks; it does not guarantee ten winners.
3. MarioBot is OpenAI-chat-compatible over OpenRouter with a model slug. Unconfirmed — see `docs/QUESTIONS.md`.
4. Desktop-only UI. The strategist works at a desk.
5. "Not production-ready" is taken at face value: no auth, no error-recovery beyond clear messages, no horizontal scaling.
