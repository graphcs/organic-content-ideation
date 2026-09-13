/**
 * Where an account's baseline comes from.
 *
 * The outlier multiple needs two numbers: this post's engagement, and the median of
 * that account's recent posts. Getting the second one is the expensive half — it
 * means visiting every unique author's profile grid, which for a ten-post harvest
 * roughly triples the number of automated requests the burner account makes. That
 * request volume, not the scrolling, is the main thing that gets accounts limited.
 *
 * But a public profile's recent posts are public data. There is no reason to spend
 * the burner's risk budget on them when a scraping service will fetch them from the
 * logged-out page — reliably, and as exact integers.
 *
 * So: the logged-in session discovers *which* posts are in the feed, and Apify
 * supplies the metrics. Without an APIFY_TOKEN it falls back to the browser visit,
 * which still works and costs nothing but money.
 *
 * One methodological note that matters more than the cost. Instagram shows some
 * metrics to logged-in viewers that it hides from logged-out ones, so a numerator
 * read from the feed and a denominator read from Apify are not strictly comparable.
 * When Apify is used, the post's own count is taken from the Apify sample too, so
 * both halves of the ratio come from the same viewing context.
 */

const ACTOR = "apify~instagram-scraper";
const ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;

export interface AccountMetrics {
  /** Recent posts, newest first, as {shortcode, views, likes}. */
  posts: { shortcode: string; views: number | null; likes: number | null }[];
  source: "apify" | "browser";
}

/** Apify returns -1 for likes when a creator has hidden their counts. */
function clean(n: unknown): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

export function apifyEnabled(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export async function fetchAccountMetrics(
  handle: string,
  limit = 12,
): Promise<AccountMetrics | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "posts",
      resultsLimit: limit,
      addParentData: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Apify returned ${res.status} for @${handle}. ${detail.slice(0, 200)}`);
  }

  const items = (await res.json()) as Record<string, unknown>[];

  return {
    source: "apify",
    posts: items
      .filter((it) => typeof it.shortCode === "string")
      .map((it) => ({
        shortcode: it.shortCode as string,
        // videoPlayCount and videoViewCount are different numbers. Plays is the one
        // that matches what the strategist reads off a reel in the app.
        views: clean(it.videoPlayCount) ?? clean(it.videoViewCount),
        likes: clean(it.likesCount),
      })),
  };
}

/** What a harvest of N authors costs, so the number is in the repo and not in a chat log. */
export function estimateCost(authors: number, postsPerAuthor = 12): string {
  const items = authors * postsPerAuthor;
  const rates: [string, number][] = [
    ["free", 2.7],
    ["starter", 2.3],
    ["scale", 1.9],
  ];
  return rates
    .map(([plan, per1k]) => `${plan}: $${((items / 1000) * per1k).toFixed(2)}`)
    .join(" · ");
}
