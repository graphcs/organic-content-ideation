import { getStore } from "@/lib/store";
import { modelLabel, streamWrite } from "@/lib/mariobot";
import { allow, clientIp } from "@/lib/ratelimit";
import { isDemoMode } from "@/lib/store";

/** Long enough for a hook plus a full transcript, short enough not to be a free LLM. */
const MAX_PROMPT = 6000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Streams the writing bot's response straight through to the browser as SSE, and
 * persists it against the post as it goes so the swipe file keeps both the raw
 * material and what was written from it.
 */
export async function POST(req: Request) {
  const { postId, prompt } = (await req.json()) as { postId: string; prompt: string };

  // The hosted demo spends the client's OpenRouter credit and is open to anyone
  // with the link, so it gets a ceiling. Local runs are unthrottled.
  if (isDemoMode()) {
    if (typeof prompt !== "string" || prompt.length > MAX_PROMPT) {
      return Response.json(
        { error: `Prompts are capped at ${MAX_PROMPT} characters on the demo.` },
        { status: 400 },
      );
    }
    const gate = allow(clientIp(req));
    if (!gate.ok) {
      return Response.json(
        { error: `Demo limit reached. Try again in ${gate.retryAfterMinutes} minutes, or run it locally.` },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterMinutes * 60) } },
      );
    }
  }

  const store = await getStore();

  const post = await store.getPost(postId);
  if (!post) {
    return new Response(JSON.stringify({ error: `No post ${postId}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const generation = await store.startGeneration(postId, prompt, modelLabel());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send("start", { generationId: generation.id, model: generation.model });

      // Buffer before touching the database: one write per ~40 tokens, not per token.
      let pending = "";
      const flush = async () => {
        if (!pending) return;
        const chunk = pending;
        pending = "";
        await store.appendGeneration(generation.id, chunk);
      };

      try {
        for await (const delta of streamWrite({ prompt })) {
          send("delta", { text: delta });
          pending += delta;
          if (pending.length > 400) await flush();
        }
        await flush();
        await store.finishGeneration(generation.id);
        send("done", { generationId: generation.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : "The writing bot failed.";
        await flush();
        await store.finishGeneration(generation.id, message);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
