import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaTypeFor, parseOpeningHours, keywordSet, buildFaqs, buildJsonLd, buildMetaTags, robotsTxt, llmsTxt } from '../lib/seo.js';

const lead = {
  id: 'lead_test1',
  name: 'Hartley Plumbing & Drain',
  category: 'plumber',
  address: '1420 Industrial Way, Milltown, OR 97402',
  city: 'Milltown',
  state: 'OR',
  phone: '(555) 204-2200',
  email: 'dispatch@hartleyplumbing.example.com',
  openingHours: 'Mo-Fr 07:00-17:00',
  lat: 44.05, lon: -123.09,
  cuisine: null,
};

const profile = {
  industry: 'trades',
  theme: 'bold',
  tagline: 'Done right the first time.',
  about: 'Hartley Plumbing & Drain is a locally owned plumber proudly serving Milltown, OR.',
  services: ['Free estimates', 'Repairs & maintenance', 'New installations', 'Emergency call-outs'],
  values: [['Licensed & insured', 'Fully certified.']],
  heroCta: 'Get a Free Quote',
  hoursHuman: ['Monday – Friday: 7 AM – 5 PM'],
};

test('schemaTypeFor maps categories to LocalBusiness subtypes', () => {
  assert.equal(schemaTypeFor('plumber'), 'Plumber');
  assert.equal(schemaTypeFor('hairdresser'), 'HairSalon');
  assert.equal(schemaTypeFor('car repair'), 'AutoRepair');
  assert.equal(schemaTypeFor('unknown thing'), 'LocalBusiness');
});

test('parseOpeningHours handles ranges and multiple parts', () => {
  const specs = parseOpeningHours('Mo-Fr 07:00-17:00; Sa 09:00-14:00');
  assert.equal(specs.length, 2);
  assert.deepEqual(specs[0].dayOfWeek, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.equal(specs[0].opens, '07:00');
  assert.equal(specs[0].closes, '17:00');
  assert.deepEqual(specs[1].dayOfWeek, ['Saturday']);
});

test('parseOpeningHours handles wrap-around and garbage safely', () => {
  assert.deepEqual(parseOpeningHours(null), []);
  assert.deepEqual(parseOpeningHours('sunrise-sunset'), []);
  const weekend = parseOpeningHours('Sa-Su 10:00-16:00');
  assert.deepEqual(weekend[0].dayOfWeek, ['Saturday', 'Sunday']);
});

test('keywordSet includes local search phrases', () => {
  const kws = keywordSet(lead, profile);
  assert.ok(kws.includes('plumber in Milltown, OR'));
  assert.ok(kws.includes('plumber near me'));
});

test('buildJsonLd emits LocalBusiness subtype, hours, geo, and FAQPage', () => {
  const faqs = buildFaqs(lead, profile);
  const blocks = buildJsonLd(lead, profile, faqs);
  const business = blocks[0];
  assert.equal(business['@type'], 'Plumber');
  assert.equal(business.telephone, lead.phone);
  assert.equal(business.geo.latitude, lead.lat);
  assert.ok(business.openingHoursSpecification.length > 0);
  const faqPage = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faqPage);
  assert.ok(faqPage.mainEntity.length >= 4);
  assert.ok(faqPage.mainEntity[0].acceptedAnswer.text.length > 10);
});

test('buildMetaTags produces bounded title/description with geo tags', () => {
  const kws = keywordSet(lead, profile);
  const meta = buildMetaTags(lead, profile, kws);
  assert.ok(meta.title.includes('Plumber in Milltown, OR'));
  assert.ok(meta.description.length <= 160);
  assert.ok(meta.html.includes('geo.position'));
  assert.ok(meta.html.includes('og:title'));
});

test('robotsTxt welcomes AI crawlers', () => {
  const txt = robotsTxt();
  assert.ok(txt.includes('GPTBot'));
  assert.ok(txt.includes('ClaudeBot'));
  assert.ok(txt.includes('PerplexityBot'));
});

test('llmsTxt contains key business facts', () => {
  const txt = llmsTxt(lead, profile, buildFaqs(lead, profile));
  assert.ok(txt.startsWith('# Hartley Plumbing & Drain'));
  assert.ok(txt.includes('(555) 204-2200'));
  assert.ok(txt.includes('## Frequently asked questions'));
});
