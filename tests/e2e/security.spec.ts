import { expect, test } from '@playwright/test';

// Requires: supabase start, supabase db reset, functions served, `npm run seed:demo`.
const PASSWORD = 'TrustVault-Demo-1!';
async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
}

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/documents');
  await expect(page).toHaveURL(/\/login/);
});

test('admin cannot see other users documents but can open the audit log', async ({ page }) => {
  await login(page, 'admin.e@trustvault.test');
  await page.goto('/documents');
  await expect(page.getByText('No documents found')).toBeVisible();
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

test('non-admin gets access denied on admin pages and not-found on foreign ids', async ({ page }) => {
  await login(page, 'owner.b@trustvault.test');
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await page.goto('/documents/11111111-1111-4111-8111-111111111111');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
});
