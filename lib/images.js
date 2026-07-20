// Image pipeline. Four sources with different rules:
//
//   pexels    — licensed stock (Pexels license: free commercial use, no
//               attribution required). Allowed in previews AND live sites.
//               Needs PEXELS_API_KEY.
//   openverse — CC0/public-domain stock via the Openverse API. No key
//               needed, so stock photos work out of the box; restricted to
//               license=cc0 so live use needs no attribution (we keep the
//               creator credit anyway). Allowed in previews AND live sites.
//   places    — the business's real storefront photo from Google Places.
//               PREVIEW ONLY: Places photos are user-contributed and Google's
//               terms restrict reuse outside Places-powered apps, so they are
//               stripped from every deploy pack and publish automatically.
//   client    — photos the owner supplies at onboarding. The live-site source
//               of truth.
//
// Sources with reuse terms we can't verify (Pinterest boards, Google Images,
// social scrapes) are deliberately NOT sources: pins are third-party
// copyrighted photos with no reuse license, and a paid client site is the
// worst possible place to ship one.
//
// Bytes are cached under data/images/<leadId>/. Sites embed images as data
// URIs in preview mode and as relative files in live mode — either way the
// site makes zero external requests, and an <img> only renders when its
// bytes exist on disk (impeccable's broken-image rule).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

const IMAGES_DIR = path.join(DATA_DIR, 'images');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function imageProviders() {
  return {
    pexels: Boolean(process.env.PEXELS_API_KEY),
    openverse: true, // keyless — the Openverse API needs no credentials
    places: Boolean(process.env.GOOGLE_PLACES_API_KEY),
  };
}

// Curated per-industry queries — "bakery bread oven warm light" finds a
// usable photo; "bakery" finds birthday clip art.
const STOCK_QUERIES = {
  restaurant: ['restaurant interior candlelight table', 'chef plating dish kitchen', 'pasta dish rustic table'],
  cafe: ['coffee shop counter espresso machine', 'latte art wooden table', 'cafe interior morning light'],
  bakery: ['artisan bread sourdough crust', 'bakery pastry display case', 'baker hands kneading dough'],
  salon: ['hair salon stylist working', 'salon interior chairs mirrors', 'barber cutting hair close up'],
  trades: ['plumber working pipes tools', 'electrician panel work', 'contractor tool belt work site'],
  auto: ['mechanic under car garage', 'auto repair shop lift', 'engine repair hands tools'],
  health: ['modern clinic reception calm', 'dentist office chair clean', 'medical professional patient care'],
  fitness: ['gym barbell chalk training', 'fitness class group workout', 'weights rack gym interior'],
  professional: ['modern office meeting handshake', 'desk documents pen professional', 'office interior natural light'],
  retail: ['boutique shop interior shelves', 'shopkeeper small business counter', 'store display products warm'],
  hospitality: ['cozy hotel room bed linen', 'bed and breakfast exterior morning', 'hotel lobby warm welcome'],
  generic: ['small business storefront street', 'local shop owner counter', 'main street small town shops'],
};

