/**
 * Instagram home-feed harvester.
 *
 * There is no official API for the home feed, and the home feed is the whole point
 * of this workflow — it is the curation layer the strategist relies on. So this
 * drives a real, headed Chromium against a session a human logged into once.
 *
 * Two things make it less brittle than a naive scraper:
 *
 *  1. It listens to the feed's own XHR responses. Those payloads carry exact counts
 *     and stable field names, where the rendered DOM gives you "12.4K" and class
 *     names that rotate weekly.
 *  2. Where it does touch the DOM, it selects on structure — article elements,
 *     time[datetime], anchors matching /p/ and /reel/ — never on styling classes.
 *
 * On stealth: vanilla Playwright is trivially detectable. It leaks the usual CDP
 * signals, and Instagram checks. So the browser comes from `patchright` — a drop-in
 * patched Playwright that closes those leaks — and falls back to plain Playwright if
 * it is not installed, which is fine for reading the tests but not for a real run.
 *
 * Stealth reduces the chance of being *fingerprinted* as automation. It does nothing
 * about behaving like a bot, which is the larger risk and is handled by pacing:
 * human-speed scrolling, randomised dwell, a cap per run, and never unattended.
 *
 * Risks are documented in PLAN.md section 3. The short version: use a burner.
 */

import type { BrowserContext, Page } from "patchright";
import { mkdirSync, writeFileSync } from "node:fs";
import { apifyEnabled, fetchAccountMetrics } from "./baselines";

const PROFILE_DIR = ".ig-profile";
const FEED_URL = "https://www.instagram.com/";

export interface HarvestOptions {
  limit: number;
  /** Randomised pause between scrolls. Human-paced on purpose, not to be clever. */
  dwellMs?: [number, number];
  /** Skip the per-author profile visit that builds the baseline. Faster, less useful. */
  skipBaselines?: boolean;
}

export interface HarvestedPost {
  shortcode: string;
  url: string;
  handle: string;
  displayName: string | null;
  followers: number | null;
  mediaType: "reel" | "image" | "carousel";
  posterHue: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  baselineSample: number[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Playwright's default UA advertises HeadlessChrome on some builds, even headed. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const between = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);

/** Stable-ish hue per handle so a post keeps its colour across runs. */
function hueFor(handle: string): number {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Prefer the patched build; say so plainly when falling back. */
async function browser() {
  try {
    return (await import("patchright")).chromium;
  } catch {
    console.warn(
      "patchright not installed — falling back to plain Playwright, which Instagram can detect. `npm i -D patchright && npx patchright install chromium`",
    );
    // Structurally the same API; the two packages just ship separate nominal types.
    return (await import("playwright")).chromium as unknown as typeof import("patchright").chromium;
  }
}

export async function openSession(): Promise<BrowserContext> {
  const chromium = await browser();
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    // Default Playwright UA advertises HeadlessChrome even when headed on some builds.
    userAgent: USER_AGENT,
  });
}

/**
 * One-time manual login. The human does the password and the 2FA.
 *
 * It waits for the login to actually succeed rather than for the window to be
 * closed: "close it when you're done" puts the burden of judging success on the
 * person, and closing a moment too early leaves a profile directory that looks
 * valid and holds no session — which is exactly what happened the first time.
 */
export async function login(timeoutMs = 5 * 60 * 1000): Promise<{ handle: string | null }> {
  const chromium = await browser();
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let windowClosed = false;
  page.on("close", () => {
    windowClosed = true;
  });

  await page.goto(FEED_URL, { waitUntil: "domcontentloaded" });
  console.log("\nLog in by hand, including 2FA. Leave the window open — this will");
  console.log("notice when you are through and close it for you.\n");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (windowClosed) {
      await ctx.close().catch(() => {});
      throw new Error("The window was closed before the login finished. Nothing was saved — run it again.");
    }

    try {
      if (!(await isLoggedOut(page))) {
        const handle = await currentHandle(page);
        // Give Chromium a moment to flush the session cookies to the profile.
        await sleep(2000);
        await ctx.close();
        console.log(`Logged in${handle ? ` as @${handle}` : ""}. Session saved to ${PROFILE_DIR}/.\n`);
        return { handle };
      }
    } catch {
      // Mid-navigation; the page will settle and the next pass will read it.
    }
    await sleep(2000);
  }

