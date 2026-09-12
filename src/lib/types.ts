import type { Metric, OutlierScore } from "./outlier";

export type AudioState = "speech" | "music" | "silent" | "unknown";
export type Status = "new" | "saved" | "rejected";

export interface Hooks {
  visual: string | null;
  audio: string | null;
  audioState: AudioState;
  caption: string | null;
  body: string | null;
  editedByUser: boolean;
}

export interface Generation {
  id: string;
  postId: string;
  prompt: string;
  response: string;
  model: string | null;
  status: "streaming" | "complete" | "error";
  error: string | null;
  createdAt: string;
}

export interface PostView {
  id: string;
  shortcode: string;
  url: string;
  handle: string;
  displayName: string | null;
  followers: number | null;
  mediaType: "reel" | "image" | "carousel";
  thumbnailUrl: string | null;
  /** Deterministic hue for the placeholder frame when no thumbnail was captured. */
  posterHue: number;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** The account's recent-post sample the baseline was taken over. Drawn as the sparkline. */
  baselineSample: number[];
  baselineValue: number | null;
  baselineMetric: Metric;
  score: OutlierScore;
  status: Status;
  notes: string | null;
  hooks: Hooks;
  generations: Generation[];
}

export interface HookPatch {
  visual?: string | null;
  audio?: string | null;
  audioState?: AudioState;
  caption?: string | null;
  body?: string | null;
}
