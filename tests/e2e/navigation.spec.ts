import { expect, test } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4000";
const username =
  process.env.SMOKE_USER ||
  process.env.ADMIN_USER ||
  process.env.E2E_USER ||
  "";
const password =
  process.env.SMOKE_PASS ||
  process.env.ADMIN_PASS ||
  process.env.E2E_PASS ||
  "";

async function getAuthenticatedContext(request: any, browser: any) {
  const candidates = Array.from(new Set([password, `${password}_e2e`])).filter(Boolean);
  let activePassword = "";
  let res: any = null;
  for (const candidate of candidates) {
    const attempt = await request.post(`${baseURL}/api/auth/login`, {
      data: { username, password: candidate },
    });
    if (attempt.status() === 200) {
      activePassword = candidate;
      res = attempt;
      break;
    }
  }
  expect(Boolean(res), `login should return 200 (tried: ${candidates.join(", ")})`).toBe(true);
  const meRes = await request.get(`${baseURL}/api/auth/me`);
  if (meRes.status() === 200) {
    const me = await meRes.json();
    if (Boolean(me?.user?.mustChangePassword)) {
      const nextPassword = activePassword === password ? `${password}_e2e` : password;
      const changeRes = await request.post(`${baseURL}/api/trpc/auth.changePassword`, {
        data: {
          json: {
            currentPassword: activePassword,
            newPassword: nextPassword,
          },
        },
      });
      expect(changeRes.status(), "forced changePassword should return 200").toBe(200);
      activePassword = nextPassword;
      res = await request.post(`${baseURL}/api/auth/login`, {
        data: { username, password: activePassword },
      });
      expect(res.status(), "login after forced password change should return 200").toBe(200);
    }
  }
  const storageState = await request.storageState();
  return await browser.newContext({
    baseURL,
    storageState,
  });
}

test.describe("navigation reliability", () => {
  test.skip(!username || !password, "Set SMOKE_USER/SMOKE_PASS (or ADMIN_USER/ADMIN_PASS)");

  test("home and sign-out buttons work", async ({ request, browser }) => {
    const context = await getAuthenticatedContext(request, browser);
    const page = await context.newPage();
    await page.goto("/patients");
    await expect(page).toHaveURL(/\/patients/);

    const homeByText = page.getByRole("button", { name: /الصفحة الرئيسية|ط§ظ„طµظپط­ط© ط§ظ„ط±ط¦ظٹط³ظٹط©/ });
    if (await homeByText.count()) {
      await homeByText.first().click();
    } else {
      await page.locator("button:has(.lucide-home), button:has(.lucide-house)").first().click();
    }
    await expect(page).toHaveURL(/\/dashboard/);

    const signoutByText = page.getByRole("button", { name: /تسجيل الخروج|طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬/ });
    if (await signoutByText.count()) {
      await signoutByText.first().click();
    } else {
      await page.locator("button:has(.lucide-log-out)").first().click();
    }
    await expect(page).toHaveURL(/\/login|\/$/);
    await context.close();
  });

  test("legacy surgery sheet route redirects to operation route", async ({ request, browser }) => {
    const context = await getAuthenticatedContext(request, browser);
    const page = await context.newPage();
    await page.goto("/sheets/surgery/1");
    await expect(page).toHaveURL(/\/sheets\/operation\/1/);
    await context.close();
  });
});
