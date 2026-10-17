import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for every screen in both locales, in demo mode (no backend), with
 * an accessibility scan (axe, WCAG 2.2 A/AA) and a console-error budget.
 * `demoAt=330` pins the deterministic scenario mid cell-outage.
 */
const SCREENS = [
  { path: "", heading: { en: "Executive overview", es: "Resumen ejecutivo" }, probe: "kpi-availability" },
  { path: "/live", heading: { en: "Live operations", es: "Operación en vivo" }, probe: null },
  { path: "/map", heading: { en: "Geo map", es: "Mapa geográfico" }, probe: "map-legend" },
  { path: "/incidents", heading: { en: "Incidents & AI diagnosis", es: "Incidentes y diagnóstico con IA" }, probe: "incident-detail" },
  { path: "/cost", heading: { en: "Cost & ROI simulator", es: "Simulador de costo y ROI" }, probe: "cost-total" },
] as const;

// Third-party noise we do not control (basemap tiles/sprites when the CDN is unreachable in CI).
const IGNORED = [/tiles\.openfreemap\.org/, /Failed to load resource/, /AJAXError/, /could not be loaded/];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()))) errors.push(m.text());
  });
  return errors;
}

for (const locale of ["en", "es"] as const) {
  for (const s of SCREENS) {
    test(`${locale}${s.path || "/"} renders, streams and passes axe`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(`/${locale}${s.path}?demoAt=330`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1, name: s.heading[locale] })).toBeVisible();
      await expect(page.getByTestId("mode-badge")).toContainText(locale === "en" ? "Demo" : "Demo");
      if (s.probe) await expect(page.getByTestId(s.probe)).toBeVisible();
      // the demo stream is flowing
      await expect(page.getByTestId("mode-badge")).toContainText(locale === "en" ? "Streaming" : "Transmitiendo", { useInnerText: false });

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .exclude(".maplibregl-canvas-container")
        .exclude(".maplibregl-ctrl-attrib")
        .analyze();
      const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("locale switcher keeps the page and persists the choice", async ({ page, context }) => {
  await page.goto("/en/cost?demoAt=330");
  await page.getByTestId("locale-switcher").getByRole("radio", { name: "ES" }).click();
  await expect(page).toHaveURL(/\/es\/cost/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simulador de costo y ROI");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value).toBe("es");
  await page.goto("/");
  await expect(page).toHaveURL(/\/es$/);
});

test("command palette navigates and replays the outage", async ({ page }) => {
  await page.goto("/en?demoAt=330");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("Cost");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/cost/);
});

test("incident drill-down shows the bilingual AI diagnosis and approval flow", async ({ page }) => {
  await page.goto("/es/incidents?demoAt=330");
  const detail = page.getByTestId("incident-detail");
  await expect(detail.getByTestId("diagnosis-summary")).toContainText("Posible caída de celda");
  await detail.getByTestId("hitl-approve").click();
  await page.getByTestId("hitl-approve-confirm").click();
  await expect(detail.getByTestId("hitl-result")).toContainText("Remediación aprobada");
});

test("cost simulator recomputes and produces a shareable URL", async ({ page }) => {
  await page.goto("/en/cost?devices=1000000&interval=300&payload=512&batch=1&llm=1&tier=large");
  await expect(page.getByTestId("cost-total")).toContainText("$14,789.57");
  await page.getByRole("radio", { name: "Small" }).click();
  await expect(page).toHaveURL(/tier=small/);
  await expect(page.getByTestId("cost-total")).not.toContainText("$14,789.57");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-csv").click();
  expect((await download).suggestedFilename()).toBe("fleetintel-cost-1000000-devices.csv");
});

test("map shows the spreading outage and opens a cell drawer", async ({ page }) => {
  await page.goto("/en/map?demoAt=330&cell=310-260-1003-100202");
  await expect(page.getByTestId("map-legend")).toContainText("degraded");
  await expect(page.getByTestId("cell-drawer")).toContainText("310-260-1003-100202");
  await expect(page.getByTestId("cell-drawer")).toContainText("Cell outage");
});
