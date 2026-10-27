import { expect, test } from "@playwright/test";

test("public pages render", async ({ page }) => {
  for (const [path, heading] of [["/", /campus, connected/i], ["/features", /what you can do/i], ["/about", /about campusconnect/i], ["/community-guidelines", /community guidelines/i], ["/privacy", /privacy policy/i], ["/terms", /terms of service/i], ["/contact", /support/i]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});
test("anonymous visitors are redirected away from the student app and admin area", async ({ page }) => {
  await page.goto("/app"); await expect(page).toHaveURL(/\/login/);
  await page.goto("/admin"); await expect(page).toHaveURL(/\/login/);
});
test("registration form validates before sending anything", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/enter your name/i)).toBeVisible();
  await expect(page.getByText(/valid email/i)).toBeVisible();
});
test("login shows a safe error for wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.invalid"); await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("alert")).toContainText(/incorrect email or password|try again/i);
});
test("mobile layout has no horizontal scroll on the home page", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
