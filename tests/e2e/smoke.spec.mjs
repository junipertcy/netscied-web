// Task 3.1 — one sample browser test and one sample accessibility test.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the home page renders in Mandarin', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant-TW');
  await expect(page.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the home page has no WCAG 2.2 AA violations that axe can detect', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
