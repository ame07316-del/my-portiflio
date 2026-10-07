import { test, expect } from '@playwright/test';

const rowTitles = (page: import('@playwright/test').Page) =>
  page.locator('.p-row .p-title').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('boots to ready and renders the migrated bilingual portfolio', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('[data-status-pill]')).toHaveText('ready');
  await expect(page.locator('.p-row')).toHaveCount(3);
  expect(await rowTitles(page)).toEqual([
    'Interactive Restaurant Menu',
    'Gym & Fitness Platform',
    'EstateHub Pro',
  ]);
});

test('locale switch flips the document to RTL and shows Arabic content', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('[data-status-pill]')).toHaveText('ready');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.locator('[data-locale-switch]').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  expect((await rowTitles(page))[2]).toBe('منصة العقارات');
  await expect(page.locator('.p-heading')).toHaveText('المشاريع');
  await expect(page.locator('.p-row .p-status').first()).toHaveAttribute('data-status', 'live');

  await page.locator('[data-locale-switch]').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('optimistic add appends a row immediately and it survives the ack', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('[data-status-pill]')).toHaveText('ready');
  await page.locator('.p-new').fill('E2E Canary Project');
  await page.locator('.p-add').click();
  await expect(page.locator('.p-row')).toHaveCount(4); // optimistic, before any ack
  await page.waitForTimeout(800);
  await expect(page.locator('.p-row')).toHaveCount(4);
});

test('status toggle flips live ⇄ draft through the CRDT', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('[data-status-pill]')).toHaveText('ready');
  const first = page.locator('.p-row .p-status').first();
  await expect(first).toHaveAttribute('data-status', 'live');
  await first.click();
  await expect(first).toHaveAttribute('data-status', 'draft');
  await expect(first).toHaveText('draft');
  await first.click();
  await expect(first).toHaveAttribute('data-status', 'live');
  await expect(first).toHaveText('live');
});
