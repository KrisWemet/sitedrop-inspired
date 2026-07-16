// Autopilot: saved campaigns run unattended — search → verify → enrich →
// generate site → draft outreach — then a daily digest email tells the
// operator which calls are worth making. Nothing is ever sent to a prospect
// automatically.
//
// Scheduler design (per architecture review):
// - chained setTimeout with a tick guard, never overlapping ticks
// - campaigns geocoded ONCE at creation (Nominatim stays out of the loop)
// - scheduler calls searchBusinesses directly: a live-API failure is a
//   logged failed run, NEVER a silent demo-data substitution
// - sequential processing with jitter between campaigns (Overpass courtesy)
// - global daily generation cap bounds Claude/Vercel spend
import crypto from 'node:crypto';
import { db } from './store.js';
import { searchBusinesses } from './osm.js';
import { verifyLead } from './verify.js';
import { enrichLead } from './enrich.js';
import { generateSite, newSiteId } from './generator.js';
import { llmsTxt } from './seo.js';
import { buildOutreach } from './outreach.js';
import { sendMail, mailerStatus } from './mailer.js';
import { imageProviders, stockCandidates, attachStockImage } from './images.js';

const TICK_MS = 15 * 60 * 1000;          // scheduler wakes every 15 min
const MIN_INTERVAL_H = 6;                // OSM data doesn't churn hourly
const DEFAULT_INTERVAL_H = 24;
const JITTER_MS = () => 30000 + Math.floor(Math.random() * 30000);
const MAX_LEADS_PER_RUN = Math.max(1, Number(process.env.AUTOPILOT_MAX_PER_RUN) || 5);
const DAILY_GEN_CAP = Math.max(1, Number(process.env.AUTOPILOT_DAILY_GEN_CAP) || 20);
const DIGEST_HOUR = Math.min(23, Math.max(0, Number(process.env.DIGEST_HOUR) || 8));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- campaigns ----------

export async function createCampaign({ query, location, radiusKm, intervalHours }, geocodeFn) {
  const q = String(query || '').trim();
  const loc = String(location || '').trim();
  if (!q || !loc) throw new Error('query and location are required');
  if (loc.toLowerCase() === 'demo') throw new Error('Campaigns need a real location — demo data is for manual exploration only.');

  const geo = await geocodeFn(loc); // geocode once, at creation
  const interval = Math.max(MIN_INTERVAL_H, Number(intervalHours) || DEFAULT_INTERVAL_H);
  const campaign = {
    id: 'camp_' + crypto.randomBytes(5).toString('hex'),
    query: q,
    location: loc,
    geo: { lat: geo.lat, lon: geo.lon, city: geo.city, state: geo.state, displayName: geo.displayName },
    radiusKm: Math.min(Math.max(Number(radiusKm) || 5, 1), 25),
    intervalHours: interval,
    enabled: true,
    createdAt: new Date().toISOString(),
    nextRunAt: new Date().toISOString(), // first run on the next tick
    lastRun: null,
  };
  db.upsertCampaign(campaign);
  db.logActivity({ kind: 'campaign-created', campaignId: campaign.id, detail: `${q} near ${loc}, every ${interval}h` });
  return campaign;
}

function generationsToday() {
  const today = new Date().toISOString().slice(0, 10);
  return db.activity.filter((a) => a.kind === 'site-generated' && a.at.startsWith(today)).length;
}

// ---------- the per-campaign pipeline ----------

