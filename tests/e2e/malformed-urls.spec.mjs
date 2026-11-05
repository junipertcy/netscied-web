// Final review W5: a malformed percent-escape anywhere in the query string made
// Angular's URL parser throw (NG04018), swap the page for the home page and
// rewrite the address. Truncated shares of percent-encoded Mandarin links are
// realistic, so the page must stay where it is.
import { test, expect } from '@playwright/test';

function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('a lone % in a tracking parameter keeps the dataset page and its address', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/datasets/golden-horse-2018-nominations/?utm_source=%');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1')).toContainText('金馬獎');
  expect(new URL(page.url()).pathname).toBe('/datasets/golden-horse-2018-nominations/');
  expect(errors.filter((e) => /NG04018|URIError|malformed/i.test(e))).toEqual([]);
});

test('a truncated percent-encoded Mandarin query stays on /search/ and searches what it can read', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/search/?q=%E9%87%91%E9%A6%A');
  await page.waitForLoadState('networkidle');
  expect(new URL(page.url()).pathname).toBe('/search/');
  await expect(page.locator('main h1')).toHaveText('搜尋結果');
  await expect(page.locator('main input[name="q"]')).toHaveValue(/^金/);
  expect(errors.filter((e) => /NG04018|URIError|malformed/i.test(e))).toEqual([]);
});
