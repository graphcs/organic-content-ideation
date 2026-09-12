"use client";

import AutoTextarea from "./AutoTextarea";
import { formatMultiple } from "@/lib/outlier";
import { posterStyle } from "@/lib/poster";
import type { HookPatch, PostView, Status } from "@/lib/types";

const AUDIO_NOTE: Record<string, string> = {
  music: "Music only — no spoken hook in this clip.",
  silent: "No audio track.",
  unknown: "Not analysed yet.",
  speech: "",
};

/**
 * The account's recent posts as a band, with this post as the bar that broke it.
 *
 * The bars are scaled to the *sample's* own maximum, not to the outlier. A 10x post
 * scaled linearly against its baseline flattens every other bar to two pixels, which
 * tells you nothing about the band you are comparing against — and the band is the
 * point of the drawing. The outlier bar is drawn at full height with a caret to mark
 * that it runs off the top; the exact magnitude is the big number right above it.
 */
function Sparkline({ sample, current, label }: { sample: number[]; current: number | null; label: string }) {
  if (sample.length === 0) return null;
  const max = Math.max(...sample);
  const offScale = current !== null && current > max;

  return (
    <div className="spark" role="img" aria-label={label}>
      {sample.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
      {current !== null && (
        <i
          className={`peak${offScale ? " off-scale" : ""}`}
          style={{ height: `${Math.min(100, Math.max(8, (current / max) * 100))}%` }}
        />
      )}
    </div>
  );
}

export default function Specimen({
  post,
  onStatus,
  onHooks,
}: {
  post: PostView;
  onStatus: (status: Status) => void;
  onHooks: (patch: HookPatch) => void;
}) {
  const posted = post.postedAt
    ? new Date(post.postedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "date unknown";

  return (
    <div key={post.id}>
      <div className="colhead">
        <h2>@{post.handle}</h2>
        <span className="sub">
          {post.displayName ? `${post.displayName} · ` : ""}
          {post.followers ? `${post.followers.toLocaleString()} followers · ` : ""}
          posted {posted}
        </span>
      </div>

      <div className="triage">
        <button type="button" aria-pressed={post.status === "saved"} onClick={() => onStatus("saved")}>
          Save to swipe file
        </button>
        <button type="button" aria-pressed={post.status === "rejected"} onClick={() => onStatus("rejected")}>
          Reject
        </button>
      </div>

      <div className="specimen">
        <div>
          <div className="frame" style={posterStyle(post.posterHue, post.thumbnailUrl)}>
            <p>{post.hooks.visual ?? "No visual hook captured"}</p>
          </div>
          <p className="framefoot">
            <a href={post.url} target="_blank" rel="noreferrer noopener">
              Open on Instagram
            </a>
          </p>
        </div>

        <div>
          <div className="verdict">
            <div className={`big tnum${post.score.multiple === null ? " unscored" : ""}`}>
              {post.score.multiple === null ? "Unscored" : formatMultiple(post.score.multiple)}
            </div>
            <Sparkline
              sample={post.baselineSample}
              current={
                post.score.multiple === null
                  ? null
                  : (post[post.baselineMetric === "likes" ? "likes" : "views"] ?? null)
              }
              label={`This account's last ${post.baselineSample.length} posts, with this one alongside them.`}
            />
            <p className={`why${post.score.confidence === "low" && post.score.multiple !== null ? " low" : ""}`}>
              {post.score.reason}
              {post.score.multiple !== null && ` Measured on ${post.score.metric}.`}
            </p>
          </div>

          <div className="field">
            <div className="field-head">
              <h3>Visual hook</h3>
              <span className="note">text on the opening frame</span>
            </div>
            <AutoTextarea
              id={`visual-${post.id}`}
              className="said"
              value={post.hooks.visual ?? ""}
              placeholder="Nothing read off the opening frame."
              onCommit={(visual) => onHooks({ visual })}
            />
          </div>

          <div className="field">
            <div className="field-head">
              <h3>Audio hook</h3>
              <span className="note">{AUDIO_NOTE[post.hooks.audioState]}</span>
            </div>
            {post.hooks.audioState === "speech" || post.hooks.audio ? (
              <AutoTextarea
                id={`audio-${post.id}`}
                className="said"
                value={post.hooks.audio ?? ""}
                placeholder="First spoken line."
                onCommit={(audio) => onHooks({ audio })}
              />
            ) : (
              <p className="empty">{AUDIO_NOTE[post.hooks.audioState]}</p>
            )}
          </div>

          <div className="field">
            <div className="field-head">
              <h3>Caption</h3>
            </div>
            <AutoTextarea
              id={`caption-${post.id}`}
              className="prose"
              value={post.hooks.caption ?? ""}
              placeholder="No caption."
              onCommit={(caption) => onHooks({ caption })}
            />
          </div>

          <div className="field">
            <div className="field-head">
              <h3>Body</h3>
              <span className="note">{post.hooks.body ? "full transcript" : ""}</span>
            </div>
            {post.hooks.body ? (
              <AutoTextarea
                id={`body-${post.id}`}
                className="prose"
                value={post.hooks.body}
                placeholder="Full transcript."
                onCommit={(body) => onHooks({ body })}
              />
            ) : (
              <p className="empty">No transcript — there is no speech in this post.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
