import { readFileSync } from "node:fs";
import { importPosts, prisma } from "./import";

const file = process.argv[2] ?? "fixtures/sample-feed.json";

async function main() {
  const feed = JSON.parse(readFileSync(file, "utf8"));
  const posts = feed.posts.map((p: Record<string, unknown>) => ({
    ...p,
    posterHue: p.posterHue ?? 180,
  }));
  const n = await importPosts(posts);
  console.log(`Seeded ${n} posts from ${file}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
