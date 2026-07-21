// sitedrop-inspired — zero-dependency Node server.
// Serves the dashboard, the JSON API, and generated prospect websites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './lib/store.js';
import { searchBusinesses, scoreLead, geocode } from './lib/osm.js';
import { createCampaign, runCampaign, startScheduler, autopilotStatus, sendDigest, buildDigest } from './lib/autopilot.js';
import { demoLeads } from './lib/demo-data.js';
import { enrichLead } from './lib/enrich.js';
import { generateSite, newSiteId, THEME_KEYS } from './lib/generator.js';
import { verifyLead } from './lib/verify.js';
import { buildOutreach } from './lib/outreach.js';
import { llmsTxt, robotsTxt, sitemapXml } from './lib/seo.js';
import { buildZip } from './lib/zip.js';
import { publishSite, isPublishConfigured } from './lib/publish.js';
import { imageProviders, stockCandidates, attachStockImage, fetchStorefront, attachClientImage, generateAiImages, attachBundledImages, deleteImage, readImageBytes } from './lib/images.js';
import { pricingConfig, buildClient, buildInvoiceRecord, advanceRetainer } from './lib/billing.js';
import { renderInvoiceHtml } from './lib/invoice.js';
import { renderProposalHtml } from './lib/proposal.js';
import { renderSeoReportHtml } from './lib/seo-report.js';
import { voiceConfigured, provisionVapi, renderVoiceConfigPack } from './lib/voice.js';
import crypto from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Zero-dependency .env loader: KEY=value lines from a local .env, so an
// operator can drop PEXELS_API_KEY / ANTHROPIC_API_KEY / VERCEL_TOKEN in one
// gitignored file instead of exporting them every run. Existing process.env
// always wins; the file is optional and never overwrites a real env var.
function loadDotenv() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env — fine, everything degrades gracefully */ }
}
loadDotenv();

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

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); }
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

  // Never ship an empty-looking site: if no photos are attached yet, drop in
  // the built-in industry set (instant, offline). The operator can replace
  // them with client uploads or fresh AI/stock photos afterward.
  let workingLead = lead;
  if (!(lead.images || []).length) {
    const bundled = attachBundledImages(lead, enrichment.industry);
    if (bundled.length) workingLead = db.updateLead(lead.id, { images: bundled }) || { ...lead, images: bundled };
  }

  const { html, faqs, keywords, checklist, title, description } = generateSite(workingLead, enrichment, themeKey);
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
  if (body.cta !== undefined) {
    // Conversion targets: booking link + hosted form endpoint. Store only
    // well-formed http(s) URLs; blanks clear the field.
    const httpUrl = (v) => (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null);
    patch.cta = {
      bookingUrl: httpUrl(body.cta.bookingUrl),
      formEndpoint: httpUrl(body.cta.formEndpoint),
      googleReviewUrl: httpUrl(body.cta.googleReviewUrl),
    };
  }
  if (body.reviews !== undefined) {
    // REAL customer reviews only, entered by the operator (copied from Google,
    // texts, emails — with the customer's OK). The app never invents one, and
    // the UI says so. Validated + capped so nothing unbounded reaches a page.
    if (!Array.isArray(body.reviews)) return json(res, 400, { error: 'reviews must be an array' });
    const cleaned = [];
    for (const r of body.reviews.slice(0, 12)) {
      const rating = Math.round(Number(r.rating));
      const author = String(r.author || '').trim().slice(0, 80);
      const text = String(r.text || '').trim().slice(0, 600);
      if (!author || !text || !(rating >= 1 && rating <= 5)) continue;
      cleaned.push({ author, rating, text, source: String(r.source || '').trim().slice(0, 40) || null });
    }
    patch.reviews = cleaned;
  }
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

  const outreach = await buildOutreach(lead, enrichment, previewUrlFor(siteId, req));
  const updated = db.updateLead(leadId, { enrichment, siteId, outreach });
  json(res, 200, { lead: updated });
}

