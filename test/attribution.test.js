import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SITESPARK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sitespark-attr-'));
const { recordEvent, readEvents, monthlyRollup, estimateValue, newCaptureToken } = await import('../lib/attribution.js');
const { generateSite } = await import('../lib/generator.js');
const { enrichLead } = await import('../lib/enrich.js');

test('events append to a JSONL ledger and survive a truncated final line', () => {
  recordEvent('lead_a', 'form', { name: 'Dana', contact: 'dana@x.co' });
  recordEvent('lead_a', 'call', { from: '+15551110000' });
  recordEvent('lead_b', 'call', {});
  assert.equal(readEvents('lead_a').length, 2);
  assert.equal(readEvents('lead_b').length, 1);
  assert.equal(readEvents().length, 3);

  // Simulate a crash mid-append: the partial line must be skipped, not throw.
  const ledger = path.join(process.env.SITESPARK_DATA_DIR, 'leads.jsonl');
  fs.appendFileSync(ledger, '{"id":"ev_trunc","kind":"for');
  assert.equal(readEvents().length, 3, 'truncated line ignored, good lines intact');
});

test('unknown event kinds are refused', () => {
  assert.throws(() => recordEvent('lead_a', 'pageview'), /Unknown event kind/);
});

test('rollup counts real events and never fabricates a comparison', () => {
  const r = monthlyRollup('lead_a');
  assert.equal(r.calls, 1);
  assert.equal(r.forms, 1);
  assert.equal(r.total, 2);
  assert.equal(r.changePct, null, 'no prior month means no invented percentage');
  assert.equal(r.value, null, 'no economics entered means no money claim at all');
  assert.equal(r.recent.length, 2);
});

test('value is arithmetic on the client\'s own numbers, in whole dollars', () => {
  // No average job value → no estimate, ever.
  assert.equal(estimateValue(10, {}), null);
  assert.equal(estimateValue(0, { avgJobValue: 450 }), null);

  // Average only → pipeline, but booked stays null (we will not guess a close rate).
  const pipelineOnly = estimateValue(4, { avgJobValue: 450 });
  assert.equal(pipelineOnly.pipeline, 1800);
  assert.equal(pipelineOnly.booked, null, 'no close rate means no booked claim');

  // Average + close rate → booked, integer maths.
  const full = estimateValue(3, { avgJobValue: 450, closeRate: 40 });
  assert.equal(full.pipeline, 1350);
  assert.equal(full.booked, 540);
  assert.ok(Number.isInteger(full.booked), 'money is never a float');

  // Nonsense inputs are rejected rather than flattering.
  assert.equal(estimateValue(5, { avgJobValue: -100 }), null);
  assert.equal(estimateValue(5, { avgJobValue: 200, closeRate: 500 }).booked, null);
});

test('capture wiring: the form posts to the capture URL and the tracked number replaces the real one', async () => {
  const token = newCaptureToken();
  assert.ok(token.startsWith('cap_'));
  const lead = {
    id: 'lead_cap', name: 'Hartley Plumbing', category: 'plumber', city: 'Milltown', state: 'OR',
    address: '4 Depot Rd', phone: '(555) 111-2222', openingHours: 'Mo-Fr 08:00-17:00', extraTags: {},
    capture: { token, enabled: true, trackedNumber: '(555) 900-1234' },
  };
  const profile = await enrichLead(lead);
  const { html } = generateSite(lead, profile, 'bold', { baseUrl: 'https://studio.example.com' });
  assert.ok(html.includes(`action="https://studio.example.com/f/${token}"`), 'form posts to capture URL');
  assert.ok(html.includes('(555) 900-1234'), 'tracked number is shown');
  assert.ok(!html.includes('(555) 111-2222'), 'the real number never ships while tracking is on');
  // Still a native, JavaScript-free form.
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), 'capture adds no JS');
  assert.ok(html.includes('method="POST"'));
});

test('capture disabled falls back to the operator form endpoint and the real number', async () => {
  const lead = {
    id: 'lead_nocap', name: 'Hartley Plumbing', category: 'plumber', city: 'Milltown', state: 'OR',
    phone: '(555) 111-2222', extraTags: {},
    cta: { formEndpoint: 'https://formspree.io/f/abc' },
    capture: { token: 'cap_x', enabled: false, trackedNumber: '(555) 900-1234' },
  };
  const { html } = generateSite(lead, await enrichLead(lead), 'bold', { baseUrl: 'https://studio.example.com' });
  assert.ok(html.includes('action="https://formspree.io/f/abc"'));
  assert.ok(html.includes('(555) 111-2222'), 'real number when tracking is off');
  assert.ok(!html.includes('(555) 900-1234'));
});
