import feed from "../../fixtures/sample-feed.json";
import { baselineFromSample, scorePost, type Metric } from "./outlier";
import type { AudioState, PostView } from "./types";

/**
 * Turn a captured harvest file into scored posts. The harvester writes this exact
 * shape, so fixture mode and live mode run through identical code from here on.
 */
export function loadFixturePosts(): PostView[] {
  return feed.posts.map((p) => {
    // Reels expose plays, images only expose likes. The metric travels with the
    // number everywhere so a likes-multiple is never compared to a views-multiple.
    const metric: Metric =
      typeof p.views === "number" && p.views > 0
        ? "views"
        : typeof p.likes === "number" && p.likes > 0
          ? "likes"
          : "none";

    const baseline = baselineFromSample(p.baselineSample ?? [], metric);
    const score = scorePost({ views: p.views, likes: p.likes }, baseline);

    return {
      id: p.shortcode,
      shortcode: p.shortcode,
      url: p.url,
      handle: p.handle,
      displayName: p.displayName ?? null,
      followers: p.followers ?? null,
      mediaType: p.mediaType as PostView["mediaType"],
      thumbnailUrl: null,
      posterHue: p.posterHue ?? 180,
      postedAt: p.postedAt ?? null,
      views: p.views ?? null,
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      baselineSample: p.baselineSample ?? [],
      baselineValue: baseline.value || null,
      baselineMetric: baseline.metric,
      score,
      status: "new" as const,
      notes: null,
      hooks: {
        visual: p.hooks.visual ?? null,
        audio: p.hooks.audio ?? null,
        audioState: (p.hooks.audioState ?? "unknown") as AudioState,
        caption: p.hooks.caption ?? null,
        body: p.hooks.body ?? null,
        editedByUser: false,
      },
      generations: [],
    };
  });
}

export const fixtureMeta = {
  capturedAt: feed.capturedAt,
  sourceAccount: feed.sourceAccount,
};
