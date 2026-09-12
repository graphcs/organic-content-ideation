"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Queue from "./Queue";
import Specimen from "./Specimen";
import WritingPanel from "./WritingPanel";
import type { HookPatch, PostView, Status } from "@/lib/types";

type Filter = "all" | "new" | "saved";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "Untriaged" },
  { key: "saved", label: "Saved" },
];

export default function Workbench({
  initialPosts,
  demo,
  capturedAt,
  market,
}: {
  initialPosts: PostView[];
  demo: boolean;
  capturedAt: string;
  market: string;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialPosts[0]?.id ?? null);

  const visible = useMemo(
    () => posts.filter((p) => (filter === "all" ? true : p.status === filter)),
    [posts, filter],
  );
  const selected = posts.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  const savedCount = posts.filter((p) => p.status === "saved").length;

  const replace = (post: PostView) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));

  const patch = useCallback(async (id: string, body: { status?: Status; hooks?: HookPatch }) => {
    // Optimistic: triage has to feel instant or you stop using the keyboard for it.
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              ...(body.status ? { status: body.status } : {}),
              ...(body.hooks ? { hooks: { ...p.hooks, ...body.hooks, editedByUser: true } } : {}),
            },
      ),
    );
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) replace((await res.json()).post);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (!visible.length) return;
      const at = visible.findIndex((p) => p.id === selectedId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))];
      if (next) setSelectedId(next.id);
    },
    [visible, selectedId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never steal keys from a field the user is typing in.
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j") return step(1);
      if (e.key === "k") return step(-1);
      if (!selectedId) return;
      if (e.key === "s") return void patch(selectedId, { status: "saved" });
      if (e.key === "x") return void patch(selectedId, { status: "rejected" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, patch, selectedId]);

  const harvested = new Date(capturedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <header className="masthead">
        <h1>Outlier Workbench</h1>
        <span className="market">{market}</span>
        <span className={`badge${demo ? " demo" : ""}`}>
          {demo ? "Demo · sample harvest" : "Local · live database"}
        </span>
        <span className="spacer" />
        <span className="meta">
          {posts.length} posts harvested {harvested} · {savedCount} saved
        </span>
      </header>

      <div className="workbench">
        <section className="col queue-col">
          <div className="colhead">
            <h2>Queue</h2>
            <span className="sub">ranked by multiple</span>
          </div>
          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Queue posts={visible} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <p className="keys">
            <kbd>j</kbd> <kbd>k</kbd> move · <kbd>s</kbd> save · <kbd>x</kbd> reject
          </p>
        </section>

        <section className="col">
          {selected ? (
            <Specimen
              post={selected}
              onStatus={(status) => patch(selected.id, { status })}
              onHooks={(hooks) => patch(selected.id, { hooks })}
            />
          ) : (
            <p className="empty">Nothing selected. Pick a post from the queue.</p>
          )}
        </section>

        <section className="col write-col">
          {selected ? <WritingPanel post={selected} /> : null}
        </section>
      </div>
    </>
  );
}
