"use client";

import { formatMultiple } from "@/lib/outlier";
import { posterStyle } from "@/lib/poster";
import type { PostView } from "@/lib/types";

function metricLine(post: PostView): string {
  const kind = post.mediaType === "reel" ? "Reel" : post.mediaType === "carousel" ? "Carousel" : "Image";
  if (typeof post.views === "number") return `${kind} · ${post.views.toLocaleString()} views`;
  if (typeof post.likes === "number") return `${kind} · ${post.likes.toLocaleString()} likes`;
  return `${kind} · counts hidden`;
}

export default function Queue({
  posts,
  selectedId,
  onSelect,
}: {
  posts: PostView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (posts.length === 0) {
    return <p className="keys">Nothing here yet. Switch the filter, or harvest a fresh run.</p>;
  }

  return (
    <ul className="queue">
      {posts.map((post) => (
        <li key={post.id}>
          <button
            type="button"
            className={`queue-item${post.status === "rejected" ? " is-rejected" : ""}`}
            aria-current={post.id === selectedId}
            onClick={() => onSelect(post.id)}
          >
            <span className="thumb" style={posterStyle(post.posterHue, post.thumbnailUrl)} />
            <span className="who">
              <b>@{post.handle}</b>
              <span>{metricLine(post)}</span>
            </span>
            <span>
              <span
                className={`mult tnum${
                  post.score.band === "standout" ? " standout" : post.score.multiple === null ? " unscored" : ""
                }`}
              >
                {post.score.multiple === null ? "unscored" : formatMultiple(post.score.multiple)}
              </span>
              {post.status !== "new" && (
                <span className={`tick${post.status === "saved" ? " saved" : ""}`}>
                  {post.status === "saved" ? "saved" : "rejected"}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
