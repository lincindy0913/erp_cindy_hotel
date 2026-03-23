// @ts-check
import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('health API returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /進銷存系統/ })).toBeVisible();
    await expect(page.getByPlaceholder('請輸入電子郵件')).toBeVisible();
  });

  test('unauthorized page loads', async ({ page }) => {
    const res = await page.goto('/unauthorized');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: '權限不足' })).toBeVisible();
  });
});
