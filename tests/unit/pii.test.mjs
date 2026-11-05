// Researcher-registry spec: no public file holds an email address or a Taiwanese
// phone number other than the site's own. Review of Milestone A, finding 7:
// the forms people use to dodge scrapers must be caught too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPii } from '../../scripts/catalog/lib/pii.mjs';

const kinds = (s) => findPii(s).map((h) => h.kind);

test('plain and obfuscated email addresses are found', () => {
  for (const s of ['someone@example.org', 'someone＠example.org', 'someone [at] example.org', 'someone (at) example dot org', 'someone [at] example [dot] edu [dot] tw', 'someone&#64;example.org']) {
    assert.deepEqual(kinds(s), ['email'], s);
  }
});

test('the old placeholder contact address is no longer allowed', () => {
  assert.deepEqual(findPii('寄信到 hi@netscied.tw').map((h) => h.kind), ['email']);
});

test('the site contact address and the maintainer address it publishes are allowed', () => {
  assert.deepEqual(findPii('寄信到 tcy@inferweave.com'), []);
  assert.deepEqual(findPii('Email: tzuchi.yen [at] colorado.edu'), []);
});

test('Taiwanese phone numbers are found in every common written form', () => {
  for (const s of ['0912-345-678', '0912345678', '0912 345 678', '0912.345.678', '０９１２－３４５－６７８', '+886 912 345 678', '(02) 2345-6789', '02-2345-6789', '+886-2-2345-6789', '06-275-7575', '037-381000', '089-517-000', '(037) 381000']) {
    assert.deepEqual(kinds(s), ['phone'], s);
  }
});

test('dates, versions, counts and course codes are not phone numbers', () => {
  for (const s of ['2026-11-04', '1.0.0', '12,568', '115-1', '11510COM 530500', 'ISBN 978-3-319-77237-0', 'MGIM30032', '0.2', '163×163', '2001-2026']) {
    assert.deepEqual(kinds(s), [], s);
  }
});
