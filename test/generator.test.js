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

// Typography guards mirroring impeccable's `overused-font` and `single-font`
// detectors: every theme must lead its stacks with a non-generic, non-overused
// system face, and must pair two distinct families (display + body).
test('impeccable guards: no overused fonts and a real display+body pairing', async () => {
  // impeccable's curated OVERUSED_FONTS (the characterless / AI-default faces).
  const OVERUSED = new Set(['inter', 'roboto', 'open sans', 'lato', 'montserrat',
    'arial', 'helvetica', 'helvetica neue', 'fraunces', 'instrument sans',
    'instrument serif', 'geist', 'geist sans', 'geist mono', 'mona sans',
    'plus jakarta sans', 'space grotesk', 'recoleta']);
  // Generic tokens the detector ignores when deciding the "real" primary face.
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'inherit', 'initial',
    'unset', 'revert']);
  const primary = (stack) => stack.split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .find((f) => f && !GENERIC.has(f)) || '';
  const profile = await enrichLead(lead);
  for (const theme of ['warm', 'elegant', 'bold', 'clean']) {
    const { html } = generateSite(lead, profile, theme);
    const stacks = [...html.matchAll(/font-family:([^;}"]+)/g)]
      .map((m) => m[1]).filter((s) => !/inherit/.test(s));
    const primaries = new Set();
    for (const s of stacks) {
      const p = primary(s);
      if (!p) continue;
      assert.ok(!OVERUSED.has(p), `${theme}: overused font "${p}" (characterless AI-default tell)`);
      primaries.add(p);
    }
    assert.ok(primaries.size >= 2, `${theme}: needs a distinct display+body pairing, got [${[...primaries]}]`);
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

// Guards for the /impeccable critique P0-P2 fixes: content-adaptive layout
// for photo-less leads, hours folded into the contact band, honest CTAs.
test('no-photo leads get the compact hero: name as mark, tagline as h1, no motif', async () => {
  const profile = await enrichLead(lead);
  for (const theme of ['warm', 'elegant', 'bold', 'clean']) {
    const { html } = generateSite(lead, profile, theme);
    assert.ok(html.includes('hero-compact'), `${theme}: compact hero for photo-less leads`);
    assert.ok(html.includes(`<p class="brand-mark">${'Luna Nails &amp; Spa'}</p>`), `${theme}: name renders as the mark`);
    const h1 = html.match(/<h1>(.*?)<\/h1>/s)[1];
    assert.equal(h1, profile.tagline.replaceAll('&', '&amp;'), `${theme}: tagline carries the h1`);
    assert.ok(!/<section class="hero[^"]*"[^>]*>\s*<svg/.test(html), `${theme}: no faint motif in the compact hero`);
  }
});

test('hours fold into the contact band as a per-day strip with a Closed row', async () => {
  const profile = await enrichLead(lead); // Mo-Sa 09:30-19:30
  const { html } = generateSite(lead, profile, 'elegant');
  assert.ok(html.includes('class="hours-strip" id="hours"'), 'hours strip carries the #hours anchor');
  assert.ok(!html.includes('hours-table'), 'the standalone hours section is gone');
  assert.ok(html.includes('<b>Mon – Sat</b><span>9:30 AM – 7:30 PM</span>'), 'grouped day range renders');
  assert.ok(html.includes('<b>Sun</b><span>Closed</span>'), 'uncovered days get an explicit Closed row');
});

const CONTACT_PHONE_ICON = 'M22 16.9v3a2 2 0 0 1-2.2 2';

test('honest CTAs: transactional labels only when a booking or form exists', async () => {
  const profile = await enrichLead(lead);
  // No booking, no form: the beauty KB's "Book an Appointment" must not render.
  const plain = generateSite(lead, profile, 'elegant').html;
  assert.ok(!plain.includes('Book an Appointment'), 'no booking promise without a booking channel');
  assert.ok(plain.includes('See Hours &amp; Location'), 'secondary CTA says where it actually goes');
  // With a booking link the transactional label returns.
  const booked = generateSite({ ...lead, cta: { bookingUrl: 'https://calendly.com/luna' } }, profile, 'elegant').html;
  assert.ok(booked.includes('Book an Appointment'));
  // The contact band's call button doesn't repeat a phone row an inch above it.
  assert.ok(!plain.includes(CONTACT_PHONE_ICON), 'no phone list row when the button is the call action');
  assert.ok(booked.includes(CONTACT_PHONE_ICON), 'phone row returns when the button is the booking action');
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
