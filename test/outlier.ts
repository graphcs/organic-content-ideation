/**
 * The scoring rules, stated as tests.
 *
 * The risk here is not arithmetic, it is quietly presenting an unreliable number as
 * a reliable one: blending likes with views, treating "we could not measure this" as
 * zero, or reporting a confident multiple off a two-post sample.
 */

import { baselineFromSample, formatMultiple, pickMetric, scorePost } from "../src/lib/outlier";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log("\nmetric selection");
check("views win when present", pickMetric({ views: 100, likes: 10 }) === "views");
check("likes are the fallback", pickMetric({ views: null, likes: 10 }) === "likes");
check("zero is not a metric", pickMetric({ views: 0, likes: 0 }) === "none");
check("nothing visible reads as none", pickMetric({}) === "none");

console.log("\nbaseline");
check("median of an odd sample", baselineFromSample([10, 30, 20], "views").value === 20);
check("median of an even sample", baselineFromSample([10, 20, 30, 40], "views").value === 25);
check("zeros are excluded from the median", baselineFromSample([0, 0, 10, 30, 20], "views").n === 3);
check("an empty sample yields no metric", baselineFromSample([], "views").metric === "none");

console.log("\nscoring");
const solid = baselineFromSample([1000, 1100, 900, 1200, 1000, 1050, 980, 1020], "views");
const s1 = scorePost({ views: 8000 }, solid);
check("standout band above 5x", s1.band === "standout" && s1.confidence === "high", `${s1.multiple}`);
check("the explanation names the metric it used", s1.metric === "views");

check("notable band between 2x and 5x", scorePost({ views: 3000 }, solid).band === "notable");
check("baseline band below 2x", scorePost({ views: 1100 }, solid).band === "baseline");

const thin = baselineFromSample([1000, 1200], "views");
const s2 = scorePost({ views: 8000 }, thin);
check("a thin sample is flagged low confidence", s2.confidence === "low");
check("and says so in words", s2.reason.includes("only 2 posts"), s2.reason);

console.log("\nrefusing to guess");
const none = baselineFromSample([], "none");
const s3 = scorePost({ views: 8000 }, none);
check("no baseline means unscored, never zero", s3.multiple === null && s3.band === "unscored");
check("and explains why", s3.reason.includes("No visible counts"), s3.reason);

const s4 = scorePost({ likes: 500 }, solid);
check(
  "a post with no views is not scored against a views baseline",
  s4.multiple === null && s4.band === "unscored",
  s4.reason,
);

console.log("\nhidden counts from a scraping service");
// Apify returns -1 for likes when a creator has hidden them. That must read as
// "unknown", never as a real number and never as zero.
check("a -1 sentinel is not a metric", pickMetric({ likes: -1 }) === "none");
check("a -1 sentinel is excluded from a baseline", baselineFromSample([-1, 100, 200, 300], "likes").n === 3);
const sentinel = scorePost({ likes: -1 }, baselineFromSample([100, 200, 300], "likes"));
check("a post with hidden counts is unscored", sentinel.multiple === null && sentinel.band === "unscored");

console.log("\nformatting");
check("one decimal below 10x", formatMultiple(6.84) === "6.8x");
check("whole numbers above 10x", formatMultiple(10.86) === "11x");
check("null renders as a dash", formatMultiple(null) === "—");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
