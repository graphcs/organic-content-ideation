/**
 * Tests for the part of the harvester that cannot be exercised without a live
 * Instagram session: the payload walker.
 *
 * Instagram reshapes its feed responses regularly and the field names move around,
 * so the parser looks for media-shaped objects anywhere in the tree rather than
 * following a fixed path. These fixtures cover the shapes seen in the wild — a reel
 * with play counts, an image with likes only, a carousel, and an account with counts
 * hidden — plus the nesting depth the real payloads use.
 */

import { collectFromPayload, type HarvestedPost } from "../scraper/harvest";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const payload = {
  items: [
    {
      // A reel, nested the way the feed actually wraps items.
      media_or_ad: {
        code: "Dx7kQeRnM1a",
        product_type: "clips",
        taken_at: 1757336400,
        play_count: 402000,
        like_count: 21400,
        comment_count: 1870,
        user: { username: "thegreyzone.hrt", full_name: "The Grey Zone", follower_count: 41200 },
        image_versions2: { candidates: [{ url: "https://cdn.example/thumb.jpg" }] },
        video_versions: [{ url: "https://cdn.example/clip.mp4" }],
      },
    },
    {
      media_or_ad: {
        code: "Dx1fJaVlH2h",
        is_video: false,
        like_count: 890,
        comment_count: 64,
        user: { username: "themorningstack", full_name: "The Morning Stack" },
        image_versions2: { candidates: [{ url: "https://cdn.example/img.jpg" }] },
      },
    },
    {
      media_or_ad: {
        shortcode: "Dx0eIzUkG1i",
        carousel_media: [{ id: "1" }, { id: "2" }],
        like_count: 2100,
        user: { username: "mensdeskdiet" },
      },
    },
    {
      media_or_ad: {
        code: "DwYcGxSiE9k",
        is_video: true,
        comment_count: 41,
        user: { username: "rawprotocol" },
      },
    },
  ],
};

const out = new Map<string, Partial<HarvestedPost>>();
collectFromPayload(payload, out);

console.log("\npayload walker");
check("finds every post in a nested payload", out.size === 4, `${out.size} found`);

const reel = out.get("Dx7kQeRnM1a")!;
check("reel: exact play count, not a rendered string", reel.views === 402000);
check("reel: typed as a reel", reel.mediaType === "reel");
check("reel: url built for /reel/", reel.url === "https://www.instagram.com/reel/Dx7kQeRnM1a/");
check("reel: author and followers", reel.handle === "thegreyzone.hrt" && reel.followers === 41200);
check("reel: video url captured for enrichment", Boolean(reel.videoUrl));
check(
  "reel: timestamp converted from unix seconds",
  reel.postedAt === new Date(1757336400 * 1000).toISOString(),
);

const image = out.get("Dx1fJaVlH2h")!;
check("image: typed as image", image.mediaType === "image");
check("image: url built for /p/", image.url === "https://www.instagram.com/p/Dx1fJaVlH2h/");
check("image: no views invented where none exist", image.views === null);

check("carousel: detected from carousel_media", out.get("Dx0eIzUkG1i")!.mediaType === "carousel");
check("carousel: reads the shortcode alias", out.get("Dx0eIzUkG1i")!.handle === "mensdeskdiet");

const hidden = out.get("DwYcGxSiE9k")!;
check(
  "hidden counts stay null rather than becoming zero",
  hidden.views === null && hidden.likes === null,
  `views=${hidden.views} likes=${hidden.likes}`,
);

console.log("\nnon-media payloads");
for (const junk of [null, undefined, {}, [], { data: { user: { username: "x" } } }, "string"]) {
  const m = new Map<string, Partial<HarvestedPost>>();
  collectFromPayload(junk, m);
  check(`ignores ${JSON.stringify(junk) ?? "undefined"}`, m.size === 0);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
