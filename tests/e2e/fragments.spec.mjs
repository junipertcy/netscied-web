// Final review W1: with <base href="/">, fragment-only links resolve to the home
// page. The skip link and in-page links must stay on the page they are on.
import { test, expect } from '@playwright/test';

test('the skip link moves to the main content of the current page', async ({ page }) => {
  await page.goto('/datasets/');
  await page.keyboard.press('Tab');
  const skip = page.locator('a.skip-link');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/datasets\/#main$/);
  await expect(page.locator('main h1')).toBeVisible();
});

test('an /about/ table-of-contents link stays on /about/', async ({ page }) => {
  await page.goto('/about/');
  await page.locator('main a', { hasText: '下架與更正' }).first().click();
  await expect(page).toHaveURL(/\/about\/#takedown$/);
  await expect(page.locator('#takedown')).toBeInViewport();
});

test('a news permalink stays on /news/', async ({ page }) => {
  await page.goto('/news/');
  const link = page.locator('ol.news-list > li h2 a').first();
  const id = await page.locator('ol.news-list > li').first().getAttribute('id');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/news/#${id}$`));
});

test('on a search page the skip link keeps the query', async ({ page }) => {
  await page.goto('/search/?q=%E6%8D%B7%E9%81%8B');
  await expect(page.locator('a.skip-link')).toHaveAttribute('href', '/search/?q=%E6%8D%B7%E9%81%8B#main');
});
