// Tiny JSON-file persistence layer. Keeps everything in data/db.json so the
// app has zero runtime dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.join(ROOT, 'data');
export const SITES_DIR = path.join(DATA_DIR, 'sites');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { leads: [], sites: [], searches: [], campaigns: [], activity: [] };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    // Corrupt or missing main file — fall back to the last good backup
    // rather than silently starting from empty.
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE + '.bak', 'utf8'));
      console.error('[store] db.json unreadable — recovered from db.json.bak');
    } catch {
      cache = structuredClone(EMPTY);
    }
  }
  for (const key of Object.keys(EMPTY)) {
    if (!Array.isArray(cache[key])) cache[key] = [];
  }
  return cache;
}

// Atomic save: write to a temp file, keep the previous version as .bak, then
// rename into place. A crash mid-write can no longer destroy the database.
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  try {
    fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
  } catch { /* first save — nothing to back up */ }
  fs.renameSync(tmp, DB_FILE);
}

export const db = {
  get leads() { return load().leads; },
  get sites() { return load().sites; },
  get searches() { return load().searches; },

  getLead(id) {
    return load().leads.find((l) => l.id === id) || null;
  },

  upsertLeads(newLeads) {
    const data = load();
    // Work already done on a lead must survive re-searching the same area.
    const PRESERVE = ['enrichment', 'siteId', 'status', 'notes', 'verification', 'outreach',
      'campaignId', 'lastEmailedAt', 'emailStatus'];
    for (const lead of newLeads) {
      const idx = data.leads.findIndex((l) => l.id === lead.id);
      if (idx >= 0) {
        const merged = { ...data.leads[idx], ...lead };
        for (const key of PRESERVE) {
          if (lead[key] == null && data.leads[idx][key] != null) merged[key] = data.leads[idx][key];
        }
        data.leads[idx] = merged;
      } else {
        data.leads.push(lead);
      }
    }
    save();
  },

  updateLead(id, patch) {
    const data = load();
    const idx = data.leads.findIndex((l) => l.id === id);
    if (idx < 0) return null;
    data.leads[idx] = { ...data.leads[idx], ...patch };
    save();
    return data.leads[idx];
  },

  getSite(id) {
    return load().sites.find((s) => s.id === id) || null;
  },

  addSite(site) {
    const data = load();
    const idx = data.sites.findIndex((s) => s.id === site.id);
    if (idx >= 0) data.sites[idx] = site;
    else data.sites.push(site);
    save();
  },

  addSearch(search) {
    const data = load();
    data.searches.unshift(search);
    data.searches = data.searches.slice(0, 25);
    save();
  },

  // ---- autopilot campaigns ----
  getCampaign(id) {
    return load().campaigns.find((c) => c.id === id) || null;
  },

  upsertCampaign(campaign) {
    const data = load();
    const idx = data.campaigns.findIndex((c) => c.id === campaign.id);
    if (idx >= 0) data.campaigns[idx] = { ...data.campaigns[idx], ...campaign };
    else data.campaigns.push(campaign);
    save();
    return data.campaigns[idx >= 0 ? idx : data.campaigns.length - 1];
  },

  deleteCampaign(id) {
    const data = load();
    const before = data.campaigns.length;
    data.campaigns = data.campaigns.filter((c) => c.id !== id);
    if (data.campaigns.length !== before) save();
    return data.campaigns.length !== before;
  },

  // ---- activity log (capped ring buffer in the db) ----
  logActivity(entry) {
    const data = load();
    data.activity.unshift({ at: new Date().toISOString(), ...entry });
    data.activity = data.activity.slice(0, 300);
    save();
  },

  // ---- sent-mail log: append-only JSONL sidecar, never rewritten, so a
  // db reset can never cause someone to be emailed twice. ----
  appendSentLog(record) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'sent-log.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
  },

  readSentLog() {
    try {
      return fs.readFileSync(path.join(DATA_DIR, 'sent-log.jsonl'), 'utf8')
        .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    } catch {
      return [];
    }
  },

  hasEmailBeenSent(email) {
    if (!email) return false;
    const target = String(email).toLowerCase();
    return this.readSentLog().some((r) => String(r.to || '').toLowerCase() === target && r.kind === 'pitch');
  },

  saveSiteHtml(id, html) {
    fs.mkdirSync(SITES_DIR, { recursive: true });
    fs.writeFileSync(path.join(SITES_DIR, `${id}.html`), html);
  },

  readSiteHtml(id) {
    // Site ids are generated internally (site_<hex>), but never trust them in a path.
    if (!/^[a-z0-9_-]+$/i.test(id)) return null;
    try {
      return fs.readFileSync(path.join(SITES_DIR, `${id}.html`), 'utf8');
    } catch {
      return null;
    }
  },
};
