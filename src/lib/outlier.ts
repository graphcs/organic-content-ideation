/**
 * The arithmetic the strategist does by eye in the Loom:
 * "he's got about 2,000 followers, most of his views are around 2,000...
 *  this is like a 3 to 4x, which is some signal, but nothing crazy."
 */

export type Metric = "views" | "likes" | "none";

export interface PostCounts {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
}

export interface Baseline {
  value: number;
  metric: Metric;
  /** Number of posts the median was taken over. */
  n: number;
}

export interface OutlierScore {
  multiple: number | null;
  metric: Metric;
  band: "standout" | "notable" | "baseline" | "unscored";
  /** Small samples are reported, never hidden behind a confident-looking number. */
  confidence: "high" | "low";
  reason: string;
}

/**
 * Pick the richest metric the post actually exposes. Views and likes are never
 * blended — a multiple built from likes is not comparable to one built from views,
 * so the metric travels with the number everywhere it goes.
 */
export function pickMetric(counts: PostCounts): Metric {
  if (typeof counts.views === "number" && counts.views > 0) return "views";
  if (typeof counts.likes === "number" && counts.likes > 0) return "likes";
  return "none";
}

/** Median of an account's recent posts on a single metric. */
export function computeBaseline(recent: PostCounts[]): Baseline {
  const metric = pickMetric(recent.find((p) => pickMetric(p) !== "none") ?? {});
  if (metric === "none") return { value: 0, metric: "none", n: 0 };

  const values = recent
    .map((p) => p[metric])
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return { value: 0, metric: "none", n: 0 };

  const mid = Math.floor(values.length / 2);
  const value =
    values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

  return { value, metric, n: values.length };
}

export function scorePost(counts: PostCounts, baseline: Baseline): OutlierScore {
  if (baseline.metric === "none" || baseline.value <= 0) {
    return {
      multiple: null,
      metric: "none",
      band: "unscored",
      confidence: "low",
      reason: "No visible counts on this account's recent posts.",
    };
  }

  const value = counts[baseline.metric];
  if (typeof value !== "number" || value <= 0) {
    return {
      multiple: null,
      metric: baseline.metric,
      band: "unscored",
      confidence: "low",
      reason: `This post exposes no ${baseline.metric}.`,
    };
  }

  const multiple = value / baseline.value;
  const confidence = baseline.n >= 6 ? "high" : "low";

  return {
    multiple,
    metric: baseline.metric,
    band: multiple >= 5 ? "standout" : multiple >= 2 ? "notable" : "baseline",
    confidence,
    reason:
      confidence === "high"
        ? `${multiple.toFixed(1)}x the median of ${baseline.n} recent posts.`
        : `${multiple.toFixed(1)}x, but only ${baseline.n} post${
            baseline.n === 1 ? "" : "s"
          } to compare against.`,
  };
}
