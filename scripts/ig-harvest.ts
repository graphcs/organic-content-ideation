import { harvest, writeRun } from "../scraper/harvest";
import { importPosts } from "./import";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 10;

async function main() {
  console.log(`Harvesting ${limit} posts from the home feed…`);
  const posts = await harvest({ limit });
  if (!posts.length) {
    console.error("Nothing captured. The feed payload shape may have changed — see scraper/harvest.ts.");
    process.exit(1);
  }

  const path = writeRun(posts);
  console.log(`\nCaptured ${posts.length} posts → ${path}`);

  const n = await importPosts(posts);
  console.log(`Imported ${n} posts into the database. Run \`npm run dev\`.`);
  console.log("\nNext: `npm run enrich` to pull visual and audio hooks off the videos.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
