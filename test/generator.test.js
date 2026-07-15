import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSite } from '../lib/generator.js';
import { enrichLead } from '../lib/enrich.js';

const lead = {
  id: 'lead_test2',
  name: 'Luna Nails & Spa',
  category: 'beauty',
  address: '92 Harbor St, Milltown, OR 97401',
  city: 'Milltown',
  state: 'OR',
  phone: '(555) 203-5561',
  email: null,
  website: null,
  hasWebsite: false,
  openingHours: 'Mo-Sa 09:30-19:30',
  cuisine: null,
  lat: null, lon: null,
  extraTags: {},
};

async function makeSite(theme = 'elegant', l = lead) {
  const profile = await enrichLead(l);
  return generateSite(l, profile, theme);
}

test('generated site has exactly one h1 and core sections', async () => {
  const { html } = await makeSite();
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const id of ['about', 'services', 'faq', 'contact', 'hours']) {
    assert.ok(html.includes(`id="${id}"`), `missing section #${id}`);
  }
});

test('generated site embeds valid JSON-LD including FAQPage', async () => {
  const { html } = await makeSite();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.ok(scripts.length >= 3, 'expected 3 JSON-LD blocks');
  const parsed = scripts.map((m) => JSON.parse(m[1]));
  const types = parsed.map((p) => p['@type']);
  assert.ok(types.includes('BeautySalon'));
  assert.ok(types.includes('WebPage'));
  assert.ok(types.includes('FAQPage'));
});

test('generated site has SEO meta, viewport, and no external scripts/styles', async () => {
  const { html } = await makeSite();
  assert.ok(html.includes('<meta name="description"'));
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('og:title'));
  assert.ok(!/<script\s+src=/.test(html), 'no external scripts allowed');
  assert.ok(!/<link[^>]+stylesheet/.test(html), 'no external stylesheets allowed');
});

test('business data is HTML-escaped (XSS safety)', async () => {
  const evil = { ...lead, name: 'Evil <script>alert(1)</script> Shop' };
  const { html } = await makeSite('clean', evil);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('checklist, keywords, and faqs are returned for the dashboard', async () => {
  const { checklist, keywords, faqs, title, description } = await makeSite();
  assert.ok(checklist.length >= 10);
  assert.ok(checklist.every((c) => typeof c.ok === 'boolean'));
  assert.ok(keywords.some((k) => k.includes('Milltown')));
  assert.ok(faqs.length >= 4);
  assert.ok(title.includes('Luna Nails & Spa'));
  assert.ok(description.length > 40);
});

test('leads with no phone/email/address still generate a valid page', async () => {
  const bare = { ...lead, phone: null, email: null, address: null, openingHours: null, city: null, state: null };
  const { html } = await makeSite('warm', bare);
  assert.ok(html.includes('<h1'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('null,'));
});

test('JSON-LD and meta are identical across all four themes (parity)', async () => {
  const profile = await enrichLead(lead);
  const extract = (html) => {
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
    return JSON.stringify({ scripts, title, desc });
  };
  const outputs = ['warm', 'elegant', 'bold', 'clean'].map((t) => extract(generateSite(lead, profile, t).html));
  for (const out of outputs.slice(1)) assert.equal(out, outputs[0]);
});

test('two same-industry businesses get different copy (seeded variation)', async () => {
  const other = { ...lead, id: 'lead_test_zz', name: 'Velvet Room Beauty Bar' };
  const [a, b] = [await enrichLead(lead), await enrichLead(other)];
  const differs = a.tagline !== b.tagline
    || JSON.stringify(a.services.map((s) => s.name)) !== JSON.stringify(b.services.map((s) => s.name))
    || a.headings.valuesTitle !== b.headings.valuesTitle
    || a.headings.servicesIntro !== b.headings.servicesIntro;
  assert.ok(differs, 'same-industry profiles should not be clones');
  // And each service must have a real description, not a repeated pattern.
  for (const s of a.services) assert.ok(s.desc.length > 30);
  const descs = a.services.map((s) => s.desc);
  assert.equal(new Set(descs).size, descs.length, 'service descriptions must be distinct');
});

test('amenity chips from OSM extraTags are rendered', async () => {
  const tagged = { ...lead, extraTags: { wheelchair: 'yes', outdoor_seating: 'yes', 'payment:cards': 'yes' } };
  const profile = await enrichLead(tagged);
  const { html } = generateSite(tagged, profile, 'elegant');
  assert.ok(html.includes('Wheelchair accessible'));
  assert.ok(html.includes('Outdoor seating'));
});
