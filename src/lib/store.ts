import { loadFixturePosts } from "./fixture";
import type { Generation, HookPatch, PostView, Status } from "./types";

/**
 * One data interface, two backings.
 *
 * Local runs use SQLite through Prisma, because the brief asks for CLI access to
 * the same records the UI is showing. The hosted demo has no Instagram session and
 * no writable disk, so it runs an in-memory copy of the sample harvest — every
 * visitor gets a clean feed, and nothing they triage leaks into anyone else's.
 */
export interface Store {
  readonly kind: "prisma" | "memory";
  listPosts(): Promise<PostView[]>;
  getPost(id: string): Promise<PostView | null>;
  setStatus(id: string, status: Status): Promise<PostView>;
  updateHooks(id: string, patch: HookPatch): Promise<PostView>;
  startGeneration(postId: string, prompt: string, model: string): Promise<Generation>;
  appendGeneration(id: string, chunk: string): Promise<void>;
  finishGeneration(id: string, error?: string): Promise<void>;
  reset(): Promise<void>;
}

const byOutlier = (a: PostView, b: PostView) => {
  // Unscored posts sort last rather than as zero — "we could not measure this"
  // is a different statement from "this did not perform".
  const am = a.score.multiple ?? -1;
  const bm = b.score.multiple ?? -1;
  return bm - am;
};

class MemoryStore implements Store {
  readonly kind = "memory";
  private posts: PostView[] = loadFixturePosts().sort(byOutlier);
  private gens = new Map<string, Generation>();

  async listPosts() {
    return this.posts.map((p) => ({ ...p }));
  }

  async getPost(id: string) {
    return this.posts.find((p) => p.id === id) ?? null;
  }

  private require(id: string): PostView {
    const post = this.posts.find((p) => p.id === id);
    if (!post) throw new Error(`No post ${id}`);
    return post;
  }

  async setStatus(id: string, status: Status) {
    const post = this.require(id);
    post.status = status;
    return { ...post };
  }

  async updateHooks(id: string, patch: HookPatch) {
    const post = this.require(id);
    post.hooks = { ...post.hooks, ...patch, editedByUser: true };
    return { ...post };
  }

  async startGeneration(postId: string, prompt: string, model: string) {
    const post = this.require(postId);
    const gen: Generation = {
      id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      postId,
      prompt,
      response: "",
      model,
      status: "streaming",
      error: null,
      createdAt: new Date().toISOString(),
    };
    this.gens.set(gen.id, gen);
    post.generations = [gen, ...post.generations];
    return gen;
  }

  async appendGeneration(id: string, chunk: string) {
    const gen = this.gens.get(id);
    if (gen) gen.response += chunk;
  }

  async finishGeneration(id: string, error?: string) {
    const gen = this.gens.get(id);
    if (!gen) return;
    gen.status = error ? "error" : "complete";
    gen.error = error ?? null;
  }

  async reset() {
    this.posts = loadFixturePosts().sort(byOutlier);
    this.gens.clear();
  }
}

/** Lazily required so the hosted demo never loads Prisma or opens a database file. */
async function prismaStore(): Promise<Store> {
  const { PrismaStore } = await import("./store-prisma");
  return new PrismaStore();
}

let cached: Promise<Store> | null = null;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !process.env.DATABASE_URL;
}

export function getStore(): Promise<Store> {
  if (!cached) {
    cached = isDemoMode() ? Promise.resolve(new MemoryStore()) : prismaStore();
  }
  return cached;
}

export { byOutlier };
