import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, runCampaign, buildDigest } from '../lib/autopilot.js';
import { mailerStatus, sendMail } from '../lib/mailer.js';
import { db } from '../lib/store.js';

const fakeGeocode = async () => ({ lat: 44.0, lon: -123.0, city: 'Testville', state: 'OR', displayName: 'Testville, OR' });

test('createCampaign geocodes once and enforces guardrails', async () => {
  const campaign = await createCampaign(
    { query: 'plumber', location: 'Testville, OR', intervalHours: 1 }, fakeGeocode);
  assert.equal(campaign.geo.city, 'Testville');
  assert.equal(campaign.intervalHours, 6, 'interval must be clamped to the 6h minimum');
  assert.ok(campaign.enabled);
  db.deleteCampaign(campaign.id);

  await assert.rejects(
    () => createCampaign({ query: 'plumber', location: 'demo' }, fakeGeocode),
    /demo/i, 'campaigns must refuse the demo location');
  await assert.rejects(
    () => createCampaign({ query: '', location: 'x' }, fakeGeocode), /required/);
});

test('runCampaign works a stubbed lead end-to-end without demo fallback', async () => {
  const campaign = await createCampaign(
    { query: 'bakery', location: 'Testville, OR' }, fakeGeocode);

  const stubLead = {
    id: 'lead_apilot01', source: 'osm', osmRef: 'node/1', name: 'Test Autopilot Bakery',
    category: 'bakery', address: '1 Main St, Testville, OR', city: 'Testville', state: 'OR',
    phone: '(555) 000-1111', email: null, website: null, hasWebsite: false,
    openingHours: 'Mo-Fr 07:00-14:00', cuisine: null, lat: 44, lon: -123, extraTags: {},
    foundAt: new Date().toISOString(), enrichment: null, siteId: null,
    status: 'new', notes: null, verification: null, outreach: null, score: 85,
  };
  const searchFn = async () => ({ leads: [stubLead] });
  const verifyFn = async () => ({
    verifiedAt: new Date().toISOString(), checked: [], outcome: 'verified-no-website',
    stillHot: true, detail: 'stub', foundUrl: null,
  });

  const result = await runCampaign(campaign, { log: true, searchFn, verifyFn });
  assert.equal(result.error, null);
  assert.equal(result.found, 1);
  assert.equal(result.generated, 1);
  assert.equal(result.drafted, 1);

  const lead = db.getLead('lead_apilot01');
  assert.ok(lead.siteId, 'site must be generated');
  assert.ok(lead.outreach?.subject, 'outreach must be drafted');
  assert.equal(lead.verification.outcome, 'verified-no-website');

  // A failing search must be a failed run — never a demo substitution.
  const failing = await runCampaign(campaign, {
    log: false, verifyFn,
    searchFn: async () => { throw new Error('Overpass 429'); },
  });
  assert.equal(failing.error, 'Overpass 429');
  assert.equal(failing.found, 0);
  assert.ok(!db.leads.some((l) => l.source === 'demo'), 'no demo leads may enter via autopilot');

  db.deleteCampaign(campaign.id);
});

test('digest lists drafted pitches and pipeline counts', () => {
  const digest = buildDigest();
  assert.ok(digest.subject.includes('pitches ready'));
  assert.ok(digest.text.includes('Pipeline:'));
  assert.ok(digest.text.includes('Test Autopilot Bakery'), 'freshly drafted lead should appear');
});

test('mailer is dry-run without configuration and never throws on digest path', async () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.OUTREACH_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.OUTREACH_FROM;
  assert.equal(mailerStatus().configured, false);
  const sent = await sendMail({ to: 'op@example.com', subject: 'x', text: 'y' });
  assert.equal(sent.dryRun, true);
  if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
  if (prevFrom !== undefined) process.env.OUTREACH_FROM = prevFrom;
});
