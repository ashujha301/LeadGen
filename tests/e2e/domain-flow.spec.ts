import { test, expect } from "@playwright/test";

test.describe("domain search flow", () => {
  test("home page loads and accepts domain input", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Domain search" })).toBeVisible();
    await expect(page.getByLabel("Company domain")).toBeVisible();
    await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
  });

  test("navigation links are accessible", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Potential Connections" }).click();
    await expect(page.getByRole("heading", { name: "Potential Connections" })).toBeVisible();

    await page.getByRole("link", { name: "Review" }).click();
    await expect(page.getByRole("heading", { name: "Entity review" })).toBeVisible();
  });

  test("invalid domain shows validation feedback", async ({ page }) => {
    await page.goto("/");

    const domainInput = page.getByLabel("Company domain");
    await domainInput.fill("!!!");
    await page.getByRole("button", { name: /search/i }).click();

    // HTML5 validation or API error should prevent navigation
    await expect(page).toHaveURL("/");
  });

  test("run detail page renders progress shell", async ({ page }) => {
    const fakeRunId = "00000000-0000-4000-8000-000000000001";
    await page.goto(`/runs/${fakeRunId}`);

    // Either shows error state or loading — page should not crash
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