export async function runCampaign(campaign, { log = true, searchFn = searchBusinesses, verifyFn = verifyLead } = {}) {
  const result = { campaignId: campaign.id, found: 0, noWebsite: 0, verified: 0, hot: 0, generated: 0, drafted: 0, skipped: 0, error: null };
  const activity = (kind, detail, extra = {}) => {
    if (log) db.logActivity({ kind, campaignId: campaign.id, detail, ...extra });
  };

  try {
    // Direct call — no handleSearch, no demo fallback. Failure = failed run.
    const { leads } = await searchFn(campaign.query, campaign.location, campaign.radiusKm, campaign.geo);
    for (const lead of leads) lead.campaignId = campaign.id;
    db.upsertLeads(leads);
    result.found = leads.length;
    result.noWebsite = leads.filter((l) => !l.hasWebsite).length;
    activity('campaign-searched', `${leads.length} businesses, ${result.noWebsite} without websites`);

    // Work the hottest unprocessed no-website leads, capped per run.
    const candidates = leads
      .filter((l) => !l.hasWebsite)
      .map((l) => db.getLead(l.id) || l)
      .filter((l) => !l.verification)             // not yet verified
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_LEADS_PER_RUN);

    for (const candidate of candidates) {
      if (generationsToday() >= DAILY_GEN_CAP) {
        result.skipped++;
        activity('cap-reached', `Daily generation cap (${DAILY_GEN_CAP}) reached — ${candidate.name} deferred to tomorrow`);
        continue;
      }

      // 1. verify (sequential, polite)
      const verification = await verifyFn(candidate);
      result.verified++;
      const patch = { verification };
      if (verification.outcome === 'possible-site-found' && verification.foundUrl) {
        patch.hasWebsite = true;
        patch.website = verification.foundUrl;
        db.updateLead(candidate.id, patch);
        activity('verify-cooled', `${candidate.name}: likely existing site found (${verification.foundUrl})`);
        continue;
      }
      db.updateLead(candidate.id, patch);
      if (!verification.stillHot) continue;
      result.hot++;

      // 2. enrich (+ one licensed stock photo when Pexels is configured)
      const enrichment = await enrichLead(candidate);
      if (imageProviders().pexels && !(candidate.images || []).length) {
        try {
          const [first] = await stockCandidates(candidate, enrichment.industry, { perQuery: 1 });
          if (first) {
            const image = await attachStockImage(candidate, first);
            db.updateLead(candidate.id, { images: [image] });
            candidate.images = [image];
          }
        } catch { /* photo is a bonus, never a blocker */ }
      }
      const siteId = candidate.siteId || newSiteId();
      const gen = generateSite(candidate, enrichment, enrichment.theme);
      db.saveSiteHtml(siteId, gen.html);
      db.addSite({
        id: siteId, leadId: candidate.id, businessName: candidate.name, category: candidate.category,
        city: [candidate.city, candidate.state].filter(Boolean).join(', ') || null,
        theme: enrichment.theme, bytes: Buffer.byteLength(gen.html), title: gen.title,
        description: gen.description, keywords: gen.keywords, seoChecklist: gen.checklist,
        llms: llmsTxt(candidate, enrichment, gen.faqs),
        generatedAt: new Date().toISOString(),
      });
      result.generated++;
      activity('site-generated', `${candidate.name} → site ready (${enrichment.theme} theme)`, { leadId: candidate.id, siteId });

      // 3. draft outreach (queued for manual one-click send — never auto-sent)
      const base = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000);
      const previewUrl = `${base}/sites/${siteId}.html` + (process.env.BASE_URL ? '' : '  (publish or host before sending)');
      const outreach = await buildOutreach(candidate, enrichment, previewUrl);
      db.updateLead(candidate.id, { enrichment, siteId, outreach });
      result.drafted++;
      activity('outreach-drafted', `${candidate.name}: pitch email drafted, waiting for your review`, { leadId: candidate.id });
    }
  } catch (err) {
    result.error = err.message;
    activity('campaign-failed', `${campaign.query} near ${campaign.location}: ${err.message}`);
  }

  db.upsertCampaign({
    id: campaign.id,
    lastRun: { at: new Date().toISOString(), ...result },
    nextRunAt: new Date(Date.now() + campaign.intervalHours * 3600 * 1000).toISOString(),
  });
  return result;
}

// ---------- daily digest (to the operator only) ----------

