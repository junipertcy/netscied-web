// Term arithmetic and text joining used by the build (tasks 3.5, 5.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshness, termLabel, termLongLabel, termOfDate } from '../../scripts/catalog/lib/terms.mjs';
import { firstSentence, joinLines, toCsv } from '../../scripts/catalog/lib/text.mjs';

test('the current term follows the 學年度 calendar', () => {
  assert.equal(termOfDate('2026-11-04'), '115-1');
  assert.equal(termOfDate('2027-01-31'), '115-1');
  assert.equal(termOfDate('2027-02-01'), '115-2');
  assert.equal(termOfDate('2026-07-31'), '114-2');
  assert.equal(termOfDate('2026-08-01'), '115-1');
});

test('terms display with their Gregorian season', () => {
  assert.equal(termLabel('115-1'), '115-1（2026 秋）');
  assert.equal(termLabel('114-2'), '114-2（2026 春）');
  assert.equal(termLongLabel('114-S'), '114 學年度暑期（2026 夏）');
});

test('freshness: current, recent within four regular terms, dormant after, historical', () => {
  assert.equal(freshness('115-1', '115-1'), 'current');
  assert.equal(freshness('114-2', '115-1'), 'recent');
  assert.equal(freshness('113-1', '115-1'), 'recent');
  assert.equal(freshness('112-2', '115-1'), 'dormant');
  assert.equal(freshness('114-S', '115-1'), 'recent');
  assert.equal(freshness('113-S', '115-1'), 'recent');
  assert.equal(freshness('106-2', '115-1', { historical: true }), 'historical');
});

test('summer terms do not count toward the four', () => {
  // 113-1 → 115-1 is four regular terms (113-2, 114-1, 114-2, 115-1), whatever summers lie between.
  assert.equal(freshness('113-1', '115-1'), 'recent');
  assert.equal(freshness('112-S', '115-1'), 'dormant');
});

test('CJK line breaks join without spaces; Latin ones with a space; blank lines stay paragraphs', () => {
  assert.equal(joinLines('臺北捷運\n各站資料'), '臺北捷運各站資料');
  assert.equal(joinLines('the MRT\nstations'), 'the MRT stations');
  assert.equal(joinLines('包含 GML\n檔案'), '包含 GML 檔案');
  assert.equal(joinLines('第一段。\n\n第二段。'), '第一段。\n\n第二段。');
  assert.equal(joinLines('「連線頻寬登錄查詢系統」，\n提供'), '「連線頻寬登錄查詢系統」，提供');
});

test('one-line summaries end at the first sentence', () => {
  assert.equal(firstSentence('第一句。第二句。'), '第一句。');
  assert.equal(firstSentence('First one. Second.'), 'First one.');
});

test('CSV quotes fields with commas, quotes or line breaks', () => {
  assert.equal(toCsv(['a', 'b'], [{ a: 'x,y', b: 'say "hi"' }]), 'a,b\n"x,y","say ""hi"""\n');
});
