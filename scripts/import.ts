import { PrismaClient } from "@prisma/client";
import { baselineFromSample, type Metric } from "../src/lib/outlier";

const prisma = new PrismaClient();

export interface ImportablePost {
  shortcode: string;
  url: string;
  handle: string;
  displayName?: string | null;
  followers?: number | null;
  mediaType: string;
  posterHue?: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  postedAt?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  baselineSample?: number[];
  hooks?: {
    visual?: string | null;
    audio?: string | null;
    audioState?: string;
    caption?: string | null;
    body?: string | null;
  };
}

/** Idempotent: re-importing the same run updates counts and never clobbers human edits. */
export async function importPosts(posts: ImportablePost[]): Promise<number> {
  for (const p of posts) {
    const sample = p.baselineSample ?? [];
    const metric: Metric = sample.length === 0 ? "none" : typeof p.views === "number" ? "views" : "likes";
    const baseline = baselineFromSample(sample, metric);

    const account = await prisma.account.upsert({
      where: { handle: p.handle },
      create: {
        handle: p.handle,
        displayName: p.displayName ?? null,
        followers: p.followers ?? null,
        baseline: baseline.value || null,
        baselineMetric: baseline.metric,
        baselineN: baseline.n,
        baselineSample: JSON.stringify(sample),
        baselineAt: new Date(),
      },
      update: {
        displayName: p.displayName ?? undefined,
        followers: p.followers ?? undefined,
        baseline: baseline.value || null,
        baselineMetric: baseline.metric,
        baselineN: baseline.n,
        baselineSample: JSON.stringify(sample),
        baselineAt: new Date(),
      },
    });

    const post = await prisma.post.upsert({
      where: { shortcode: p.shortcode },
      create: {
        shortcode: p.shortcode,
        url: p.url,
        accountId: account.id,
        mediaType: p.mediaType,
        posterHue: p.posterHue ?? 180,
        thumbnailUrl: p.thumbnailUrl ?? null,
        videoUrl: p.videoUrl ?? null,
        postedAt: p.postedAt ? new Date(p.postedAt) : null,
        views: p.views ?? null,
        likes: p.likes ?? null,
        comments: p.comments ?? null,
      },
      update: {
        views: p.views ?? undefined,
        likes: p.likes ?? undefined,
        comments: p.comments ?? undefined,
        thumbnailUrl: p.thumbnailUrl ?? undefined,
        videoUrl: p.videoUrl ?? undefined,
      },
    });

    if (p.hooks) {
      const existing = await prisma.hook.findUnique({ where: { postId: post.id } });
      // A human edit outranks anything re-extraction wants to say.
      if (!existing?.editedByUser) {
        await prisma.hook.upsert({
          where: { postId: post.id },
          create: {
            postId: post.id,
            visual: p.hooks.visual ?? null,
            audio: p.hooks.audio ?? null,
            audioState: p.hooks.audioState ?? "unknown",
            caption: p.hooks.caption ?? null,
            body: p.hooks.body ?? null,
            extractedAt: new Date(),
          },
          update: {
            visual: p.hooks.visual ?? null,
            audio: p.hooks.audio ?? null,
            audioState: p.hooks.audioState ?? "unknown",
            caption: p.hooks.caption ?? null,
            body: p.hooks.body ?? null,
            extractedAt: new Date(),
          },
        });
      }
    }
  }
  return posts.length;
}

export { prisma };
