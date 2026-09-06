import { test, expect } from "@playwright/test";

test.describe("potential connections page", () => {
  test("loads table-first UI without UUID inputs", async ({ page }) => {
    await page.goto("/connections");

    await expect(page.getByRole("heading", { name: "Potential Connections" })).toBeVisible();
    await expect(
      page.getByText("Potential connection based on shared employment", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Company ID")).toHaveCount(0);
    await expect(page.getByLabel("Person ID", { exact: false })).toHaveCount(0);
  });
});
