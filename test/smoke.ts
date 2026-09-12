/**
 * End-to-end smoke test against a running dev server.
 *
 *   npm run dev            # in one terminal
 *   npm run test:smoke     # in another
 *
 * These are the checks that caught real bugs during the build, so they are the
 * ones worth keeping: switching posts has to swap every field, long text has to
 * be fully visible rather than clipped by an autosizing textarea measured before
 * the web font loaded, and the page must not scroll sideways on a phone.
 */

import { chromium, type Page } from "playwright";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3111";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const fieldText = (page: Page, field: string) =>
  page.locator(`textarea[id^="${field}-"]`).first().inputValue();

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });

  console.log("\nqueue");
  const items = page.locator(".queue-item");
  check("ten posts listed", (await items.count()) === 10, `${await items.count()} found`);
  check(
    "ranked by multiple, standout first",
    (await items.first().locator(".mult").innerText()).includes("11x"),
  );
  check(
    "a post with no visible counts reads as unscored, not as zero",
    (await items.last().locator(".mult").innerText()).trim() === "unscored",
  );

  console.log("\nswitching posts");
  const firstVisual = await fieldText(page, "visual");
  const firstBody = await fieldText(page, "body");
  await items.nth(2).click();
  await page.waitForTimeout(400);
  const secondVisual = await fieldText(page, "visual");
  const secondBody = await fieldText(page, "body");

  check("visual hook follows the selection", firstVisual !== secondVisual);
  check("body follows the selection", firstBody !== secondBody);
  // The specimen column is the second one; the first is the queue.
  const specimenHeader = await page.locator(".workbench > .col").nth(1).locator("h2").innerText();
  check(
    "header and fields describe the same post",
    specimenHeader.includes("nightshiftgains") && secondVisual.includes("cortisol"),
    `header=${specimenHeader}, visual=${secondVisual.slice(0, 30)}`,
  );

  console.log("\ntext is not clipped");
  for (const field of ["caption", "body"]) {
    const box = page.locator(`textarea[id^="${field}-"]`).first();
    const { clientHeight, scrollHeight } = await box.evaluate((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    check(`${field} shows every line`, clientHeight >= scrollHeight - 1, `${clientHeight}px of ${scrollHeight}px`);
  }

  console.log("\ntriage");
  await page.keyboard.press("s");
  await page.waitForTimeout(600);
  check("save marks the queue row", (await page.locator(".tick.saved").count()) >= 1);
  check("masthead counts it", (await page.locator(".masthead .meta").innerText()).includes("1 saved"));
  await page.locator(".filters button", { hasText: "Saved" }).click();
  await page.waitForTimeout(300);
  check("saved filter narrows the queue", (await page.locator(".queue-item").count()) === 1);

  console.log("\nkeyboard does not steal keys from a field");
  await page.locator(".filters button", { hasText: "All" }).click();
  await page.locator('textarea[id^="caption-"]').first().click();
  await page.keyboard.type("x");
  check(
    "typing x in a field does not reject the post",
    (await page.locator(".queue-item.is-rejected").count()) === 0,
  );

  console.log("\nphone width");
  await page.setViewportSize({ width: 400, height: 850 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("no sideways scroll", overflow <= 1, `${overflow}px over`);
  const gutter = await page.evaluate(() => {
    const el = document.querySelector(".masthead") as HTMLElement;
    return parseFloat(getComputedStyle(el).paddingLeft);
  });
  check("side gutter holds", gutter >= 16, `${gutter}px`);

  await browser.close();

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