export function buildDigest() {
  const since = Date.now() - 24 * 3600 * 1000;
  const recent = db.activity.filter((a) => new Date(a.at).getTime() >= since);
  const leads = db.leads;

  const drafted = leads.filter((l) => l.outreach && !l.hasWebsite && l.status === 'new');
  const aging = leads.filter((l) => l.status === 'contacted' &&
    l.lastEmailedAt && Date.now() - new Date(l.lastEmailedAt).getTime() > 5 * 24 * 3600 * 1000);
  const counts = {
    searched: recent.filter((a) => a.kind === 'campaign-searched').length,
    generated: recent.filter((a) => a.kind === 'site-generated').length,
    draftedNew: recent.filter((a) => a.kind === 'outreach-drafted').length,
    failed: recent.filter((a) => a.kind === 'campaign-failed').length,
  };

  const lines = [
    `SiteSpark daily digest — ${new Date().toDateString()}`,
    '',
    `Last 24h: ${counts.searched} campaign runs · ${counts.generated} sites generated · ${counts.draftedNew} pitches drafted${counts.failed ? ` · ${counts.failed} FAILED runs` : ''}`,
    '',
  ];

  if (drafted.length) {
    lines.push(`READY TO PITCH (${drafted.length}) — review & send with one click:`);
    for (const l of drafted.slice(0, 10)) {
      lines.push(`  • ${l.name} (${l.category}${l.city ? ', ' + l.city : ''})${l.phone ? ' · ' + l.phone : ''}`);
    }
    lines.push('');
  }
  if (aging.length) {
    lines.push(`FOLLOW-UP CANDIDATES (contacted 5+ days ago, no status change):`);
    for (const l of aging.slice(0, 10)) lines.push(`  • ${l.name}${l.phone ? ' · ' + l.phone : ''}`);
    lines.push('');
  }
  const failures = recent.filter((a) => a.kind === 'campaign-failed').slice(0, 5);
  if (failures.length) {
    lines.push('FAILURES:');
    for (const f of failures) lines.push(`  • ${f.detail}`);
    lines.push('');
  }
  lines.push(`Pipeline: ${leads.filter((l) => l.status === 'new').length} new · ${leads.filter((l) => l.status === 'contacted').length} contacted · ${leads.filter((l) => l.status === 'pitched').length} pitched · ${leads.filter((l) => l.status === 'won').length} won`);
  lines.push('', 'Open the dashboard: ' + (process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000)) + '/app#/autopilot');

  return { subject: `SiteSpark digest: ${drafted.length} pitches ready, ${counts.generated} new sites`, text: lines.join('\n') };
}

export async function sendDigest() {
  const to = process.env.DIGEST_TO;
  if (!to) return { skipped: true, reason: 'DIGEST_TO not set' };
  const digest = buildDigest();
  const sent = await sendMail({ to, ...digest });
  if (!sent.dryRun) db.appendSentLog({ kind: 'digest', to, subject: digest.subject });
  db.setMeta('lastDigestAt', new Date().toISOString());
  db.logActivity({ kind: 'digest-sent', detail: sent.dryRun ? 'digest built (dry run — mailer not configured)' : `digest emailed to ${to}` });
  return sent;
}

// ---------- scheduler ----------

let tickRunning = false;
let timer = null;

export async function tick(geocodeUnused) {
  if (tickRunning) return { skipped: 'tick already running' };
  tickRunning = true;
  try {
    const now = Date.now();
    const due = db.campaigns.filter((c) => c.enabled && new Date(c.nextRunAt).getTime() <= now);
    for (let i = 0; i < due.length; i++) {
      if (i > 0) await sleep(JITTER_MS()); // stagger Overpass load
      await runCampaign(due[i]);
    }

    // Daily digest once per day, at/after DIGEST_HOUR local time.
    const last = db.meta.lastDigestAt ? new Date(db.meta.lastDigestAt) : null;
    const nowDate = new Date();
    if (nowDate.getHours() >= DIGEST_HOUR &&
        (!last || last.toDateString() !== nowDate.toDateString()) &&
        (db.campaigns.length || db.leads.length)) {
      await sendDigest();
    }
    return { ran: due.length };
  } finally {
    tickRunning = false;
  }
}

export function startScheduler() {
  const loop = async () => {
    try {
      await tick();
    } catch (err) {
      console.error('[autopilot] tick failed:', err.message);
    }
    timer = setTimeout(loop, TICK_MS);
    timer.unref(); // never keep the process alive just for the scheduler
  };
  timer = setTimeout(loop, 10_000); // first tick shortly after boot (catch-up)
  timer.unref();
  return () => clearTimeout(timer);
}

export function autopilotStatus() {
  return {
    campaigns: db.campaigns,
    activity: db.activity.slice(0, 60),
    mailer: mailerStatus(),
    digestTo: process.env.DIGEST_TO || null,
    digestHour: DIGEST_HOUR,
    lastDigestAt: db.meta.lastDigestAt || null,
    baseUrl: process.env.BASE_URL || null,
    caps: { leadsPerRun: MAX_LEADS_PER_RUN, dailyGenerations: DAILY_GEN_CAP, generationsToday: generationsToday() },
    tickMinutes: TICK_MS / 60000,
  };
}
