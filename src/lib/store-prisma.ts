import { PrismaClient } from "@prisma/client";
import { baselineFromSample, scorePost, type Metric } from "./outlier";
import type { AudioState, Generation, HookPatch, PostView, Status } from "./types";
import type { Store } from "./store";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const include = { account: true, hooks: true, generations: { orderBy: { createdAt: "desc" } } } as const;

type Row = Awaited<ReturnType<typeof prisma.post.findMany<{ include: typeof include }>>>[number];

function toView(row: Row): PostView {
  const sample: number[] = JSON.parse(row.account.baselineSample || "[]");
  const metric = row.account.baselineMetric as Metric;
  const baseline = baselineFromSample(sample, metric);
  const score = scorePost({ views: row.views, likes: row.likes }, baseline);

  return {
    id: row.id,
    shortcode: row.shortcode,
    url: row.url,
    handle: row.account.handle,
    displayName: row.account.displayName,
    followers: row.account.followers,
    mediaType: row.mediaType as PostView["mediaType"],
    thumbnailUrl: row.thumbnailUrl,
    posterHue: row.posterHue,
    postedAt: row.postedAt?.toISOString() ?? null,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    baselineSample: sample,
    baselineValue: baseline.value || null,
    baselineMetric: baseline.metric,
    score,
    status: row.status as Status,
    notes: row.notes,
    hooks: {
      visual: row.hooks?.visual ?? null,
      audio: row.hooks?.audio ?? null,
      audioState: (row.hooks?.audioState ?? "unknown") as AudioState,
      caption: row.hooks?.caption ?? null,
      body: row.hooks?.body ?? null,
      editedByUser: row.hooks?.editedByUser ?? false,
    },
    generations: (row.generations ?? []).map(
      (g): Generation => ({
        id: g.id,
        postId: g.postId,
        prompt: g.prompt,
        response: g.response ?? "",
        model: g.model,
        status: g.status as Generation["status"],
        error: g.error,
        createdAt: g.createdAt.toISOString(),
      }),
    ),
  };
}

export class PrismaStore implements Store {
  readonly kind = "prisma";

  async listPosts(): Promise<PostView[]> {
    const rows = await prisma.post.findMany({ include });
    // Ranking depends on the account baseline, so it is computed in the app rather
    // than pushed into SQL. Ten to a few hundred rows — sorting here is free.
    return rows.map(toView).sort((a, b) => (b.score.multiple ?? -1) - (a.score.multiple ?? -1));
  }

  async getPost(id: string) {
    const row = await prisma.post.findUnique({ where: { id }, include });
    return row ? toView(row) : null;
  }

  async setStatus(id: string, status: Status) {
    const row = await prisma.post.update({ where: { id }, data: { status }, include });
    return toView(row);
  }

  async updateHooks(id: string, patch: HookPatch) {
    await prisma.hook.upsert({
      where: { postId: id },
      create: { postId: id, ...patch, editedByUser: true },
      update: { ...patch, editedByUser: true },
    });
    const row = await prisma.post.findUniqueOrThrow({ where: { id }, include });
    return toView(row);
  }

  async startGeneration(postId: string, prompt: string, model: string) {
    const g = await prisma.generation.create({
      data: { postId, prompt, model, response: "", status: "streaming" },
    });
    return {
      id: g.id,
      postId: g.postId,
      prompt: g.prompt,
      response: "",
      model: g.model,
      status: "streaming" as const,
      error: null,
      createdAt: g.createdAt.toISOString(),
    };
  }

  async appendGeneration(id: string, chunk: string) {
    // Buffered by the caller, so this is a handful of writes per generation, not one per token.
    await prisma.$executeRaw`UPDATE Generation SET response = COALESCE(response, '') || ${chunk} WHERE id = ${id}`;
  }

  async finishGeneration(id: string, error?: string) {
    await prisma.generation.update({
      where: { id },
      data: {
        status: error ? "error" : "complete",
        error: error ?? null,
        completedAt: new Date(),
      },
    });
  }

  async reset() {
    await prisma.generation.deleteMany();
    await prisma.hook.deleteMany();
    await prisma.post.deleteMany();
    await prisma.account.deleteMany();
  }
}
