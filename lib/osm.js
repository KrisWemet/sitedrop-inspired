// Lead discovery via OpenStreetMap: Nominatim geocodes the location, then
// Overpass pulls real businesses in the area. A business with no website/
// contact:website tag is our hot "no website" prospect.
import crypto from 'node:crypto';

const UA = 'sitedrop-inspired/1.0 (lead-finder demo; https://github.com/kriswemet/sitedrop-inspired)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Maps a human search term to OSM selectors. Each entry is [key, value].
const CATEGORY_MAP = {
  restaurant: [['amenity', 'restaurant']],
  cafe: [['amenity', 'cafe']],
  coffee: [['amenity', 'cafe']],
  bar: [['amenity', 'bar'], ['amenity', 'pub']],
  pub: [['amenity', 'pub']],
  bakery: [['shop', 'bakery']],
  pizza: [['cuisine', 'pizza']],
  'hair salon': [['shop', 'hairdresser']],
  hairdresser: [['shop', 'hairdresser']],
  barber: [['shop', 'hairdresser']],
  'beauty salon': [['shop', 'beauty']],
  nails: [['shop', 'beauty']],
  spa: [['shop', 'beauty'], ['leisure', 'spa']],
  tattoo: [['shop', 'tattoo']],
  plumber: [['craft', 'plumber']],
  electrician: [['craft', 'electrician']],
  carpenter: [['craft', 'carpenter']],
  roofer: [['craft', 'roofer']],
  painter: [['craft', 'painter']],
  hvac: [['craft', 'hvac']],
  landscaping: [['craft', 'gardener'], ['shop', 'garden_centre']],
  'auto repair': [['shop', 'car_repair']],
  mechanic: [['shop', 'car_repair']],
  'car wash': [['amenity', 'car_wash']],
  dentist: [['amenity', 'dentist']],
  doctor: [['amenity', 'doctors']],
  chiropractor: [['healthcare', 'chiropractor']],
  veterinarian: [['amenity', 'veterinary']],
  vet: [['amenity', 'veterinary']],
  pharmacy: [['amenity', 'pharmacy']],
  gym: [['leisure', 'fitness_centre']],
  fitness: [['leisure', 'fitness_centre']],
  yoga: [['leisure', 'fitness_centre'], ['sport', 'yoga']],
  florist: [['shop', 'florist']],
  butcher: [['shop', 'butcher']],
  grocery: [['shop', 'convenience'], ['shop', 'supermarket']],
  bookstore: [['shop', 'books']],
  clothing: [['shop', 'clothes']],
  boutique: [['shop', 'clothes'], ['shop', 'boutique']],
  jeweler: [['shop', 'jewelry']],
  furniture: [['shop', 'furniture']],
  hardware: [['shop', 'hardware'], ['shop', 'doityourself']],
  laundry: [['shop', 'laundry'], ['shop', 'dry_cleaning']],
  cleaning: [['shop', 'laundry'], ['craft', 'cleaning']],
  photographer: [['craft', 'photographer'], ['shop', 'photo']],
  lawyer: [['office', 'lawyer']],
  accountant: [['office', 'accountant']],
  'real estate': [['office', 'estate_agent']],
  insurance: [['office', 'insurance']],
  daycare: [['amenity', 'childcare'], ['amenity', 'kindergarten']],
  'pet grooming': [['shop', 'pet_grooming'], ['shop', 'pet']],
  'pet store': [['shop', 'pet']],
  hotel: [['tourism', 'hotel'], ['tourism', 'guest_house']],
  locksmith: [['craft', 'locksmith'], ['shop', 'locksmith']],
  optician: [['shop', 'optician']],
  'ice cream': [['amenity', 'ice_cream']],
  'food truck': [['amenity', 'fast_food']],
  'fast food': [['amenity', 'fast_food']],
};

