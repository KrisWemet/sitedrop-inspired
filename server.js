// sitedrop-inspired — zero-dependency Node server.
// Serves the dashboard, the JSON API, and generated prospect websites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './lib/store.js';
import { searchBusinesses } from './lib/osm.js';
import { demoLeads } from './lib/demo-data.js';
import { enrichLead } from './lib/enrich.js';
import { generateSiteHtml, newSiteId, THEME_KEYS } from './lib/generator.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const resolved = path.resolve(PUBLIC_DIR, filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) return json(res, 404, { error: 'Not found' });
  fs.readFile(resolved, (err, buf) => {
    if (err) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- API handlers ----------

async function handleSearch(req, res) {
  const { query, location, radiusKm } = await readBody(req);
  if (!query || !String(query).trim()) return json(res, 400, { error: 'query is required (e.g. "plumber", "restaurant")' });

  const q = String(query).trim();
  const loc = String(location || '').trim();
  const radius = Math.min(Math.max(Number(radiusKm) || 5, 1), 25);

  let leads, geo = null, source = 'osm', notice = null;
  if (!loc || loc.toLowerCase() === 'demo') {
    leads = demoLeads(q);
    source = 'demo';
    notice = 'Showing bundled demo data (fictional businesses). Enter a real city for live results.';
  } else {
    try {
      ({ geo, leads } = await searchBusinesses(q, loc, radius));
      if (!leads.length) notice = 'Live search returned no named businesses for that query/area. Try a broader category or larger radius.';
    } catch (err) {
      leads = demoLeads(q);
      source = 'demo';
      notice = `Live OpenStreetMap search unavailable (${err.message}). Showing fictional demo data instead.`;
    }
  }

  db.upsertLeads(leads);
  db.addSearch({
    id: 'search_' + Date.now().toString(36),
    query: q, location: loc || 'demo', radiusKm: radius, source,
    resultCount: leads.length,
    noWebsiteCount: leads.filter((l) => !l.hasWebsite).length,
    at: new Date().toISOString(),
  });

  json(res, 200, {
    source, notice,
    location: geo ? { displayName: geo.displayName } : null,
    stats: {
      total: leads.length,
      noWebsite: leads.filter((l) => !l.hasWebsite).length,
      withPhone: leads.filter((l) => l.phone).length,
    },
    leads,
  });
}

async function handleEnrich(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const enrichment = await enrichLead(lead);
  const updated = db.updateLead(leadId, { enrichment });
  json(res, 200, { lead: updated });
}

async function handleGenerate(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const { theme } = await readBody(req);

  // Auto-enrich first if the profile hasn't been gathered yet.
  const enrichment = lead.enrichment || await enrichLead(lead);
  const themeKey = THEME_KEYS.includes(theme) ? theme : enrichment.theme;

  const html = generateSiteHtml(lead, enrichment, themeKey);
  const siteId = lead.siteId || newSiteId();
  db.saveSiteHtml(siteId, html);

  const site = {
    id: siteId,
    leadId: lead.id,
    businessName: lead.name,
    category: lead.category,
    city: [lead.city, lead.state].filter(Boolean).join(', ') || null,
    theme: themeKey,
    bytes: Buffer.byteLength(html),
    generatedAt: new Date().toISOString(),
  };
  db.addSite(site);
  db.updateLead(lead.id, { enrichment, siteId });

  json(res, 200, { site });
}

function handleSiteHtml(res, siteId, download) {
  const html = db.readSiteHtml(siteId);
  if (!html) return json(res, 404, { error: 'Site not found' });
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (download) {
    const site = db.getSite(siteId);
    const slug = (site?.businessName || siteId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    headers['Content-Disposition'] = `attachment; filename="${slug || 'website'}.html"`;
  }
  res.writeHead(200, headers);
  res.end(html);
}

// ---------- Router ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (p === '/api/search' && req.method === 'POST') return await handleSearch(req, res);
    if (p === '/api/leads' && req.method === 'GET') {
      const leads = [...db.leads].sort((a, b) => b.score - a.score);
      return json(res, 200, { leads, searches: db.searches });
    }

    let m;
    if ((m = p.match(/^\/api\/leads\/([\w-]+)$/)) && req.method === 'GET') {
      const lead = db.getLead(m[1]);
      return lead ? json(res, 200, { lead }) : json(res, 404, { error: 'Lead not found' });
    }
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/enrich$/)) && req.method === 'POST') return await handleEnrich(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/generate$/)) && req.method === 'POST') return await handleGenerate(req, res, m[1]);

    if (p === '/api/sites' && req.method === 'GET') {
      const sites = [...db.sites].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      return json(res, 200, { sites });
    }
    if ((m = p.match(/^\/sites\/([\w-]+)\.html$/))) return handleSiteHtml(res, m[1], url.searchParams.has('download'));

    // Static frontend.
    if (p === '/' || p === '/index.html') return serveStatic(res, 'index.html');
    if (p === '/app' || p.startsWith('/app/')) return serveStatic(res, 'app.html');
    return serveStatic(res, p.slice(1));
  } catch (err) {
    console.error(`[error] ${req.method} ${p}:`, err.message);
    json(res, err.message.includes('Invalid JSON') ? 400 : 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  sitedrop-inspired running → http://localhost:${PORT}`);
  console.log(`  Dashboard               → http://localhost:${PORT}/app`);
  console.log(`  AI copywriting          → ${process.env.ANTHROPIC_API_KEY ? 'ON (Claude)' : 'off (set ANTHROPIC_API_KEY to enable)'}\n`);
});
