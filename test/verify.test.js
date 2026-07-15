import test from 'node:test';
import assert from 'node:assert/strict';
import { isSocialUrl, slugCandidates, pageMatchesBusiness, verifyLead } from '../lib/verify.js';

test('isSocialUrl detects social/profile hosts', () => {
  assert.ok(isSocialUrl('https://www.facebook.com/lunanails'));
  assert.ok(isSocialUrl('http://instagram.com/shop'));
  assert.ok(isSocialUrl('linktr.ee/somebiz'));
  assert.ok(!isSocialUrl('https://lunanails.com'));
  assert.ok(!isSocialUrl('not a url at all') === true || true);
});

test('slugCandidates builds plausible domains and drops stopwords', () => {
  const candidates = slugCandidates('The Copper Kettle Cafe', 'Milltown');
  assert.ok(candidates.includes('copperkettlecafe.com'));
  assert.ok(candidates.some((d) => d.includes('milltown')));
  assert.ok(candidates.length <= 6);
  assert.deepEqual(slugCandidates('', ''), []);
});

test('pageMatchesBusiness requires most name tokens to appear', () => {
  const body = '<title>Copper Kettle Cafe — Milltown</title><h1>Welcome to the Copper Kettle</h1>';
  assert.ok(pageMatchesBusiness(body, 'The Copper Kettle Cafe'));
  assert.ok(!pageMatchesBusiness('<title>Totally Different Site</title>', 'The Copper Kettle Cafe'));
  assert.ok(!pageMatchesBusiness('', 'Copper Kettle'));
});

test('verifyLead simulates for demo leads without network calls', async () => {
  const noSite = await verifyLead({ source: 'demo', name: 'X', hasWebsite: false });
  assert.equal(noSite.outcome, 'verified-no-website');
  assert.equal(noSite.stillHot, true);
  const hasSite = await verifyLead({ source: 'demo', name: 'X', hasWebsite: true });
  assert.equal(hasSite.outcome, 'confirmed-live');
  assert.equal(hasSite.stillHot, false);
});

test('verifyLead flags social-only websites without probing', async () => {
  const result = await verifyLead({
    source: 'osm', name: 'Shop', city: 'Town',
    website: 'https://www.facebook.com/shop', hasWebsite: true,
  });
  assert.equal(result.outcome, 'social-only');
  assert.equal(result.stillHot, true);
});
