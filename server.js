// sitedrop-inspired — zero-dependency Node server.
// Serves the dashboard, the JSON API, and generated prospect websites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './lib/store.js';
import { searchBusinesses, scoreLead } from './lib/osm.js';
import { demoLeads } from './lib/demo-data.js';
import { enrichLead } from './lib/enrich.js';
import { generateSite, newSiteId, THEME_KEYS } from './lib/generator.js';
import { verifyLead } from './lib/verify.js';
import { buildOutreach } from './lib/outreach.js';
import { llmsTxt, robotsTxt, sitemapXml } from './lib/seo.js';
import { buildZip } from './lib/zip.js';
import { publishSite, isPublishConfigured } from './lib/publish.js';

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

  const { html, faqs, keywords, checklist, title, description } = generateSite(lead, enrichment, themeKey);
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
    title,
    description,
    keywords,
    seoChecklist: checklist,
    llms: llmsTxt(lead, enrichment, faqs),
    generatedAt: new Date().toISOString(),
  };
  db.addSite(site);
  db.updateLead(lead.id, { enrichment, siteId });

  json(res, 200, { site });
}

async function handleVerify(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const verification = await verifyLead(lead);
  // Re-read after the (multi-second) network verify so the patch is computed
  // against current state, not a stale snapshot.
  const fresh = db.getLead(leadId) || lead;
  const patch = { verification };
  if (verification.outcome === 'possible-site-found' && verification.foundUrl) {
    patch.hasWebsite = true;
    patch.website = verification.foundUrl;
    patch.score = scoreLead({ ...fresh, hasWebsite: true });
  } else if (['dead-site', 'social-only'].includes(verification.outcome) && fresh.hasWebsite) {
    patch.hasWebsite = false;
    patch.score = scoreLead({ ...fresh, hasWebsite: false });
  }
  const updated = db.updateLead(leadId, patch);
  json(res, 200, { lead: updated });
}

const LEAD_STATUSES = ['new', 'contacted', 'pitched', 'won', 'lost'];

async function handleLeadPatch(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const body = await readBody(req);
  const patch = {};
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status)) {
      return json(res, 400, { error: `status must be one of: ${LEAD_STATUSES.join(', ')}` });
    }
    patch.status = body.status;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 5000) || null;
  json(res, 200, { lead: db.updateLead(leadId, patch) });
}

async function handleOutreach(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const enrichment = lead.enrichment || await enrichLead(lead);

  // The pitch needs a preview link, so make sure a site exists.
  let siteId = lead.siteId;
  if (!siteId) {
    siteId = newSiteId();
    const { html, faqs, keywords, checklist, title, description } = generateSite(lead, enrichment, enrichment.theme);
    db.saveSiteHtml(siteId, html);
    db.addSite({
      id: siteId, leadId: lead.id, businessName: lead.name, category: lead.category,
      city: [lead.city, lead.state].filter(Boolean).join(', ') || null,
      theme: enrichment.theme, bytes: Buffer.byteLength(html), title, description,
      keywords, seoChecklist: checklist, llms: llmsTxt(lead, enrichment, faqs),
      generatedAt: new Date().toISOString(),
    });
  }

  // A published site gives the pitch a real URL; otherwise use the local preview.
  const published = db.getSite(siteId)?.published;
  const host = req.headers.host || `localhost:${PORT}`;
  const previewUrl = published
    ? published.url
    : `http://${host}/sites/${siteId}.html  (replace with your hosted URL before sending)`;
  const outreach = await buildOutreach(lead, enrichment, previewUrl);
  const updated = db.updateLead(leadId, { enrichment, siteId, outreach });
  json(res, 200, { lead: updated });
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

function handleCsv(res) {
  const cols = ['name', 'category', 'phone', 'email', 'address', 'city', 'state',
    'website', 'hasWebsite', 'score', 'status', 'verification', 'siteId', 'notes'];
  const rows = [...db.leads].sort((a, b) => b.score - a.score).map((l) => cols.map((c) => {
    if (c === 'verification') return csvEscape(l.verification?.outcome || '');
    return csvEscape(l[c]);
  }).join(','));
  const csv = [cols.join(','), ...rows].join('\r\n') + '\r\n';
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="sitespark-leads.csv"',
  });
  res.end(csv);
}

async function handlePublish(res, siteId) {
  const site = db.getSite(siteId);
  const html = db.readSiteHtml(siteId);
  if (!site || !html) return json(res, 404, { error: 'Site not found' });
  if (!isPublishConfigured()) {
    return json(res, 400, {
      error: 'Publishing is not configured. Create a token at vercel.com/account/tokens, then restart with VERCEL_TOKEN=... npm start',
    });
  }
  const published = await publishSite(site, html);
  site.published = published;
  db.addSite(site);
  json(res, 200, { site });
}

function handlePackZip(res, siteId) {
  const html = db.readSiteHtml(siteId);
  const site = db.getSite(siteId);
  if (!html || !site) return json(res, 404, { error: 'Site not found' });
  const slug = (site.businessName || siteId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const zip = buildZip([
    { name: 'index.html', data: html },
    { name: 'robots.txt', data: robotsTxt() },
    { name: 'sitemap.xml', data: sitemapXml() },
    { name: 'llms.txt', data: site.llms || '' },
    { name: 'DEPLOY.md', data: `# Deploying ${site.businessName}\n\nUpload all four files to the root of any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, shared hosting).\n\n- index.html — the website (fully self-contained)\n- robots.txt — welcomes search engines AND AI crawlers\n- sitemap.xml — search engine sitemap\n- llms.txt — plain-language business brief for AI assistants\n\nAfter deploying, update sitemap.xml's <loc> and robots.txt's Sitemap line with the real domain.\n` },
  ]);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${slug || 'site'}-deploy-pack.zip"`,
    'Content-Length': zip.length,
  });
  res.end(zip);
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
    if ((m = p.match(/^\/api\/leads\/([\w-]+)$/)) && req.method === 'PATCH') return await handleLeadPatch(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/enrich$/)) && req.method === 'POST') return await handleEnrich(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/verify$/)) && req.method === 'POST') return await handleVerify(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/outreach$/)) && req.method === 'POST') return await handleOutreach(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/generate$/)) && req.method === 'POST') return await handleGenerate(req, res, m[1]);
    if (p === '/api/leads.csv' && req.method === 'GET') return handleCsv(res);

    if (p === '/api/sites' && req.method === 'GET') {
      const sites = [...db.sites].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      return json(res, 200, { sites, publishConfigured: isPublishConfigured() });
    }
    if ((m = p.match(/^\/api\/sites\/([\w-]+)\/publish$/)) && req.method === 'POST') return await handlePublish(res, m[1]);
    if ((m = p.match(/^\/api\/sites\/([\w-]+)$/)) && req.method === 'GET') {
      const site = db.getSite(m[1]);
      return site
        ? json(res, 200, { site, publishConfigured: isPublishConfigured() })
        : json(res, 404, { error: 'Site not found' });
    }
    if ((m = p.match(/^\/sites\/([\w-]+)\.html$/))) return handleSiteHtml(res, m[1], url.searchParams.has('download'));
    if ((m = p.match(/^\/sites\/([\w-]+)\/pack\.zip$/))) return handlePackZip(res, m[1]);

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
