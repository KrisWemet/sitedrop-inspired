import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir (set before the store/images modules load).
process.env.SITESPARK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sitespark-img-'));
const { attachClientImage, selectImages, imageDataUri } = await import('../lib/images.js');
const { generateSite } = await import('../lib/generator.js');
const { enrichLead } = await import('../lib/enrich.js');

// 1x1 PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const lead = {
  id: 'lead_imgtest', name: 'Baker & Rye', category: 'bakery', city: 'Milltown', state: 'OR',
  address: '203 Main St, Milltown, OR', phone: '(555) 202-7748', email: null, website: null,
  hasWebsite: false, openingHours: 'Tu-Sa 07:00-14:00', cuisine: null, lat: null, lon: null,
  extraTags: {}, images: [],
};

test('attachClientImage validates type and stores bytes', () => {
  const image = attachClientImage(lead, { filename: 'oven.png', contentType: 'image/png', dataBase64: PNG_B64 });
  assert.equal(image.source, 'client');
  assert.equal(image.previewOnly, false);
  assert.ok(image.alt.includes('Baker & Rye'));
  assert.ok(imageDataUri(image).startsWith('data:image/png;base64,'));
  lead.images.push(image);

  assert.throws(() => attachClientImage(lead, { filename: 'x.gif', contentType: 'image/gif', dataBase64: PNG_B64 }), /Unsupported/);
  assert.throws(() => attachClientImage(lead, { filename: 'x.png', contentType: 'image/png', dataBase64: '' }), /Empty/);
});

test('selectImages: live mode strips Places photos, preview keeps them', () => {
  // Fake a Places storefront by attaching then marking preview-only.
  const storefront = attachClientImage(lead, { filename: 'front.png', contentType: 'image/png', dataBase64: PNG_B64 });
  storefront.source = 'places';
  storefront.previewOnly = true;
  storefront.credit = 'Photo from the business’s Google listing (preview only)';
  lead.images.push(storefront);

  const preview = selectImages(lead, 'preview');
  const live = selectImages(lead, 'live');
  assert.equal(preview.hero.source, 'client', 'client photos always lead');
  assert.ok([preview.hero, ...preview.gallery].some((i) => i.source === 'places'), 'preview may show the storefront');
  assert.ok(![live.hero, ...live.gallery].filter(Boolean).some((i) => i.source === 'places'), 'live output must never include Places photos');
  assert.equal(live.excludedForLive, 1);
});

test('generated preview embeds photos as data URIs; live mode ships files and no Places bytes', async () => {
  const profile = await enrichLead(lead);

  const preview = generateSite(lead, profile, 'warm', { mode: 'preview', imageMode: 'embed' });
  assert.ok(preview.html.includes('data:image/png;base64,'), 'preview embeds images inline');
  assert.ok(preview.html.includes('preview only'), 'Places photo is labeled in preview');
  assert.equal(preview.imageFiles.length, 0);

  const live = generateSite(lead, profile, 'warm', { mode: 'live', imageMode: 'files' });
  assert.ok(!live.html.includes('data:image/png'), 'live mode references files, not data URIs');
  assert.ok(live.html.includes('images/'), 'live mode uses relative image paths');
  assert.equal(live.imageFiles.length, 1, 'only the client photo ships');
  assert.ok(live.imageFiles[0].name.startsWith('images/'));
  assert.ok(Buffer.isBuffer(live.imageFiles[0].data));
  assert.ok(!live.html.includes('preview only'), 'no preview-only caption in live output');
});

// ---- keyless stock via Openverse (mocked network) ----
const { stockCandidates, attachStockImage } = await import('../lib/images.js');

function stubFetch(responder) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => responder(String(url), opts);
  return () => { globalThis.fetch = original; };
}

const jsonResponse = (body) => ({
  ok: true, status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(0),
});
const bytesResponse = (buf, type) => ({
  ok: true, status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
});

test('stockCandidates falls back to Openverse CC0 with no Pexels key', async () => {
  delete process.env.PEXELS_API_KEY;
  const calls = [];
  const restore = stubFetch((url) => {
    calls.push(url);
    assert.ok(url.startsWith('https://api.openverse.org/v1/images/'), 'keyless search goes to Openverse');
    assert.ok(url.includes('license=cc0'), 'restricted to public-domain dedication');
    return jsonResponse({ results: [
      { id: 'abc-123', url: 'https://img.example.net/oven.jpg', thumbnail: 'https://img.example.net/oven_t.jpg', creator: 'A. Baker', license: 'cc0' },
    ] });
  });
  try {
    const candidates = await stockCandidates(lead, 'bakery');
    assert.ok(calls.length >= 1);
    assert.equal(candidates[0].provider, 'openverse');
    assert.equal(candidates[0].candidateId, 'openverse_abc-123');
    assert.equal(candidates[0].license, 'CC0 (public domain)');
    assert.equal(candidates[0].full, 'https://img.example.net/oven.jpg');
  } finally { restore(); }
});

test('attachStockImage stores an Openverse photo as live-legal with CC0 credit', async () => {
  const png = Buffer.from(PNG_B64, 'base64');
  const restore = stubFetch(() => bytesResponse(png, 'image/png'));
  try {
    const image = await attachStockImage(lead, {
      candidateId: 'openverse_x', provider: 'openverse', full: 'https://img.example.net/x.png',
      photographer: 'A. Baker', query: 'artisan bread sourdough crust',
    });
    assert.equal(image.source, 'openverse');
    assert.equal(image.previewOnly, false, 'CC0 photos are allowed on live sites');
    assert.ok(image.credit.includes('CC0'));
    const live = selectImages({ ...lead, images: [image] }, 'live');
    assert.equal(live.hero.source, 'openverse', 'live mode keeps the CC0 photo');
  } finally { restore(); }
});

