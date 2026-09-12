/**
 * Placeholder frame for a post whose thumbnail was not captured.
 *
 * Instagram's CDN URLs are signed and expire within hours, so a harvested
 * thumbnail is not something a demo can rely on. Rather than show a grey box, each
 * post gets a deterministic two-stop gradient from its own hue, which keeps the
 * queue scannable — you learn to recognise a post by its colour while triaging.
 */
export function posterStyle(hue: number, thumbnailUrl?: string | null): React.CSSProperties {
  if (thumbnailUrl) return { backgroundImage: `url(${thumbnailUrl})` };
  return {
    backgroundImage: `linear-gradient(152deg, hsl(${hue} 42% 62%), hsl(${(hue + 34) % 360} 38% 34%))`,
  };
}