  await ctx.close().catch(() => {});
  throw new Error("Timed out waiting for the login. Nothing was saved — run it again.");
}

/**
 * Walk whatever JSON the feed hands back and pull out anything media-shaped.
 * Instagram reshapes these payloads regularly, so this looks for the field names
 * rather than for a fixed path through the object.
 */
export function collectFromPayload(node: unknown, out: Map<string, Partial<HarvestedPost>>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) collectFromPayload(item, out);
    return;
  }

  const obj = node as Record<string, any>;
  const code: string | undefined = obj.code ?? obj.shortcode;
  const user = obj.user ?? obj.owner;

  if (typeof code === "string" && user?.username) {
    const isVideo = Boolean(obj.video_versions?.length || obj.is_video || obj.product_type === "clips");
    const isCarousel = Boolean(obj.carousel_media?.length);

    const existing = out.get(code) ?? {};
    out.set(code, {
      ...existing,
      shortcode: code,
      url: `https://www.instagram.com/${isVideo ? "reel" : "p"}/${code}/`,
      handle: user.username,
      displayName: user.full_name ?? null,
      followers: typeof user.follower_count === "number" ? user.follower_count : null,
      mediaType: isCarousel ? "carousel" : isVideo ? "reel" : "image",
      thumbnailUrl: obj.image_versions2?.candidates?.[0]?.url ?? existing.thumbnailUrl ?? null,
      videoUrl: obj.video_versions?.[0]?.url ?? existing.videoUrl ?? null,
      postedAt: obj.taken_at ? new Date(obj.taken_at * 1000).toISOString() : (existing.postedAt ?? null),
      views:
        obj.play_count ?? obj.ig_play_count ?? obj.view_count ?? existing.views ?? null,
      likes: typeof obj.like_count === "number" ? obj.like_count : (existing.likes ?? null),
      comments: typeof obj.comment_count === "number" ? obj.comment_count : (existing.comments ?? null),
    });
  }

  for (const value of Object.values(obj)) collectFromPayload(value, out);
}

/**
 * Read an account's recent post counts off their profile grid. This is the
 * denominator — the "most of his views are around 2,000" step from the Loom.
 * One page visit per unique author.
 */
async function baselineFor(page: Page, handle: string): Promise<number[]> {
  const seen = new Map<string, Partial<HarvestedPost>>();
  const onResponse = async (res: { url: () => string; json: () => Promise<unknown> }) => {
    const url = res.url();
    if (!/\/api\/v1\/|\/graphql/.test(url)) return;
    try {
      collectFromPayload(await res.json(), seen);
    } catch {
      /* not JSON, or the body was already consumed */
    }
  };

  page.on("response", onResponse as never);
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    await page.mouse.wheel(0, 1400);
    await sleep(2000);
  } catch {
    return [];
  } finally {
    page.off("response", onResponse as never);
  }

  // Prefer views where the account posts reels, fall back to likes. Never mix:
  // a multiple built from likes is not comparable to one built from views.
  const rows = [...seen.values()].filter((p) => p.handle === handle);
  const views = rows.map((r) => r.views).filter((v): v is number => typeof v === "number" && v > 0);
  if (views.length >= 3) return views.slice(0, 12);
  const likes = rows.map((r) => r.likes).filter((v): v is number => typeof v === "number" && v > 0);
  return likes.slice(0, 12);
}

