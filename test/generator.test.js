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

// Regression guards derived from pbakaus/impeccable's anti-pattern detectors.
test('impeccable guards: no eyebrow chips, no accent stripes, low em-dash count', async () => {
  const profile = await enrichLead(lead);
  for (const theme of ['warm', 'elegant', 'bold', 'clean']) {
    const { html } = generateSite(lead, profile, theme);
    assert.ok(!html.includes('class="eyebrow"'), `${theme}: uppercase eyebrow chips must not return`);
    assert.ok(!html.includes('class="kicker"'), `${theme}: hero kicker chip must not return`);
    assert.ok(!/border-(left|top|right|bottom):\s*\d+px solid var\(--accent\)/.test(html),
      `${theme}: side-tab accent borders must not return`);
    const body = html.slice(html.indexOf('<body'));
    const dashes = (body.match(/—/g) || []).length;
    assert.ok(dashes <= 3, `${theme}: em-dash overuse (${dashes} in body) is an AI cadence tell`);
  }
});

test('placeholder contact data (example.com) never ships in HTML or JSON-LD', async () => {
  const fake = { ...lead, email: 'dispatch@hartleyplumbing.example.com', website: 'http://foo.example.com', hasWebsite: true };
  const profile = await enrichLead(fake);
  const { html } = generateSite(fake, profile, 'bold');
  assert.ok(!html.includes('example.com'), 'no example.com anywhere in the output');
  assert.ok(!html.includes('mailto:dispatch@hartleyplumbing'), 'placeholder email is not linked');
  // A real email still renders.
  const real = { ...lead, email: 'hello@realbakery.co' };
  const { html: realHtml } = generateSite(real, await enrichLead(real), 'bold');
  assert.ok(realHtml.includes('hello@realbakery.co'));
});

test('no-JS contact form renders when a form endpoint is configured', async () => {
  const withForm = { ...lead, cta: { formEndpoint: 'https://formspree.io/f/abc123' } };
  const profile = await enrichLead(withForm);
  const { html } = generateSite(withForm, profile, 'bold');
  assert.ok(html.includes('<form class="lead-form" action="https://formspree.io/f/abc123" method="POST">'));
  assert.ok(html.includes('name="_gotcha"'), 'honeypot present');
  assert.ok(html.includes('name="message"'));
  // Still zero executable JS: JSON-LD data scripts are fine, but no src
  // scripts, no inline <script> code, and no on* event handlers.
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), 'no executable script tags');
  assert.ok(!/\son\w+=/.test(html), 'no inline event handlers');
});

test('booking link retargets the CTA to a real external booking URL', async () => {
  const withBooking = { ...lead, cta: { bookingUrl: 'https://calendly.com/shear-bliss' } };
  const profile = await enrichLead(withBooking);
  const { html } = generateSite(withBooking, profile, 'elegant');
  assert.ok(html.includes('href="https://calendly.com/shear-bliss"'));
  // With no booking/form, the hero CTA lands on #contact, never #services.
  const plain = generateSite(lead, await enrichLead(lead), 'elegant').html;
  assert.ok(plain.includes('class="btn ghost" href="#contact"'));
  assert.ok(!plain.includes('class="btn ghost" href="#services"'), 'CTA must not dead-scroll to services');
});
