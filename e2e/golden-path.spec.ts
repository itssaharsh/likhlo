import { expect, test, type Page } from "@playwright/test";

// The golden path on the recorded samples. /api/read and /api/speak need keys, so any call to them fails the test.
/** The verdict's total as shown: NumberFlow draws a column of digits per place, the visible ones are not inert. */
const shownTotal = (page: Page) =>
  page.locator(".verdict number-flow-react").evaluate((el) =>
    el.shadowRoot?.querySelector(".digit")
      ? [...el.shadowRoot.querySelectorAll(".symbol__value, .digit__num:not([inert])")].map((n) => n.textContent).join("")
      : (el.textContent ?? "").trim(),
  );

let keyed: string[] = [];

test.beforeEach(async ({ page }) => {
  keyed = [];
  await page.route(/\/api\/(read|speak)(\?|$)/, (route) => {
    keyed.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
});

test.afterEach(() => {
  expect(keyed, "called an API that needs keys").toEqual([]);
});

test("first screen: Rahima's prescription, already read, with the lower total", async ({ page }) => {
  await expect.poll(() => shownTotal(page)).toBe("৳409");
  await expect(page.locator(".verdict")).toContainText("instead of");
});

test("a recorded sample replays and ends on its total", async ({ page }) => {
  await page.getByRole("button", { name: "Diabetes and BP, monthly" }).click();
  await expect(page.locator(".verdict.landed")).toContainText("instead of ৳1,675", { timeout: 60_000 });
  await expect.poll(() => shownTotal(page), { timeout: 15_000 }).toBe("৳798");
});

test("the Seclo row opens every brand of the same medicine", async ({ page }) => {
  await page.getByRole("button", { name: /^Seclo 20 mg: open details/ }).click();
  const sheet = page.locator("dialog.sheet[open]");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("G-Omeprazole");
});

test("Save for the pharmacy opens the slip", async ({ page }) => {
  await page.getByRole("button", { name: "Save for the pharmacy" }).first().click();
  const slip = page.locator("dialog.slip-sheet[open]");
  await expect(slip).toBeVisible();
  await expect(slip).toContainText("For the pharmacy");
  await expect(slip).toContainText("G-Omeprazole");
});

test("searching Seclo 20 shows G-Omeprazole", async ({ page }) => {
  const input = page.getByPlaceholder("Type a brand, e.g. Napa Extend or Seclo 20");
  test.skip((await input.count()) === 0, "medicine search is not on this branch yet");
  await input.fill("Seclo 20");
  await expect(page.locator("#search")).toContainText("G-Omeprazole");
});

test("Add reminders downloads a calendar file", async ({ page }) => {
  const button = page.getByRole("button", { name: /Add reminders to my phone/ });
  test.skip((await button.count()) === 0, "phone reminders are not on this branch yet");
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});
