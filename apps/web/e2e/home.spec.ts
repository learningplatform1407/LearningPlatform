import { expect, test } from "@playwright/test";

test("home page shows the LearningPlatform heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LearningPlatform" })).toBeVisible();
});
