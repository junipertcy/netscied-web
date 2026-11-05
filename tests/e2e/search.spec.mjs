// Tasks 6.3 and 6.4 — the /search/ page in a real browser (site-search spec).
import { test, expect } from '@playwright/test';

const q = (s, type) => `/search/?q=${encodeURIComponent(s)}${type ? `&type=${type}` : ''}`;

function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('results for 捷運: a live count, result cards with badges, license and version, and no hydration errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(q('捷運'));
  const status = page.locator('main [role="status"]');
  await expect(status).toContainText('找到');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  const first = page.locator('ol.results li').first();
  await expect(first.locator('h2 a')).toHaveAttribute('href', '/datasets/taipei-metro-od-monthly/');
  await expect(first).toContainText('授權：');
  await expect(first).toContainText('最新版本：');
  await expect(page.locator('main input[name="q"]')).toHaveValue('捷運');
  expect(errors).toEqual([]);
});

test('人口遷徙: the empty state, the wanted entry in its own group, and prefilled request and catalog links', async ({ page }) => {
  await page.goto(q('人口遷徙'));
  await expect(page.locator('.empty-lead')).toHaveText('本站目前還沒有與「人口遷徙」有關的資料集。');
  await expect(page.locator('main [role="status"]')).toContainText('找到 0 筆資料集');
  const wanted = page.locator('.wanted-group');
  await expect(wanted.locator('h2')).toContainText('徵求中');
  await expect(wanted).toContainText('人口遷徙網絡');
  const encoded = encodeURIComponent('人口遷徙');
  const hrefs = await page.locator('.request a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.some((h) => h.includes('github.com') && h.includes(`need=${encoded}`))).toBe(true);
  expect(hrefs.some((h) => h.startsWith('mailto:') && h.includes(encoded))).toBe(true);
  for (const host of ['data.gov.tw', 'data.depositar.io', 'datasetsearch.research.google.com', 'zenodo.org']) {
    expect(hrefs.some((h) => h.includes(host) && h.includes(encoded)), host).toBe(true);
  }
  expect(hrefs.some((h) => h.includes('networks.skewed.de')), 'Netzschleuder only for Latin queries').toBe(false);
  expect(await page.locator('script[type="application/ld+json"]').evaluateAll((s) => s.map((x) => JSON.parse(x.textContent)['@type']))).not.toContain('Dataset');
});

test('an empty query links to the full tables with their counts and shows no error', async ({ page }) => {
  await page.goto('/search/?q=');
  await expect(page.locator('.empty-query')).toContainText('全部資料集');
  await expect(page.locator('.empty-query a[href="/datasets/"]')).toContainText(/\d+ 筆/);
  await expect(page.locator('.empty-query a[href="/courses/"]')).toContainText(/\d+ 門/);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test('a query of only filler words counts as empty (台灣 的 資料)', async ({ page }) => {
  await page.goto(q('台灣 的 資料'));
  await expect(page.locator('.empty-query')).toBeVisible();
});

test('a 500-character query is cut to 100 characters, and the page says so', async ({ page }) => {
  await page.goto(q('捷運'.repeat(250)));
  await expect(page.getByText('搜尋字詞超過 100 個字，只使用了前 100 個字。')).toBeVisible();
});

test('if the search data cannot load, the page says search is unavailable and links the tables', async ({ page }) => {
  await page.route('**/api/v1/catalog.json', (route) => route.abort());
  await page.goto(q('捷運'));
  const alert = page.locator('[role="alert"]');
  await expect(alert).toContainText('搜尋暫時無法使用');
  for (const href of ['/datasets/', '/courses/', '/wanted/']) await expect(alert.locator(`a[href="${href}"]`)).toHaveCount(1);
});

test('a hostile query is shown as text, runs nothing, and is URL-encoded in links', async ({ page }) => {
  let dialog = false;
  page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  const hostile = '<script>alert(1)</script>';
  await page.goto(q(hostile));
  await page.waitForLoadState('networkidle');
  expect(dialog).toBe(false);
  await expect(page.locator('main input[name="q"]')).toHaveValue(hostile);
  const html = await page.locator('main').innerHTML();
  expect(html).not.toContain('<script>alert(1)</script>');
  const hrefs = await page.locator('main a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const h of hrefs.filter((x) => x?.includes('alert'))) expect(h).not.toMatch(/[<>]/);
});

test('course mode: social network analysis finds courses, with term, instructor, level and language', async ({ page }) => {
  await page.goto(q('social network analysis', 'courses'));
  const first = page.locator('ol.results li').first();
  await expect(first.locator('h2 a')).toHaveAttribute('href', /^\/courses\//);
  await expect(first).toContainText('最近開課：');
  await expect(first).toContainText('教師：');
  await expect(first).toContainText('授課語言：');
  await expect(page.locator('main input[name="type"][value="courses"]')).toBeChecked();
});

test('the cross-type hint: 社會網絡分析 in data mode says how many courses match and links them', async ({ page }) => {
  await page.goto(q('社會網絡分析'));
  const status = page.locator('main [role="status"]');
  await expect(status).toContainText(/另有 \d+ 門課程符合/);
  await expect(status.locator('a')).toHaveAttribute('href', `/search/?q=${encodeURIComponent('社會網絡分析')}&type=courses`);
});

test('a computer-networking query shows the hint toward courses', async ({ page }) => {
  await page.goto(q('計算機網路'));
  await expect(page.locator('main .hint')).toContainText('改搜尋課程');
});

test('an empty course search links /courses/, a suggestion channel and 大學校院課程資源網', async ({ page }) => {
  await page.goto(q('CS224W', 'courses'));
  const empty = page.locator('.empty-state');
  await expect(empty).toContainText('本站目前還沒有與「CS224W」有關的課程。');
  await expect(empty.locator('a[href="/courses/"]')).toHaveCount(1);
  await expect(empty.locator('a[href="https://course-tvc.yuntech.edu.tw/WebU/index.aspx"]')).toHaveCount(1);
  await expect(empty.locator('a[href^="mailto:"]')).toHaveCount(1);
});

test('the page carries noindex, follow', async ({ page }) => {
  await page.goto(q('捷運'));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});

// Without JavaScript. Chromium under Playwright's javaScriptEnabled: false still
// parses <noscript> as text (script execution is disabled by emulation, not in
// the parser), so this reads the HTML a no-JS client or crawler receives.
test('without JavaScript: the HTML explains that results need JavaScript and lists the catalog', async ({ request }) => {
  const res = await request.get(q('捷運'));
  expect(res.status()).toBe(200);
  const html = await res.text();
  const noscript = html.match(/<main[\s\S]*?<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
  expect(noscript).toContain('搜尋結果需要啟用 JavaScript');
  for (const href of ['/datasets/', '/courses/', '/wanted/', '/api/v1/datasets.json']) expect(noscript).toContain(`href="${href}"`);
  expect(noscript).toContain('href="/datasets/golden-horse-2018-nominations/"');
  expect(html).toMatch(/<meta name="robots" content="noindex, follow">/);
});

// Task 6.4 — IME safety. Chromium's DevTools protocol drives a real composition
// (Input.imeSetComposition), the state a Zhuyin or Cangjie input method creates.
test('IME: Enter while composing does not submit; Enter after committing submits exactly once', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('main input[name="q"]');
  await input.click();
  const cdp = await page.context().newCDPSession(page);
  const searches = [];
  page.on('request', (r) => r.isNavigationRequest() && r.url().includes('/search/') && searches.push(r.url()));

  // Composing ㄐㄧㄣ, then the Enter that an IME uses to pick a candidate.
  await cdp.send('Input.imeSetComposition', { text: 'ㄐㄧㄣ', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await page.waitForTimeout(300);
  expect(searches).toEqual([]);
  await expect(page).toHaveURL(/\/$/);

  // The candidate 金 is committed; the composition ends.
  await cdp.send('Input.insertText', { text: '金' });
  await expect(input).toHaveValue('金');
  await page.waitForTimeout(100);
  expect(searches).toEqual([]);

  // Now Enter submits, once, with the committed text.
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/search\//);
  expect(searches.length).toBe(1);
  expect(new URL(searches[0]).searchParams.get('q')).toBe('金');
});

test('IME: a keydown reported as composing never submits, whatever the engine', async ({ page }) => {
  await page.goto('/datasets/');
  await page.waitForLoadState('networkidle');
  const prevented = await page.evaluate(() => {
    const input = document.querySelector('header input[name="q"]');
    input.value = '手田';
    const ev = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    const legacy = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true });
    input.dispatchEvent(legacy);
    return [ev.defaultPrevented, legacy.defaultPrevented];
  });
  expect(prevented).toEqual([true, true]);
});
