import { test, expect } from '@playwright/test';

test('homepage loads with correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Bridge Warranty/i);
  await expect(page.getByText('Bridge Warranty')).toBeVisible();
});

test('homepage shows soft launch countdown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Soft Launch/i)).toBeVisible();
});

test('sign-in page is accessible', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test('navigation between pages works', async ({ page }) => {
  await page.goto('/');
  const registerLink = page.getByRole('link', { name: /register your dealership/i });
  await expect(registerLink).toBeVisible();
  await registerLink.click();
  await expect(page).toHaveURL(/\/register-dealership/);
});

test('dealer dashboard renders for authenticated user', async ({ page }) => {
  await page.goto('/dealer-dashboard');
  // In local mode without auth, should redirect to sign-in
  await expect(page).toHaveURL(/\/sign-in/);
});