function selectorsFor(query) {
  const q = query.trim().toLowerCase();
  if (CATEGORY_MAP[q]) return { selectors: CATEGORY_MAP[q], nameFilter: null };
  // Partial keyword match ("italian restaurant" -> restaurant).
  for (const [term, sel] of Object.entries(CATEGORY_MAP)) {
    if (q.includes(term)) return { selectors: sel, nameFilter: null };
  }
  // Unknown category: search across all business-ish tags, filtered by name.
  return {
    selectors: [['shop'], ['amenity'], ['craft'], ['office'], ['tourism'], ['leisure']],
    nameFilter: q,
  };
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function geocode(location) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=1`;
  const results = await fetchJson(url, {}, 15000);
  if (!results.length) throw new Error(`Could not find location "${location}"`);
  const hit = results[0];
  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    displayName: hit.display_name,
    city: hit.address?.city || hit.address?.town || hit.address?.village || hit.name,
    state: hit.address?.state,
  };
}

function buildOverpassQuery({ lat, lon }, radiusKm, selectors, nameFilter) {
  const around = `(around:${Math.round(radiusKm * 1000)},${lat},${lon})`;
  const clauses = selectors
    .map(([key, value]) => {
      const tag = value ? `["${key}"="${value}"]` : `["${key}"]`;
      const name = nameFilter ? `["name"~"${nameFilter.replace(/[^\w\s-]/g, '')}",i]` : '["name"]';
      return `  nwr${tag}${name}${around};`;
    })
    .join('\n');
  return `[out:json][timeout:40];\n(\n${clauses}\n);\nout tags center 120;`;
}

function composeAddress(tags) {
  const parts = [];
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  if (street) parts.push(street);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:state']) parts.push(tags['addr:state']);
  if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
  return parts.join(', ') || null;
}

function categoryOf(tags) {
  const raw =
    tags.craft || tags.shop || tags.amenity || tags.healthcare ||
    tags.office || tags.tourism || tags.leisure || 'business';
  return raw.replace(/_/g, ' ');
}

export function elementToLead(el, meta = {}) {
  const tags = el.tags || {};
  if (!tags.name) return null;
  const website = tags.website || tags['contact:website'] || tags.url || null;
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  const id = 'lead_' + crypto.createHash('sha1')
    .update(`${el.type}/${el.id}`).digest('hex').slice(0, 12);

  const lead = {
    id,
    source: meta.source || 'osm',
    osmRef: `${el.type}/${el.id}`,
    name: tags.name,
    category: categoryOf(tags),
    address: composeAddress(tags),
    city: tags['addr:city'] || meta.city || null,
    state: tags['addr:state'] || meta.state || null,
    phone: tags.phone || tags['contact:phone'] || null,
    email: tags.email || tags['contact:email'] || null,
    website,
    hasWebsite: Boolean(website),
    openingHours: tags.opening_hours || null,
    cuisine: tags.cuisine ? tags.cuisine.replace(/[;_]/g, ' ') : null,
    lat,
    lon,
    extraTags: Object.fromEntries(
      Object.entries(tags).filter(([k]) =>
        ['wheelchair', 'outdoor_seating', 'takeaway', 'delivery', 'payment:cards',
         'air_conditioning', 'internet_access', 'smoking', 'brand'].includes(k))
    ),
    foundAt: new Date().toISOString(),
    enrichment: null,
    siteId: null,
    status: 'new',
    notes: null,
    verification: null,
    outreach: null,
  };
  lead.score = scoreLead(lead);
  return lead;
}

// Hotness score: no website is the whole game; contactability makes it actionable.
export function scoreLead(lead) {
  let score = 0;
  if (!lead.hasWebsite) score += 50;
  if (lead.phone) score += 20;
  if (lead.email) score += 15;
  if (lead.address) score += 10;
  if (lead.openingHours) score += 5;
  return score;
}

export async function searchBusinesses(query, location, radiusKm = 5) {
  const geo = await geocode(location);
  const { selectors, nameFilter } = selectorsFor(query);
  const overpassQuery = buildOverpassQuery(geo, radiusKm, selectors, nameFilter);

  let data = null;
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      data = await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(overpassQuery),
      }, 45000);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!data) throw lastError || new Error('All Overpass endpoints failed');

  const seen = new Set();
  const leads = [];
  for (const el of data.elements || []) {
    const lead = elementToLead(el, { city: geo.city, state: geo.state });
    if (!lead) continue;
    const dedupeKey = lead.name.toLowerCase() + '|' + (lead.address || '');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    leads.push(lead);
  }
  leads.sort((a, b) => b.score - a.score);
  return { geo, leads };
}
