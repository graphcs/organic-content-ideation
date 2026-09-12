"use client";

import { useEffect, useRef, useState } from "react";
import { composePrompt, describeContext } from "@/lib/prompt";
import type { PostView } from "@/lib/types";

export default function WritingPanel({ post }: { post: PostView }) {
  const [prompt, setPrompt] = useState(() => composePrompt(post));
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // A new specimen means a new prompt. Anything mid-flight belonged to the old one.
  useEffect(() => {
    abort.current?.abort();
    setPrompt(composePrompt(post));
    setOutput("");
    setError(null);
    setStreaming(false);
  }, [post.id, post.hooks.visual, post.hooks.caption, post.hooks.audio, post.hooks.body]); // eslint-disable-line react-hooks/exhaustive-deps

  async function write() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setStreaming(true);
    setOutput("");
    setError(null);

    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `The writing bot could not be reached (${res.status}).`);
      }
      if (!res.body) throw new Error("The writing bot returned an empty response.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split: number;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);

          const event = frame.match(/^event: (.+)$/m)?.[1];
          const raw = frame.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);

          if (event === "start") setModel(data.model);
          if (event === "delta") setOutput((prev) => prev + data.text);
          if (event === "error") setError(data.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <div className="colhead">
        <h2>Writing</h2>
        <span className="sub">{model ?? "Mario-Bot"}</span>
      </div>

      <label className="label" htmlFor={`prompt-${post.id}`}>
        Prompt
      </label>
      <textarea
        id={`prompt-${post.id}`}
        className="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <p className="ctx">{describeContext(post)}</p>

      <button type="button" className="write" onClick={write} disabled={streaming}>
        {streaming ? "Writing…" : "Write copy"}
      </button>

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {(output || streaming) && (
        <div className="stream">
          <p className="out">
            {output}
            {streaming && <span className="caret" />}
          </p>
        </div>
      )}

      {post.generations.length > 0 && (
        <div className="history">
          <h3>Earlier runs on this post</h3>
          {post.generations.map((gen) => (
            <details key={gen.id}>
              <summary>
                {new Date(gen.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {gen.status === "error" ? "failed" : gen.model}
              </summary>
              <p className="out">{gen.error ?? gen.response}</p>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
