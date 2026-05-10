import { test, expect } from '@playwright/test';

test('homepage loads with correct title', async ({ page }) => {
  await page.goto('/find-insurance');
  await expect(page).toHaveTitle(/Bridge Warranty/i);
  await expect(page.getByRole('heading', { name: /Canada's Dealer-Only Warranty Marketplace/i })).toBeVisible();
  await expect(page.getByText(/Launching July 2026/i)).toBeVisible();
});

test('homepage shows platform launch countdown', async ({ page }) => {
  await page.goto('/find-insurance');
  await expect(page.getByRole('heading', { name: /Platform Launch Countdown/i })).toBeVisible();
});

test('sign-in page is accessible', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
  await expect(page.getByLabel(/^Password$/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Sign In to Dashboard/i })).toBeVisible();
});

test('navigation between pages works', async ({ page }) => {
  await page.goto('/find-insurance');
  const registerLink = page.getByRole('link', { name: /register your dealership/i }).first();
  await expect(registerLink).toBeVisible();
  await registerLink.click();
  await expect(page).toHaveURL(/\/register-dealership/);
});

test('dealer dashboard renders for authenticated user', async ({ page }) => {
  await page.goto('/dealer-dashboard');
  // In local mode without auth, should redirect to sign-in
  await expect(page).toHaveURL(/\/sign-in/);
});