function leadImageDir(leadId) {
  const dir = path.join(IMAGES_DIR, leadId.replace(/[^\w-]/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function fetchBytes(url, headers = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
    const type = res.headers.get('content-type')?.split(';')[0] || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error('Image too large');
    return { buf, type };
  } finally {
    clearTimeout(timer);
  }
}

function saveImage(leadId, source, buf, type, meta = {}) {
  const ext = ALLOWED_TYPES[type] || 'jpg';
  const id = 'img_' + crypto.randomBytes(5).toString('hex');
  const file = path.join(leadImageDir(leadId), `${id}.${ext}`);
  fs.writeFileSync(file, buf);
  return {
    id,
    source,
    file: path.relative(DATA_DIR, file),
    type: type || 'image/jpeg',
    bytes: buf.length,
    previewOnly: source === 'places',
    addedAt: new Date().toISOString(),
    ...meta,
  };
}

export function readImageBytes(image) {
  try {
    const full = path.join(DATA_DIR, image.file);
    if (!full.startsWith(IMAGES_DIR)) return null;
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

export function imageDataUri(image) {
  const buf = readImageBytes(image);
  return buf ? `data:${image.type};base64,${buf.toString('base64')}` : null;
}

export function deleteImage(lead, imageId) {
  const image = (lead.images || []).find((i) => i.id === imageId);
  if (!image) return false;
  try { fs.unlinkSync(path.join(DATA_DIR, image.file)); } catch { /* already gone */ }
  return true;
}

// ---- Stock photos: Pexels (key) with Openverse CC0 (keyless) fallback ----

async function pexelsCandidates(industry, perQuery) {
  const key = process.env.PEXELS_API_KEY;
  const queries = STOCK_QUERIES[industry] || STOCK_QUERIES.generic;
  const candidates = [];
  for (const query of queries.slice(0, 2)) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perQuery}&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`Pexels error (HTTP ${res.status})`);
    const data = await res.json();
    for (const photo of data.photos || []) {
      candidates.push({
        candidateId: `pexels_${photo.id}`,
        provider: 'pexels',
        license: 'Pexels license',
        thumb: photo.src.medium,          // shown in the dashboard picker only
        full: photo.src.large2x || photo.src.large,
        photographer: photo.photographer,
        query,
      });
    }
  }
  return candidates;
}

// license=cc0 only: public-domain dedication, so a paid client site can use
// the photo with no attribution obligation (we keep the creator credit
// anyway). Unauthenticated Openverse allows a modest rate — fine for a
// picker; register a key with them if you ever need volume.
async function openverseCandidates(industry, perQuery) {
  const queries = STOCK_QUERIES[industry] || STOCK_QUERIES.generic;
  const candidates = [];
  for (const query of queries.slice(0, 2)) {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=cc0&aspect_ratio=wide&per_page=${perQuery}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SiteSpark/1.0' } });
    if (!res.ok) throw new Error(`Openverse error (HTTP ${res.status})`);
    const data = await res.json();
    for (const img of data.results || []) {
      if (!img.url) continue;
      candidates.push({
        candidateId: `openverse_${img.id}`,
        provider: 'openverse',
        license: 'CC0 (public domain)',
        thumb: img.thumbnail || img.url,
        full: img.url,
        photographer: img.creator || null,
        query,
      });
    }
  }
  return candidates;
}

export async function stockCandidates(lead, industry, { perQuery = 3 } = {}) {
  if (process.env.PEXELS_API_KEY) {
    try {
      const picks = await pexelsCandidates(industry, perQuery);
      if (picks.length) return picks;
    } catch (err) {
      console.error('[images] Pexels failed, falling back to Openverse:', err.message);
    }
  }
  return openverseCandidates(industry, perQuery);
}

export async function attachStockImage(lead, candidate) {
  const { buf, type } = await fetchBytes(candidate.full);
  // Openverse URLs don't guarantee a content-type up front — reject anything
  // that isn't a real photo format before it can reach a page.
  if (!ALLOWED_TYPES[type]) throw new Error(`Unsupported image type ${type || '(none)'} from source.`);
  const source = candidate.provider || 'pexels';
  const credit = source === 'openverse'
    ? (candidate.photographer ? `Photo: ${candidate.photographer} (CC0, via Openverse)` : 'Public-domain photo via Openverse')
    : (candidate.photographer ? `Photo: ${candidate.photographer} / Pexels` : 'Photo: Pexels');
  return saveImage(lead.id, source, buf, type, {
    alt: `${candidate.query} at ${lead.name}`.replace(/\s+/g, ' '),
    credit,
  });
}

// ---- Google Places (storefront, preview only) ----

export async function fetchStorefront(lead) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Set GOOGLE_PLACES_API_KEY to pull the storefront photo from Google Maps.');
  if (lead.source === 'demo') throw new Error('Demo leads are fictional; no real storefront exists.');

  const input = encodeURIComponent(`${lead.name} ${lead.address || lead.city || ''}`.trim());
  const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${input}&inputtype=textquery&fields=place_id,photos,name&key=${key}`;
  const found = await (await fetch(findUrl)).json();
  const photoRef = found?.candidates?.[0]?.photos?.[0]?.photo_reference;
  if (!photoRef) throw new Error('No photo found on the Google listing for this business.');

  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1400&photo_reference=${photoRef}&key=${key}`;
  const { buf, type } = await fetchBytes(photoUrl);
  return saveImage(lead.id, 'places', buf, type, {
    alt: `${lead.name} storefront`,
    credit: 'Photo from the business’s Google listing (preview only)',
  });
}

// ---- Client uploads (the live-site source) ----

export function attachClientImage(lead, { filename, contentType, dataBase64 }) {
  if (!ALLOWED_TYPES[contentType]) {
    throw new Error(`Unsupported image type ${contentType || '(none)'} — use JPEG, PNG, or WebP.`);
  }
  const buf = Buffer.from(String(dataBase64), 'base64');
  if (!buf.length) throw new Error('Empty image upload.');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('Image too large (8MB max). Resize and retry.');
  const cleanName = String(filename || 'photo').replace(/\.[a-z0-9]+$/i, '').slice(0, 60);
  return saveImage(lead.id, 'client', buf, contentType, {
    alt: `${cleanName} at ${lead.name}`.replace(/\s+/g, ' '),
  });
}

// ---- selection for rendering ----

// Preview shows the richest set (client first, then storefront, then stock).
// Live output must never include Places photos.
export function selectImages(lead, mode = 'preview') {
  const all = (lead.images || []).filter((i) => readImageBytes(i));
  const usable = mode === 'live' ? all.filter((i) => !i.previewOnly) : all;
  const bySource = (s) => usable.filter((i) => i.source === s);
  const ordered = [...bySource('client'), ...bySource('places'), ...bySource('pexels'), ...bySource('openverse')];
  return {
    hero: ordered[0] || null,                 // strongest photo leads
    gallery: ordered.slice(1, 4),
    excludedForLive: mode === 'live' ? all.filter((i) => i.previewOnly).length : 0,
  };
}
