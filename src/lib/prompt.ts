import type { PostView } from "./types";

export const DEFAULT_HOOK_COUNT = 10;

/**
 * The default prompt is the one from the Loom, near enough verbatim:
 * "please write me 10 hooks based on this idea, why you need to be slamming
 *  carbohydrates for fat loss."
 *
 * The idea line is the visual hook, because that is what the strategist reads off
 * the screen. Caption and transcript go underneath as context rather than into the
 * instruction, so the bot writes about the idea rather than rewriting the post.
 */
export function composePrompt(post: PostView, hookCount = DEFAULT_HOOK_COUNT): string {
  const idea = post.hooks.visual || post.hooks.caption || "this post";
  const lines = [`Please write me ${hookCount} hooks based on this idea: ${idea}`];

  const context: string[] = [];
  if (post.hooks.caption) context.push(`Caption: ${post.hooks.caption}`);
  if (post.hooks.audio) context.push(`Spoken opening: ${post.hooks.audio}`);
  if (post.hooks.body) context.push(`Full transcript: ${post.hooks.body}`);

  if (context.length) {
    lines.push("", "For context, here is the original post:", ...context);
  }
  return lines.join("\n");
}

/** Shown under the prompt box so it is obvious what the bot is being given. */
export function describeContext(post: PostView): string {
  const parts: string[] = [];
  if (post.hooks.caption) parts.push("caption");
  if (post.hooks.audio) parts.push("spoken hook");
  if (post.hooks.body) parts.push("transcript");
  if (!parts.length) return "Visual hook only — nothing else was captured from this post.";
  return `Sending the visual hook plus ${parts.join(", ")}.`;
}