// A published site gives a real URL; otherwise the local preview with a
// "replace before sending" caveat. Shared by outreach and proposals.
function previewUrlFor(siteId, req) {
  const published = db.getSite(siteId)?.published;
  if (published) return published.url;
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}/sites/${siteId}.html  (replace with your hosted URL before sending)`;
}

// Ensure the lead has a generated site; returns { siteId, enrichment }.
async function ensureSite(lead) {
  const enrichment = lead.enrichment || await enrichLead(lead);
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
    db.updateLead(lead.id, { enrichment, siteId });
  }
  return { siteId, enrichment };
}

// ---------- proposals & billing ----------
// Nothing here is ever emailed to a prospect — generate + return link only,
// exactly like outreach. Invoices are issuable only for a won client.

async function handleProposal(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const { siteId } = await ensureSite(lead);
  // Unguessable token so the private proposal URL is not enumerable.
  const token = lead.proposal?.token || 'prop_' + crypto.randomBytes(9).toString('hex');
  const proposal = { token, generatedAt: new Date().toISOString() };
  const updated = db.updateLead(leadId, { proposal, siteId });
  json(res, 200, { lead: updated, url: `/proposals/${token}.html` });
}

// One-click SEO/AEO care-plan report: mint (or reuse) the unguessable token
// and hand back the URL. The report itself renders live at serve time so it
// always reflects the current site state.
function handleSeoReport(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  if (!lead.siteId || !db.getSite(lead.siteId)) {
    return json(res, 400, { error: 'Generate the website first — the report reads its SEO/AEO state.' });
  }
  const token = lead.seoReport?.token || 'rpt_' + crypto.randomBytes(9).toString('hex');
  const updated = db.updateLead(leadId, { seoReport: { token, generatedAt: new Date().toISOString() } });
  json(res, 200, { lead: updated, url: `/reports/${token}.html` });
}

function serveSeoReport(res, token) {
  const lead = db.getLeadBySeoReportToken(token);
  if (!lead || !lead.siteId) return json(res, 404, { error: 'Report not found' });
  const site = db.getSite(lead.siteId);
  const html = renderSeoReportHtml(lead, site, { pricing: pricingConfig() });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Voice agent: mint a token for the (keyless) config pack, and — when
// VAPI_API_KEY is set — provision a live assistant in one call.
async function handleVoiceAgent(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const enrichment = lead.enrichment || await enrichLead(lead);
  const token = lead.voiceAgent?.token || 'voice_' + crypto.randomBytes(9).toString('hex');
  let provisioned = lead.voiceAgent?.provisioned || null;
  let note = 'Config pack ready. Set VAPI_API_KEY to provision a live agent in one click.';
  if (voiceConfigured() && lead.source !== 'demo') {
    try {
      provisioned = await provisionVapi(lead, enrichment);
      note = `Live Vapi assistant created. Attach a phone number in your Vapi dashboard to take calls.`;
    } catch (err) {
      note = `Config pack ready. Live provisioning failed: ${err.message}`;
    }
  }
  const voiceAgent = { token, generatedAt: new Date().toISOString(), provisioned };
  const updated = db.updateLead(leadId, { voiceAgent });
  json(res, 200, { lead: updated, url: `/voice/${token}.html`, provider: voiceConfigured() ? 'vapi' : 'config-pack', provisioned, note });
}

function serveVoicePack(res, token) {
  const lead = db.getLeadByVoiceToken(token);
  if (!lead) return json(res, 404, { error: 'Voice config not found' });
  const html = renderVoiceConfigPack(lead, lead.enrichment || {}, { agency: pricingConfig().agency });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveProposal(res, token) {
  const lead = db.getLeadByProposalToken(token);
  if (!lead || !lead.siteId) return json(res, 404, { error: 'Proposal not found' });
  const site = db.getSite(lead.siteId);
  const pricing = pricingConfig();
  const previewUrl = lead.siteId ? (db.getSite(lead.siteId)?.published?.url
    || `/sites/${lead.siteId}.html`) : '#';
  const html = renderProposalHtml(lead, lead.enrichment || {}, site, { previewUrl, pricing });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function handleClientCreate(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  if (lead.status !== 'won') {
    return json(res, 400, { error: 'Set the lead status to "won" before starting a care plan. (Only a business that has agreed should be billed.)' });
  }
  const existing = db.getClientByLead(leadId);
  if (existing) return json(res, 200, { client: existing, lead });
  const body = await readBody(req);
  const pricing = pricingConfig();
  const client = buildClient(lead, {
    setup: body.setup ?? pricing.setup,
    monthly: body.monthly ?? pricing.monthly,
    currency: body.currency ?? pricing.currency,
  });
  db.upsertClient(client);
  const updated = db.updateLead(leadId, { clientId: client.id });
  db.logActivity({ kind: 'client-created', leadId, detail: `${lead.name} → care plan (${client.currency} ${client.setup} setup, ${client.monthly}/mo)` });
  json(res, 200, { client, lead: updated });
}

async function handleInvoiceIssue(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const client = db.getClientByLead(leadId);
  if (!client) return json(res, 400, { error: 'Start the care plan first, then issue invoices.' });
  const body = await readBody(req);
  const kind = body.kind === 'retainer' ? 'retainer' : 'setup';
  const pricing = pricingConfig();

  const lineItems = kind === 'retainer'
    ? [{ description: `Website care plan — monthly (${client.businessName})`, quantity: 1, unit: client.monthly }]
    : [{ description: `Website design & launch — ${client.businessName}`, quantity: 1, unit: client.setup }];

  // Atomic issue: number assigned + record appended in one sync critical section.
  const record = db.issueInvoice((number) => buildInvoiceRecord(number, { client, kind, lineItems, pricing }));

  const patch = { invoiceNumbers: [...(client.invoiceNumbers || []), record.number] };
  if (kind === 'retainer') Object.assign(patch, advanceRetainer(client));
  db.upsertClient({ id: client.id, ...patch });
  db.logActivity({ kind: 'invoice-issued', leadId, detail: `Invoice #${record.number} (${kind}) for ${client.businessName} — ${record.currency} ${record.total}` });
  json(res, 200, { invoice: record, url: `/invoices/${record.token}.html` });
}

