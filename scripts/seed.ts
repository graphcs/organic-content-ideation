import { readFileSync } from "node:fs";
import { importPosts, prisma } from "./import";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const file = args.find((a) => !a.startsWith("--")) ?? "fixtures/sample-feed.json";

async function main() {
  // Seeding never overwrites a hook a human has edited, which is the right default
  // but makes a demo hard to rerun cleanly. --reset empties the tables first.
  if (reset) {
    await prisma.generation.deleteMany();
    await prisma.hook.deleteMany();
    await prisma.post.deleteMany();
    await prisma.account.deleteMany();
    console.log("Cleared existing records.");
  }

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