test('attachStockImage rejects non-photo content types', async () => {
  const restore = stubFetch(() => bytesResponse(Buffer.from('<html>not a photo</html>'), 'text/html'));
  try {
    await assert.rejects(
      () => attachStockImage(lead, { provider: 'openverse', full: 'https://img.example.net/page', query: 'x' }),
      /Unsupported image type/);
  } finally { restore(); }
});

test('Pexels is preferred when its key is set, and its failure falls back to Openverse', async () => {
  process.env.PEXELS_API_KEY = 'test-key';
  try {
    let restore = stubFetch((url) => {
      if (url.startsWith('https://api.pexels.com/')) {
        return jsonResponse({ photos: [{ id: 9, src: { medium: 'https://p.example.net/m.jpg', large: 'https://p.example.net/l.jpg' }, photographer: 'P. Shooter' }] });
      }
      throw new Error('unexpected host ' + url);
    });
    try {
      const picks = await stockCandidates(lead, 'bakery');
      assert.equal(picks[0].provider, 'pexels');
    } finally { restore(); }

    restore = stubFetch((url) => {
      if (url.startsWith('https://api.pexels.com/')) return { ok: false, status: 429, headers: { get: () => null } };
      return jsonResponse({ results: [{ id: 'fb-1', url: 'https://img.example.net/fb.jpg', creator: null, license: 'cc0' }] });
    });
    try {
      const picks = await stockCandidates(lead, 'bakery');
      assert.equal(picks[0].provider, 'openverse', 'Pexels outage degrades to Openverse, not to no photos');
    } finally { restore(); }
  } finally { delete process.env.PEXELS_API_KEY; }
});

// ---- AI-generated photography (mocked network) ----
const { generateAiImages, attachAiBytes, imageProviders } = await import('../lib/images.js');

test('generateAiImages produces live-legal ai-source photos with an honest credit', async () => {
  const png = Buffer.from(PNG_B64, 'base64');
  const urls = [];
  const restore = stubFetch((url) => {
    urls.push(url);
    assert.ok(url.startsWith('https://image.pollinations.ai/prompt/'), 'generation goes to Pollinations');
    assert.ok(url.includes('model=flux') && url.includes('nologo=true'));
    return bytesResponse(png, 'image/png');
  });
  try {
    const aiLead = { ...lead, id: 'lead_aitest', images: [] };
    const images = await generateAiImages(aiLead, 'salon');
    assert.equal(images.length, 2, 'hero + detail shot');
    assert.ok(images.every((i) => i.source === 'ai' && i.previewOnly === false));
    assert.ok(images[0].credit.includes('AI-generated'), 'credit says plainly the photo is generated');
    assert.ok(decodeURIComponent(urls[0]).includes('no people'), 'prompts exclude people');
    const live = selectImages({ ...aiLead, images }, 'live');
    assert.equal(live.hero.source, 'ai', 'AI photos are allowed on live sites');
  } finally { restore(); }
});

test('attachAiBytes validates content type and ai ranks above openverse, below client', () => {
  assert.throws(() => attachAiBytes(lead, Buffer.from('nope'), 'text/html', { alt: 'x' }), /Unsupported image type/);
  assert.equal(imageProviders().ai, true, 'AI generation is keyless');
  const png = Buffer.from(PNG_B64, 'base64');
  const mixLead = { ...lead, id: 'lead_aimix', images: [] };
  const ai = attachAiBytes(mixLead, png, 'image/png', { alt: 'AI shot' });
  const cc0 = { ...ai, id: 'img_cc0', source: 'openverse' };
  const client = { ...ai, id: 'img_cli', source: 'client' };
  const picked = selectImages({ ...mixLead, images: [cc0, ai, client] }, 'live');
  assert.equal(picked.hero.source, 'client', 'real client photos always lead');
  assert.equal(picked.gallery[0].source, 'ai', 'bespoke AI outranks generic CC0 stock');
});

// The committed prompt library drives the GitHub Actions generation workflow;
// the in-app generator uses AI_PROMPTS directly. They must never drift.
test('assets/ai-photo-prompts.json stays in sync with AI_PROMPTS', async () => {
  const { AI_PROMPTS } = await import('../lib/images.js');
  const url = new URL('../assets/ai-photo-prompts.json', import.meta.url);
  const library = JSON.parse(fs.readFileSync(url, 'utf8'));
  const byKey = Object.fromEntries(library.map((e) => [e.key, e]));
  const expected = Object.entries(AI_PROMPTS).flatMap(([industry, prompts]) =>
    prompts.map((p, i) => [`${industry}_${i === 0 ? 'hero' : 'detail'}`, p]));
  assert.equal(library.length, expected.length, 'one library entry per AI prompt');
  for (const [key, p] of expected) {
    assert.ok(byKey[key], `library missing ${key}`);
    assert.equal(byKey[key].prompt, p.prompt, `${key}: prompt drifted from AI_PROMPTS`);
    assert.equal(byKey[key].alt, p.alt, `${key}: alt drifted from AI_PROMPTS`);
    assert.ok(Number.isInteger(byKey[key].seed), `${key}: seed must be a stable integer`);
  }
});

test('sites without images generate exactly as before', async () => {
  const bare = { ...lead, id: 'lead_noimg', images: [] };
  const profile = await enrichLead(bare);
  const { html, imageFiles, hasImages } = generateSite(bare, profile, 'clean');
  assert.equal(hasImages, false);
  assert.equal(imageFiles.length, 0);
  assert.ok(!html.includes('<img'), 'no img tags without real bytes (broken-image rule)');
});
