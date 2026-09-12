#!/usr/bin/env node
import "./env";
import { formatMultiple } from "../src/lib/outlier";
import { composePrompt } from "../src/lib/prompt";
import { modelLabel, streamWrite } from "../src/lib/mariobot";
import { PrismaStore } from "../src/lib/store-prisma";
import type { PostView } from "../src/lib/types";

const store = new PrismaStore();
const [command, sub, ...rest] = process.argv.slice(2);

const flag = (name: string): string | undefined =>
  rest.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

function usage(): never {
  console.log(`
Outlier Workbench CLI — same database the UI reads.

  posts list [--min-multiple=N] [--status=new|saved|rejected]
  posts show <id>
  write <id> [--hooks=10]
  export [--format=json|md] [--status=saved]

Run the harvester with \`npm run ig:harvest -- --limit=10\`.
`);
  process.exit(1);
}

function line(p: PostView): string {
  const mult = p.score.multiple === null ? "unscored" : formatMultiple(p.score.multiple);
  const flagCh = p.status === "saved" ? "*" : p.status === "rejected" ? "x" : " ";
  return `${flagCh} ${p.id.padEnd(26)} ${mult.padStart(9)}  ${pad("@" + p.handle, 22)} ${pad(p.hooks.visual ?? "—", 52)}`;
}

async function main() {
  if (command === "posts" && sub === "list") {
    const min = Number(flag("min-multiple") ?? 0);
    const status = flag("status");
    const posts = (await store.listPosts())
      .filter((p) => (status ? p.status === status : true))
      .filter((p) => (min ? (p.score.multiple ?? 0) >= min : true));

    if (!posts.length) return console.log("No posts match. Seed with `npm run seed`.");
    console.log(`\n  ${"id".padEnd(26)} ${"multiple".padStart(9)}  ${pad("account", 22)} visual hook`);
    console.log(`  ${"-".repeat(112)}`);
    for (const p of posts) console.log(line(p));
    console.log(`\n  ${posts.length} posts · * saved · x rejected\n`);
    return;
  }

  if (command === "posts" && sub === "show") {
    const post = await store.getPost(rest[0] ?? "");
    if (!post) return console.error(`No post ${rest[0]}.`);
    console.log(`
@${post.handle}${post.displayName ? ` (${post.displayName})` : ""}
${post.url}

  Outlier      ${post.score.multiple === null ? "unscored" : formatMultiple(post.score.multiple)}  — ${post.score.reason}
  Baseline     ${post.baselineValue?.toLocaleString() ?? "—"} ${post.baselineMetric} over ${post.baselineSample.length} posts
  This post    ${(post.views ?? post.likes)?.toLocaleString() ?? "—"} ${post.score.metric}

  VISUAL HOOK  ${post.hooks.visual ?? "—"}
  AUDIO HOOK   ${post.hooks.audio ?? `(${post.hooks.audioState})`}
  CAPTION      ${post.hooks.caption ?? "—"}

  BODY
${post.hooks.body ? post.hooks.body.replace(/^/gm, "    ") : "    (no transcript)"}
`);
    return;
  }

  if (command === "write") {
    const post = await store.getPost(sub ?? "");
    if (!post) return console.error(`No post ${sub}.`);

    const prompt = composePrompt(post, Number(flag("hooks") ?? 10));
    const gen = await store.startGeneration(post.id, prompt, modelLabel());
    console.log(`\n${prompt}\n\n--- ${modelLabel()} ---\n`);

    let buffer = "";
    try {
      for await (const delta of streamWrite({ prompt })) {
        process.stdout.write(delta);
        buffer += delta;
        if (buffer.length > 400) {
          await store.appendGeneration(gen.id, buffer);
          buffer = "";
        }
      }
      if (buffer) await store.appendGeneration(gen.id, buffer);
      await store.finishGeneration(gen.id);
      console.log("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : "The writing bot failed.";
      await store.finishGeneration(gen.id, message);
      console.error(`\n${message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "export") {
    const status = flag("status");
    const posts = (await store.listPosts()).filter((p) => (status ? p.status === status : true));

    if ((flag("format") ?? "json") === "json") {
      console.log(JSON.stringify(posts, null, 2));
      return;
    }

    for (const p of posts) {
      console.log(`## @${p.handle} — ${p.score.multiple === null ? "unscored" : formatMultiple(p.score.multiple)}`);
      console.log(`${p.url}\n`);
      console.log(`**Visual hook.** ${p.hooks.visual ?? "—"}`);
      console.log(`**Audio hook.** ${p.hooks.audio ?? `(${p.hooks.audioState})`}`);
      console.log(`**Caption.** ${p.hooks.caption ?? "—"}\n`);
      if (p.hooks.body) console.log(`${p.hooks.body}\n`);
      console.log("---\n");
    }
    return;
  }

  usage();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
