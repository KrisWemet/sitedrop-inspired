import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReviewFunnel } from '../lib/review-funnel.js';

const lead = {
  id: 'lead_rf', name: 'Shear Bliss Salon', category: 'beauty',
  city: 'Milltown', state: 'OR', address: '1 Cedar Ave, Milltown, OR',
  phone: '(555) 203-5561', email: 'hello@shearbliss.co',
};

test('funnel offers BOTH public and private paths openly (no review gating)', () => {
  const withGoogle = { ...lead, cta: { googleReviewUrl: 'https://g.page/r/abc/review' } };
  const html = renderReviewFunnel(withGoogle, {});
  assert.ok(html.includes('https://g.page/r/abc/review'), 'public Google review link present');
  assert.ok(html.includes('mailto:hello@shearbliss.co'), 'private feedback link present');
  assert.ok(html.includes('Leave a public review'));
  assert.ok(/for everyone/i.test(html), 'both options offered to everyone (anti-gating copy)');
  // No JS at all (stays no-JS, so nothing can conditionally hide the public path).
  assert.ok(!/<script/.test(html), 'no script — the paths cannot be gated by rating');
  assert.ok(html.includes('noindex'));
});

test('without a Google link, falls back to a Maps search and says so', () => {
  const html = renderReviewFunnel(lead, {});
  assert.ok(html.includes('https://www.google.com/maps/search/'));
  assert.ok(html.includes(encodeURIComponent('Shear Bliss Salon 1 Cedar Ave, Milltown, OR')));
  assert.ok(/opens our Google listing/i.test(html));
});

test('private path prefers a form endpoint, then email, then phone', () => {
  const withForm = { ...lead, cta: { formEndpoint: 'https://formspree.io/f/x' } };
  assert.ok(renderReviewFunnel(withForm, {}).includes('https://formspree.io/f/x'));
  const phoneOnly = { ...lead, email: null };
  assert.ok(renderReviewFunnel(phoneOnly, {}).includes('tel:5552035561'));
  const none = { ...lead, email: null, phone: null };
  assert.ok(!renderReviewFunnel(none, {}).includes('class="btn ghost"'), 'no private button when no channel exists');
});

test('business name is escaped (XSS)', () => {
  const evil = { ...lead, name: 'Bad <script>alert(1)</script> Co' };
  const html = renderReviewFunnel(evil, {});
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;'));
});
