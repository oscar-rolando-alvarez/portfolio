import { expect, test } from "@playwright/test";

// Responsive down to tablet: no horizontal page scroll and the icon rail navigation works.
for (const path of ["/en", "/en/live", "/es/incidents", "/es/cost"]) {
  test(`tablet layout ${path}`, async ({ page }) => {
    await page.goto(`${path}?demoAt=330`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
}
