// Task 2.2 — agent-access spec, "Crawl policy and sitemap"; owner decision Q4 (allow AI-training crawlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import robotsParser from 'robots-parser';
import { repoRoot } from '../helpers/dist.mjs';

const ROBOTS_URL = 'https://netscied.tw/robots.txt';
const robots = robotsParser(ROBOTS_URL, readFileSync(path.join(repoRoot, 'public', 'robots.txt'), 'utf8'));

// The crawlers the spec names: search indexing and user-triggered AI fetchers, plus Google-Extended.
const SEARCH_AND_USER_AGENTS = [
  'Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Applebot', 'DuckAssistBot', 'Amzn-SearchBot', 'Meta-WebIndexer',
  'Google-Extended',
];
// AI-training crawlers, allowed by owner decision Q4 (2026-11-04).
const TRAINING_AGENTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Applebot-Extended', 'meta-externalagent'];

for (const agent of [...SEARCH_AND_USER_AGENTS, ...TRAINING_AGENTS]) {
  test(`${agent} may crawl /datasets/ and /search/`, () => {
    assert.equal(robots.isAllowed('https://netscied.tw/datasets/', agent), true);
    // /search/ must stay crawlable so crawlers can read its noindex.
    assert.equal(robots.isAllowed('https://netscied.tw/search/?q=%E9%87%91%E9%A6%AC', agent), true);
  });
}

test('robots.txt points to the sitemap', () => {
  assert.deepEqual(robots.getSitemaps(), ['https://netscied.tw/sitemap.xml']);
});

test('robots.txt names the AI-training crawlers explicitly, so the policy is stated rather than implied', () => {
  for (const agent of TRAINING_AGENTS) {
    assert.notEqual(robots.getMatchingLineNumber('https://netscied.tw/', agent), -1, `${agent} has no matching rule`);
  }
  const text = readFileSync(path.join(repoRoot, 'public', 'robots.txt'), 'utf8');
  for (const agent of TRAINING_AGENTS) {
    assert.match(text, new RegExp(`^User-agent: ${agent}$`, 'm'), `no explicit group for ${agent}`);
  }
});
