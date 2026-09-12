/**
 * Client for the writing bot.
 *
 * Two transports behind one interface:
 *
 *  - `openrouter` — OpenAI-compatible chat completions. Works today with the key
 *    supplied in the brief, which is why it is the default and why the hosted demo
 *    streams real output.
 *  - `genesis` — the client's own bot server. The brief gives a Genesis key and
 *    says "use Mario-Bot slug" but not the base URL or the request shape, so this
 *    path is wired and waiting on one working curl. See docs/QUESTIONS.md.
 *
 * Swapping is one environment variable. Nothing above this module changes.
 */

export type Transport = "openrouter" | "genesis";

export interface WriteRequest {
  prompt: string;
  system?: string;
}

export function transport(): Transport {
  return (process.env.MARIOBOT_TRANSPORT as Transport) || "openrouter";
}

export function modelLabel(): string {
  return transport() === "genesis"
    ? `genesis:${process.env.MARIOBOT_SLUG || "mario-bot"}`
    : process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";
}

const SYSTEM = [
  "You are a direct response copywriter working on short-form Instagram ad hooks.",
  "Write hooks the way a creative strategist would test them: concrete, specific, one idea each.",
  "No preamble, no numbering commentary, no sign-off. Return a numbered list and nothing else.",
].join(" ");

function endpoint(): { url: string; headers: Record<string, string>; body: (r: WriteRequest) => unknown } {
  if (transport() === "genesis") {
    const base = process.env.GENESIS_BASE_URL;
    if (!base) {
      throw new Error(
        "GENESIS_BASE_URL is not set. The Genesis endpoint for the Mario-Bot slug is still unconfirmed — see docs/QUESTIONS.md. Set MARIOBOT_TRANSPORT=openrouter to use the OpenRouter path instead.",
      );
    }
    return {
      url: `${base.replace(/\/$/, "")}/chat/completions`,
      headers: {
        Authorization: `Bearer ${process.env.GENESIS_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: (r) => ({
        model: process.env.MARIOBOT_SLUG || "mario-bot",
        stream: true,
        messages: [
          { role: "system", content: r.system ?? SYSTEM },
          { role: "user", content: r.prompt },
        ],
      }),
    };
  }

  const base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  return {
    url: `${base.replace(/\/$/, "")}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/graphcs/organic-content-ideation",
      "X-Title": "Organic Content Ideation",
    },
    body: (r) => ({
      model: modelLabel(),
      stream: true,
      max_tokens: 1200,
      messages: [
        { role: "system", content: r.system ?? SYSTEM },
        { role: "user", content: r.prompt },
      ],
    }),
  };
}

/** Yields text deltas as they arrive. Both transports speak OpenAI-style SSE. */
export async function* streamWrite(req: WriteRequest): AsyncGenerator<string> {
  const { url, headers, body } = endpoint();

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body(req)),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Writing bot returned ${res.status}. ${detail.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a frame can straddle two chunks.
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) yield delta;
        } catch {
          // OpenRouter emits ": OPENROUTER PROCESSING" keep-alive comments and the
          // occasional partial frame. Skipping unparseable frames is correct here.
        }
      }
    }
  }
}
