import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regenerates the README screenshots from the real app in demo mode:
 *   npm run build && npm run screenshots
 * Output: ../docs/screenshots (override with SCREENSHOT_DIR).
 */
const OUT = process.env.SCREENSHOT_DIR ?? join(__dirname, "..", "..", "docs", "screenshots");
const OUTAGE_ORIGIN = "310-260-1003-100202";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => mkdirSync(join(OUT, "outage-frames"), { recursive: true }));

async function settle(page: Page, ms = 4500) {
  await page.waitForTimeout(ms); // let tickers, charts and map tiles settle
}

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
}

test("overview (EN, dark)", async ({ page }) => {
  await setTheme(page, "dark");
  await page.goto("/en?demoAt=300");
  await expect(page.getByTestId("value-card")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: join(OUT, "overview-en.png") });
});

test("live operations (EN, dark)", async ({ page }) => {
  await setTheme(page, "dark");
  await page.goto("/en/live?demoAt=320");
  await settle(page);
  await page.screenshot({ path: join(OUT, "live-en.png") });
});

test("geo map during the outage (EN, dark)", async ({ page }) => {
  await setTheme(page, "dark");
  await page.goto(`/en/map?demoAt=330&cell=${OUTAGE_ORIGIN}`);
  await expect(page.getByTestId("cell-drawer")).toBeVisible();
  await settle(page, 7000);
  await page.screenshot({ path: join(OUT, "map-outage-en.png") });
});

test("incident + AI diagnosis (ES, dark)", async ({ page }) => {
  await setTheme(page, "dark");
  await page.goto("/es/incidents?demoAt=330");
  await expect(page.getByTestId("diagnosis-summary")).toContainText("Posible");
  await settle(page, 2500);
  await page.screenshot({ path: join(OUT, "incident-es.png"), fullPage: true });
});

test("cost & ROI simulator (ES, light, COP)", async ({ page }) => {
  await setTheme(page, "light");
  await page.addInitScript(() =>
    window.localStorage.setItem("fleetintel-dashboard", JSON.stringify({ state: { currency: "COP" }, version: 1 })),
  );
  await page.goto("/es/cost?devices=2500000&interval=900&payload=512&batch=1&llm=1&tier=tiered");
  await settle(page, 2500);
  await page.screenshot({ path: join(OUT, "cost-es-light.png") });
});

test("outage spreading - frame sequence", async ({ page }) => {
  test.setTimeout(180_000);
  await setTheme(page, "dark");
  for (const [i, t] of [110, 140, 170, 200, 240, 300].entries()) {
    await page.goto(`/en/map?demoAt=${t}&focus=${OUTAGE_ORIGIN}`);
    await settle(page, 5000);
    await page.screenshot({ path: join(OUT, "outage-frames", `frame-${i}.png`), clip: { x: 260, y: 160, width: 1200, height: 700 } });
  }
});
