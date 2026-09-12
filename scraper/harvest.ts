/**
 * Home-feed harvester.
 *
 * Drives a headed Chromium with a persistent profile that a human logged in once.
 * Selection is on structural signals (article elements, time[datetime], /p/ and
 * /reel/ anchors) rather than Instagram's obfuscated, rotating class names, and
 * the feed's own XHR payloads are intercepted because they carry exact counts
 * instead of rendered strings like "12.4K".
 *
 * Status: skeleton. See PLAN.md section 3 for the approach and its risks.
 */

import { chromium, type BrowserContext } from "playwright";

const PROFILE_DIR = ".ig-profile";
const FEED_URL = "https://www.instagram.com/";

export interface HarvestOptions {
  limit: number;
  /** Randomised dwell between scrolls, milliseconds. Human-paced on purpose. */
  dwellMs?: [number, number];
}

export interface HarvestedPost {
  shortcode: string;
  url: string;
  handle: string;
  mediaType: "reel" | "image" | "carousel";
  thumbnailUrl?: string;
  videoUrl?: string;
  postedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export async function openSession(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
}

/** One-time manual login. Opens the browser and waits for the human to finish. */
export async function login(): Promise<void> {
  const ctx = await openSession();
  const page = await ctx.newPage();
  await page.goto(FEED_URL);
  console.log("Log in by hand, including 2FA. Close the window when the feed loads.");
  await page.waitForEvent("close", { timeout: 0 });
  await ctx.close();
}

export async function harvest(opts: HarvestOptions): Promise<HarvestedPost[]> {
  // TODO(milestone 2):
  //   1. context.on("response") — capture GraphQL feed payloads for exact counts
  //   2. scroll with randomised dwell until `limit` distinct shortcodes are seen
  //   3. reconcile DOM-visible posts against intercepted payloads
  //   4. visit each unique author's grid once for the baseline sample
  //   5. write the run to fixtures/feed-<timestamp>.json for reproducible demos
  throw new Error("Not implemented — milestone 2.");
}