/** The handle is only reliably readable off the nav avatar's alt text. */
async function currentHandle(page: Page): Promise<string | null> {
  return page
    .locator('img[alt*="profile picture"]')
    .first()
    .getAttribute("alt", { timeout: 5000 })
    .then((alt) => alt?.match(/^(.+?)'s profile picture/)?.[1] ?? null)
    .catch(() => null);
}

/**
 * Logged out, Instagram serves the login form at the feed URL itself and never
 * redirects, so checking for "/accounts/login" in the address reports a dead
 * session as a live one. Look for the password field instead.
 */
async function isLoggedOut(page: Page): Promise<boolean> {
  if (page.url().includes("/accounts/login")) return true;
  return (await page.locator('input[type="password"]').count()) > 0;
}

/**
 * Report whether the saved session is still good, without scrolling anything.
 * Runs headless — this is a status check, not a harvest.
 */
export async function sessionStatus(): Promise<{ loggedIn: boolean; handle: string | null }> {
  const chromium = await browser();
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  try {
    await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2500);

    if (await isLoggedOut(page)) return { loggedIn: false, handle: null };
    return { loggedIn: true, handle: await currentHandle(page) };
  } finally {
    await ctx.close();
  }
}

export async function harvest(opts: HarvestOptions): Promise<HarvestedPost[]> {
  const dwell = opts.dwellMs ?? [1800, 3600];
  const ctx = await openSession();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const seen = new Map<string, Partial<HarvestedPost>>();

  page.on("response", async (res) => {
    const url = res.url();
    if (!/\/api\/v1\/feed|\/graphql/.test(url)) return;
    try {
      collectFromPayload(await res.json(), seen);
    } catch {
      /* not JSON */
    }
  });

  await page.goto(FEED_URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  if (await isLoggedOut(page)) {
    await ctx.close();
    throw new Error(
      "Not logged in — Instagram is showing the login form. Run `npm run ig:login` first, then `npm run ig:status` to confirm.",
    );
  }

  // Scroll at something like reading speed until we have enough, or we stop
  // making progress. No unattended loops, no bursts — that is the ban vector.
  let stalls = 0;
  while (seen.size < opts.limit && stalls < 6) {
    const before = seen.size;
    await page.mouse.wheel(0, 900 + Math.random() * 500);
    await sleep(between(dwell));
    stalls = seen.size > before ? 0 : stalls + 1;
  }

  const posts = [...seen.values()]
    .filter((p): p is HarvestedPost & Partial<HarvestedPost> => Boolean(p.shortcode && p.handle))
    .slice(0, opts.limit)
    .map((p) => ({
      shortcode: p.shortcode!,
      url: p.url!,
      handle: p.handle!,
      displayName: p.displayName ?? null,
      followers: p.followers ?? null,
      mediaType: (p.mediaType ?? "image") as HarvestedPost["mediaType"],
      posterHue: hueFor(p.handle!),
      thumbnailUrl: p.thumbnailUrl ?? null,
      videoUrl: p.videoUrl ?? null,
      postedAt: p.postedAt ?? null,
      views: p.views ?? null,
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      baselineSample: [] as number[],
    }));

  if (!opts.skipBaselines) {
    const handles = [...new Set(posts.map((p) => p.handle))];
    const viaApify = apifyEnabled();
    console.log(
      viaApify
        ? `\nBaselines for ${handles.length} accounts via Apify — the burner never visits them.`
        : `\nBaselines for ${handles.length} accounts by visiting each profile. Set APIFY_TOKEN to do this off-session instead.`,
    );

    for (const handle of handles) {
      process.stdout.write(`  @${handle}… `);
      let sample: number[] = [];

      if (viaApify) {
        try {
          const metrics = await fetchAccountMetrics(handle);
          const recent = metrics?.posts ?? [];
          const useViews = recent.filter((r) => r.views !== null).length >= 3;
          sample = recent
            .map((r) => (useViews ? r.views : r.likes))
            .filter((v): v is number => typeof v === "number");

          // Both halves of the ratio should come from the same viewing context:
          // logged-out Instagram hides metrics that the logged-in feed shows.
          for (const post of posts) {
            const match = recent.find((r) => r.shortcode === post.shortcode);
            if (!match) continue;
            if (useViews && match.views !== null) post.views = match.views;
            if (!useViews && match.likes !== null) post.likes = match.likes;
          }
          console.log(`${sample.length} posts (apify)`);
        } catch (err) {
          console.log(`apify failed (${err instanceof Error ? err.message : err}) — falling back`);
          sample = await baselineFor(page, handle);
          await sleep(between(dwell));
        }
      } else {
        sample = await baselineFor(page, handle);
        await sleep(between(dwell));
      }

      if (!sample.length) console.log("no visible counts");
      for (const post of posts) if (post.handle === handle) post.baselineSample = sample;
    }
  }

  await ctx.close();
  return posts;
}

/** Every run is written to disk so a demo never depends on a live session. */
export function writeRun(posts: HarvestedPost[]): string {
  mkdirSync("fixtures", { recursive: true });
  const path = `fixtures/feed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    path,
    JSON.stringify({ capturedAt: new Date().toISOString(), sourceAccount: "live harvest", posts }, null, 2),
  );
  return path;
}
