# Design direction

## Subject

A creative strategist's workbench for reverse-engineering why a piece of Instagram content went viral, then turning it into ad copy. The audience is one expert doing fast triage — skim thirty posts, keep three. The primary job is **judging signal against a baseline**, and everything else is bookkeeping.

Two constraints fall out of that:

1. **The content is already loud.** Supplement and fitness creative is saturated, high-contrast and shouting. The interface has to be the quiet instrument around it or the two fight. Any UI that brings its own strong colour will lose to a thumbnail.
2. **One number matters more than everything else on screen.** The Loom is a person repeatedly computing "how much more than average did this get?" That ratio is the product. It should be the boldest thing in the layout and nothing should compete with it.

## Tokens

**Colour**

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#F2F3F0` | Page. Cool off-white with a green-grey cast |
| `--card` | `#FFFFFF` | Specimen surfaces, so thumbnails sit on true white |
| `--rule` | `#D5D8D2` | Hairlines, column separators |
| `--ink` | `#0E2B25` | Text and chrome. Deep pine, a real hue rather than a tinted black |
| `--muted` | `#5E6B66` | Metadata, secondary counts |
| `--signal` | `#B5179E` | **Outlier magnitude only**, plus the single primary action |

Light ground is a deliberate call against the reflex to make any media tool dark. A strategist reads a lot of caption and transcript text here; this is closer to reviewing documents than to editing video. White cards also let garish thumbnails look like themselves instead of being flattened by a dark surround.

**Type**

- **Archivo** — all interface text, counts, controls. A grotesque with enough width variation to set dense metric columns tightly without feeling like system UI.
- **Newsreader** — captured hook text and transcripts only, ~26px, generous leading. The hooks are quoted evidence, so they are set like quoted evidence. The split is by *role*, not by size: nothing in the chrome is ever serif, and no captured text is ever sans.

**Layout**

Three columns, desktop-first, left-aligned throughout.

```
┌──────────────┬────────────────────────────┬──────────────────┐
│ FEED QUEUE   │ SPECIMEN                   │ WRITING          │
│              │                            │                  │
│ ▸ thumb  4.2×│  ┌────────┐  VISUAL HOOK   │  Prompt (edit)   │
│ ▸ thumb  1.1×│  │        │  ──────────────│  ──────────────  │
│ ▸ thumb  6.8×│  │ 9:16   │  AUDIO HOOK    │  streamed        │
│ ▸ thumb  0.9×│  │        │  ──────────────│  output          │
│              │  └────────┘  CAPTION       │  appears         │
│  ranked by   │                            │  here            │
│  multiple    │   ▁▁▂▁▂█▁▁  4.2×           │                  │
│              │   baseline  spike          │  [Write copy]    │
└──────────────┴────────────────────────────┴──────────────────┘
```

Below 1100px the three columns become a two-pane list/detail; below 700px, a single stack with the writing panel as a sheet.

**The one bold element.** The outlier multiple is set as a large numeral in `--signal`, sitting directly on a sparkline of that account's recent posts with the current post as the one bar breaking the band. The number and the evidence for the number occupy the same object. Nothing else on the page uses `--signal` except the write button.

## Review against the brief

Three things in the first pass were defaults rather than choices, and were changed:

- **Dark slate ground with a lime accent** — that is one of the standard generated looks, and it would have dulled the thumbnails, which are the actual content. Replaced with the cool off-white ground.
- **A uniform grid of rounded cards, one per post** — a card grid implies the items are peers to be browsed. They are not; they are candidates to be ranked and mostly discarded. A dense ranked list is both truer and faster to skim, and it puts the multiple in a readable column.
- **Numbered step markers across the hook fields** — visual, audio, caption and body are four facets of one artefact, not a sequence. Numbering them would assert an order that does not exist. They are separated by rules and distinguished by label weight instead.

## Quality floor

Keyboard triage (`j`/`k` to move, `s` to save, `x` to reject) because the whole point is speed; visible focus rings; `prefers-reduced-motion` respected — the only motion in the interface is the streamed response arriving, which is real feedback rather than decoration.
