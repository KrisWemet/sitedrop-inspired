// Tiny JSON-file persistence layer. Keeps everything in data/db.json so the
// app has zero runtime dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.join(ROOT, 'data');
export const SITES_DIR = path.join(DATA_DIR, 'sites');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { leads: [], sites: [], searches: [] };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const key of Object.keys(EMPTY)) {
      if (!Array.isArray(cache[key])) cache[key] = [];
    }
  } catch {
    cache = structuredClone(EMPTY);
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
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
    const PRESERVE = ['enrichment', 'siteId', 'status', 'notes', 'verification', 'outreach'];
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
