// Tasks 5.3, 5.7 — the pages in a real browser: hydration without errors, sort
// buttons only once interactive, and no WCAG 2.2 AA violations axe can detect.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/',
  '/datasets/',
  '/datasets/golden-horse-2018-nominations/',
  '/datasets/twnic-interconnection-bandwidth/',
  '/wanted/',
  '/courses/',
  '/courses/ncku-stat-intro-data-science/',
  '/news/',
  '/about/',
  '/stat1021/',
  '/search/?q=%E6%8D%B7%E9%81%8B',
];

function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

for (const url of PAGES) {
  test(`${url} hydrates without console errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
}

test('the dataset table gains sort buttons once interactive, and sorting by name works', async ({ page }) => {
  await page.goto('/datasets/');
  const byName = page.getByRole('button', { name: '名稱' });
  await expect(byName).toBeVisible();
  await byName.click();
  // Wait for the re-render: reading the rows right after the click raced it.
  const collator = new Intl.Collator('zh-Hant-TW');
  const rows = page.locator('table.data-table tbody tr th a');
  await expect
    .poll(async () => {
      const names = await rows.allTextContents();
      return names.length > 1 && names.join('|') === [...names].sort(collator.compare).join('|');
    })
    .toBe(true);
  const names = await rows.allTextContents();
  expect(await rows.first().textContent()).toBe([...names].sort(collator.compare)[0]);
});

test('client-side navigation from the table to a detail page renders the record', async ({ page }) => {
  await page.goto('/datasets/');
  await page.getByRole('link', { name: '第55屆金馬獎入圍者–電影網絡' }).click();
  await expect(page).toHaveURL(/\/datasets\/golden-horse-2018-nominations\/$/);
  await expect(page.locator('h1')).toHaveText('第55屆金馬獎入圍者–電影網絡');
});

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const [name, url] of [
  ['home', '/'],
  ['search results', '/search/?q=%E6%8D%B7%E9%81%8B'],
  ['empty search', '/search/?q=%E4%BA%BA%E5%8F%A3%E9%81%B7%E5%BE%99'],
  ['dataset table', '/datasets/'],
  ['course table', '/courses/'],
  ['dataset detail', '/datasets/golden-horse-2018-nominations/'],
  ['course detail', '/courses/nthu-network-science/'],
  ['about', '/about/'],
]) {
  test(`task 5.7: ${name} has no WCAG 2.2 AA violations that axe can detect`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}

test('task 5.7: the table becomes cards on a phone, with every cell labelled', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/datasets/');
  const display = await page.locator('table.data-table tbody tr').first().evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('block');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