function serveInvoice(res, token) {
  const rec = db.getInvoiceByToken(token);
  if (!rec) return json(res, 404, { error: 'Invoice not found' });
  const html = renderInvoiceHtml(rec, db.getPayment(rec.number));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleInvoicePaid(res, number) {
  const n = Number(number);
  const rec = db.readInvoiceLedger().find((r) => r.number === n);
  if (!rec) return json(res, 404, { error: 'Invoice not found' });
  const payment = db.markInvoicePaid(n);
  db.logActivity({ kind: 'invoice-paid', leadId: rec.leadId, detail: `Invoice #${n} marked paid` });
  json(res, 200, { number: n, payment });
}

function leadBilling(leadId) {
  const client = db.getClientByLead(leadId);
  const invoices = client ? db.invoicesForClient(client.id).map((r) => ({
    number: r.number, token: r.token, kind: r.kind, total: r.total, currency: r.currency,
    issuedAt: r.issuedAt, paidAt: db.getPayment(r.number)?.paidAt || null,
  })) : [];
  return { client, invoices };
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

// Live output (publish + deploy pack) is regenerated in 'live' mode:
// client/stock images ship as real files; Places storefront photos are
// preview-only and never leave the dashboard.
async function buildLiveSite(site) {
  const lead = db.getLead(site.leadId);
  if (!lead) return null;
  const enrichment = lead.enrichment || await enrichLead(lead);
  return generateSite(lead, enrichment, site.theme, { mode: 'live', imageMode: 'files' });
}

async function handlePublish(res, siteId) {
  const site = db.getSite(siteId);
  if (!site) return json(res, 404, { error: 'Site not found' });
  if (!isPublishConfigured()) {
    return json(res, 400, {
      error: 'Publishing is not configured. Create a token at vercel.com/account/tokens, then restart with VERCEL_TOKEN=... npm start',
    });
  }
  const live = await buildLiveSite(site);
  if (!live) return json(res, 404, { error: 'Lead for this site no longer exists' });
  const published = await publishSite(site, live.html, live.imageFiles);
  site.published = published;
  db.addSite(site);
  json(res, 200, { site });
}

// ---------- images ----------

// In-memory candidate cache so "pick photo 3" doesn't refetch the search.
const candidateCache = new Map();

async function handleStockCandidates(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const enrichment = lead.enrichment || await enrichLead(lead);
  const candidates = await stockCandidates(lead, enrichment.industry);
  candidateCache.set(leadId, candidates);
  json(res, 200, { candidates: candidates.map(({ candidateId, thumb, photographer, query, provider, license }) => ({ candidateId, thumb, photographer, query, provider, license })) });
}

async function handleStockSelect(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const { candidateId } = await readBody(req);
  const candidate = (candidateCache.get(leadId) || []).find((c) => c.candidateId === candidateId);
  if (!candidate) return json(res, 400, { error: 'Candidate expired. Fetch stock photos again.' });
  const image = await attachStockImage(lead, candidate);
  const updated = db.updateLead(leadId, { images: [...(lead.images || []), image] });
  json(res, 200, { lead: updated });
}

async function handleStorefront(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const image = await fetchStorefront(lead);
  const updated = db.updateLead(leadId, { images: [...(lead.images || []), image] });
  json(res, 200, { lead: updated });
}

async function handleAiGenerate(res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const enrichment = lead.enrichment || await enrichLead(lead);
  const images = await generateAiImages(lead, enrichment.industry);
  const updated = db.updateLead(leadId, { images: [...(lead.images || []), ...images] });
  json(res, 200, { lead: updated });
}

async function handleImageUpload(req, res, leadId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  const body = await readBody(req, 12e6); // base64 of up to ~8MB image
  const image = attachClientImage(lead, body);
  const updated = db.updateLead(leadId, { images: [...(lead.images || []), image] });
  json(res, 200, { lead: updated });
}

function handleImageDelete(res, leadId, imageId) {
  const lead = db.getLead(leadId);
  if (!lead) return json(res, 404, { error: 'Lead not found' });
  if (!deleteImage(lead, imageId)) return json(res, 404, { error: 'Image not found' });
  const updated = db.updateLead(leadId, { images: (lead.images || []).filter((i) => i.id !== imageId) });
  json(res, 200, { lead: updated });
}

// ---------- autopilot ----------

async function handleCampaignCreate(req, res) {
  const body = await readBody(req);
  const campaign = await createCampaign(body, geocode);
  json(res, 200, { campaign });
}

async function handleCampaignPatch(req, res, id) {
  const campaign = db.getCampaign(id);
  if (!campaign) return json(res, 404, { error: 'Campaign not found' });
  const body = await readBody(req);
  const patch = { id };
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (body.intervalHours !== undefined) patch.intervalHours = Math.max(6, Number(body.intervalHours) || 24);
  json(res, 200, { campaign: db.upsertCampaign(patch) });
}

async function handleCampaignRun(res, id) {
  const campaign = db.getCampaign(id);
  if (!campaign) return json(res, 404, { error: 'Campaign not found' });
  const result = await runCampaign(campaign);
  json(res, 200, { result });
}

async function handlePackZip(res, siteId) {
  const site = db.getSite(siteId);
  if (!site) return json(res, 404, { error: 'Site not found' });
  const live = await buildLiveSite(site);
  if (!live) return json(res, 404, { error: 'Lead for this site no longer exists' });
  const slug = (site.businessName || siteId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const zip = buildZip([
    { name: 'index.html', data: live.html },
    ...live.imageFiles.map((f) => ({ name: f.name, data: f.data })),
    { name: 'robots.txt', data: robotsTxt() },
    { name: 'sitemap.xml', data: sitemapXml() },
    { name: 'llms.txt', data: site.llms || '' },
    { name: 'DEPLOY.md', data: `# Deploying ${site.businessName}\n\nUpload everything (keeping the images/ folder) to the root of any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, shared hosting).\n\n- index.html — the website\n- images/ — the site's photos (client and licensed stock only; Google preview photos never ship)\n- robots.txt — welcomes search engines AND AI crawlers\n- sitemap.xml — search engine sitemap\n- llms.txt — plain-language business brief for AI assistants\n\nAfter deploying, update sitemap.xml's <loc> and robots.txt's Sitemap line with the real domain.\n` },
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
      return lead
        ? json(res, 200, { lead, providers: imageProviders(), pricing: pricingConfig(), billing: leadBilling(lead.id) })
        : json(res, 404, { error: 'Lead not found' });
    }
    if ((m = p.match(/^\/api\/leads\/([\w-]+)$/)) && req.method === 'PATCH') return await handleLeadPatch(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/enrich$/)) && req.method === 'POST') return await handleEnrich(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/verify$/)) && req.method === 'POST') return await handleVerify(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/outreach$/)) && req.method === 'POST') return await handleOutreach(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/proposal$/)) && req.method === 'POST') return await handleProposal(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/seo-report$/)) && req.method === 'POST') return handleSeoReport(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/voice-agent$/)) && req.method === 'POST') return await handleVoiceAgent(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/client$/)) && req.method === 'POST') return await handleClientCreate(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/invoice$/)) && req.method === 'POST') return await handleInvoiceIssue(req, res, m[1]);
    if ((m = p.match(/^\/api\/invoices\/(\d+)\/paid$/)) && req.method === 'POST') return handleInvoicePaid(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/generate$/)) && req.method === 'POST') return await handleGenerate(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/stock$/)) && req.method === 'GET') return await handleStockCandidates(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/stock$/)) && req.method === 'POST') return await handleStockSelect(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/storefront$/)) && req.method === 'POST') return await handleStorefront(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/ai$/)) && req.method === 'POST') return await handleAiGenerate(res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images$/)) && req.method === 'POST') return await handleImageUpload(req, res, m[1]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/([\w-]+)$/)) && req.method === 'DELETE') return handleImageDelete(res, m[1], m[2]);
    if ((m = p.match(/^\/api\/leads\/([\w-]+)\/images\/([\w-]+)\/raw$/)) && req.method === 'GET') {
      const lead = db.getLead(m[1]);
      const image = lead?.images?.find((i) => i.id === m[2]);
      const bytes = image && readImageBytes(image);
      if (!bytes) return json(res, 404, { error: 'Image not found' });
      res.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'max-age=3600' });
      return res.end(bytes);
    }
    if (p === '/api/leads.csv' && req.method === 'GET') return handleCsv(res);

    if (p === '/api/autopilot' && req.method === 'GET') return json(res, 200, autopilotStatus());
    if (p === '/api/autopilot/digest' && req.method === 'POST') return json(res, 200, { sent: await sendDigest(), preview: buildDigest() });
    if (p === '/api/campaigns' && req.method === 'GET') return json(res, 200, { campaigns: db.campaigns });
    if (p === '/api/campaigns' && req.method === 'POST') return await handleCampaignCreate(req, res);
    if ((m = p.match(/^\/api\/campaigns\/([\w-]+)$/)) && req.method === 'PATCH') return await handleCampaignPatch(req, res, m[1]);
    if ((m = p.match(/^\/api\/campaigns\/([\w-]+)$/)) && req.method === 'DELETE') {
      return db.deleteCampaign(m[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Campaign not found' });
    }
    if ((m = p.match(/^\/api\/campaigns\/([\w-]+)\/run$/)) && req.method === 'POST') return await handleCampaignRun(res, m[1]);

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
    if ((m = p.match(/^\/sites\/([\w-]+)\/pack\.zip$/))) return await handlePackZip(res, m[1]);
    if ((m = p.match(/^\/proposals\/([\w-]+)\.html$/))) return serveProposal(res, m[1]);
    if ((m = p.match(/^\/reports\/([\w-]+)\.html$/))) return serveSeoReport(res, m[1]);
    if ((m = p.match(/^\/voice\/([\w-]+)\.html$/))) return serveVoicePack(res, m[1]);
    if ((m = p.match(/^\/invoices\/([\w-]+)\.html$/))) return serveInvoice(res, m[1]);

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
  console.log(`  AI copywriting          → ${process.env.ANTHROPIC_API_KEY ? 'ON (Claude)' : 'off (set ANTHROPIC_API_KEY to enable)'}`);
  console.log(`  Publishing (Vercel)     → ${process.env.VERCEL_TOKEN ? 'ON' : 'off (set VERCEL_TOKEN to enable)'}`);
  console.log(`  Digest email (Resend)   → ${process.env.RESEND_API_KEY && process.env.DIGEST_TO ? 'ON → ' + process.env.DIGEST_TO : 'off (set RESEND_API_KEY, OUTREACH_FROM, DIGEST_TO)'}`);
  console.log(`  Autopilot scheduler     → ON (tick every 15 min; campaigns run unattended)\n`);
  startScheduler();
});
