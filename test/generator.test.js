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

test('reviews render a testimonials section + honest Review/AggregateRating schema, and are absent otherwise', async () => {
  const reviews = [
    { author: 'Dana R.', rating: 5, text: 'Best cut in years — they actually listened.', source: 'Google' },
    { author: 'Priya S.', rating: 4, text: 'Lovely space and great color work.', source: null },
  ];
  const withRev = { ...lead, reviews };
  const { html } = generateSite(withRev, await enrichLead(withRev), 'elegant');
  assert.ok(html.includes('id="reviews"'), 'testimonials section renders');
  assert.ok(html.includes('Best cut in years'), 'review text present');
  assert.ok((html.match(/class="star /g) || []).length >= 10, 'star icons render (2 reviews + average)');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const biz = blocks.find((b) => b.aggregateRating);
  assert.ok(biz, 'AggregateRating present in JSON-LD');
  assert.equal(biz.aggregateRating.reviewCount, 2);
  assert.equal(biz.aggregateRating.ratingValue, '4.5');
  assert.ok(Array.isArray(biz.review) && biz.review.length === 2, 'Review array matches entries');
  assert.equal(biz.review[0]['@type'], 'Review');

  // No reviews → no section, no rating markup (never fabricated).
  const plain = generateSite(lead, await enrichLead(lead), 'elegant').html;
  assert.ok(!plain.includes('id="reviews"'), 'no testimonials section without reviews');
  assert.ok(!plain.includes('AggregateRating'), 'no rating schema without reviews');
});

test('conversion architecture: hook, promises, big CTA, how-it-works, sticky mobile bar', async () => {
  const profile = await enrichLead(lead);
  const { html } = generateSite(lead, profile, 'elegant');
  // The hook is a distinct conversion line, and template slots never leak.
  assert.notEqual(profile.hook, profile.tagline, 'hook is not just the mood tagline');
  assert.ok(!/\{city\}|\{cat\}/.test(profile.hook), 'no unsubstituted placeholders');
  assert.ok(html.includes("<p class=\"promise\">"), "concrete promises above the fold");
  assert.equal(profile.promise.length, 3);
  assert.ok(html.includes('<a class="btn btn-lg"'), 'outcome-framed primary CTA');
  assert.ok(html.includes('id="how"'), 'how-it-works removes post-click anxiety');
  assert.ok(html.includes('<div class="sticky-cta"'), 'mobile thumb-zone CTA');
  // Sticky bar and steps must not break the no-JS invariant.
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), 'still zero executable JS');
});

test('trust signals render ONLY from real data — nothing is invented', async () => {
  // A bare lead (no reviews, no proof, no amenities) must claim nothing.
  const bare = { ...lead, extraTags: {} };
  const bareHtml = generateSite(bare, await enrichLead(bare), 'bold').html;
  assert.ok(!bareHtml.includes('<ul class="trust-bar">'), 'no trust bar without real signals');
  assert.ok(!bareHtml.includes('<p class="cta-micro">'), 'no guarantee microcopy without an entered guarantee');
  assert.ok(!/Licensed|insured|since 19|since 20/i.test(bareHtml.slice(bareHtml.indexOf('<body'))), 'no invented credentials');

  // With operator-entered proof + real reviews, each signal appears verbatim.
  const proven = {
    ...lead,
    proof: { since: '1998', responseTime: 'under an hour', guarantee: 'Free quotes, no obligation', credentials: 'Licensed & insured' },
    reviews: [{ author: 'D. R.', rating: 5, text: 'Same-day and no surprises on the bill.', source: 'Google' }],
  };
  const html = generateSite(proven, await enrichLead(proven), 'bold').html;
  assert.ok(html.includes('Serving Milltown, OR since 1998'));
  assert.ok(html.includes('Licensed &amp; insured'));
  assert.ok(html.includes('Replies in under an hour'));
  assert.ok(html.includes('Free quotes, no obligation'), 'risk reversal under the CTA');
  assert.ok(html.includes('cta-proof'), 'a real review sits at the decision point');
  assert.equal((html.match(/class="star on"/g) || []).length >= 5, true, 'trust-bar stars actually fill');
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
    // The h1 is the conversion hook (outcome + city), not the mood tagline —
    // the tagline drops to the supporting line beneath it.
    assert.equal(h1, profile.hook.replaceAll('&', '&amp;'), `${theme}: hook carries the h1`);
    assert.ok(html.includes(`<p class="lead">${profile.tagline.replaceAll('&', '&amp;')}</p>`), `${theme}: tagline supports`);
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

test('honest CTAs: a transactional label must actually start that transaction', async () => {
  const profile = await enrichLead(lead);
  const plain = generateSite(lead, profile, 'elegant').html;
  // The primary CTA may say "Book an Appointment" ONLY because it is a tel:
  // link that dials the business and shows the number on the button itself —
  // calling is how you book here. It must never be a link that dead-ends.
  const primary = plain.match(/<a class="btn btn-lg"[^>]*href="([^"]+)"[\s\S]*?<\/a>/);
  assert.ok(primary, 'primary CTA renders');
  assert.ok(primary[1].startsWith('tel:'), 'phone-only lead: the outcome CTA dials');
  assert.ok(primary[0].includes('(555) 203-5561'), 'the number is visible on the button, so the action is obvious');
  // The secondary CTA still must not promise an action the page cannot do.
  assert.ok(plain.includes('See Hours &amp; Location'), 'secondary CTA says where it actually goes');
  assert.ok(!/class="btn ghost"[^>]*>Book an Appointment/.test(plain), 'no dead-end booking promise');
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
