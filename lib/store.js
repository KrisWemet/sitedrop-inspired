// Tiny JSON-file persistence layer. Keeps everything in data/db.json so the
// app has zero runtime dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// SITESPARK_DATA_DIR override exists so tests can run against a throwaway dir.
export const DATA_DIR = process.env.SITESPARK_DATA_DIR || path.join(ROOT, 'data');
export const SITES_DIR = path.join(DATA_DIR, 'sites');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { leads: [], sites: [], searches: [], campaigns: [], activity: [], clients: [] };
const INVOICE_LEDGER = path.join(DATA_DIR, 'invoices.jsonl');
const INVOICE_BASE = 1000; // first issued invoice is #1001

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
  if (typeof cache.meta !== 'object' || cache.meta === null || Array.isArray(cache.meta)) cache.meta = {};
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
  get campaigns() { return load().campaigns; },
  get activity() { return load().activity; },
  get clients() { return load().clients; },

  getLead(id) {
    return load().leads.find((l) => l.id === id) || null;
  },

  getLeadByProposalToken(token) {
    if (!token) return null;
    return load().leads.find((l) => l.proposal?.token === token) || null;
  },

  upsertLeads(newLeads) {
    const data = load();
    // Work already done on a lead must survive re-searching the same area.
    const PRESERVE = ['enrichment', 'siteId', 'status', 'notes', 'verification', 'outreach',
      'campaignId', 'lastEmailedAt', 'emailStatus', 'images', 'proposal', 'clientId', 'cta'];
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

  get meta() { return load().meta; },

  setMeta(key, value) {
    const data = load();
    data.meta[key] = value;
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

  // ---- clients (won leads promoted to a paying care-plan relationship) ----
  getClient(id) {
    return load().clients.find((c) => c.id === id) || null;
  },

  getClientByLead(leadId) {
    return load().clients.find((c) => c.leadId === leadId) || null;
  },

  upsertClient(client) {
    const data = load();
    const idx = data.clients.findIndex((c) => c.id === client.id);
    if (idx >= 0) data.clients[idx] = { ...data.clients[idx], ...client };
    else data.clients.push(client);
    save();
    return data.clients[idx >= 0 ? idx : data.clients.length - 1];
  },

  // ---- invoice ledger: append-only JSONL sidecar, NEVER rewritten and with
  // no .bak rotation — append-only is its integrity model. A db.json reset
  // must never reissue or renumber an invoice, exactly like sent-log. ----
  readInvoiceLedger() {
    try {
      return fs.readFileSync(INVOICE_LEDGER, 'utf8')
        .split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    } catch {
      return [];
    }
  },

  // Highest invoice number across ALL parseable lines (not array length, and
  // tolerant of a truncated final line from a crash mid-append) so a number
  // is never reused.
  highestInvoiceNumber() {
    let max = INVOICE_BASE;
    for (const rec of this.readInvoiceLedger()) {
      if (Number.isInteger(rec.number) && rec.number > max) max = rec.number;
    }
    return max;
  },

  // THE critical section: read-max -> assign -> append, all synchronous with
  // no await inside, which makes it atomic in Node's single thread. `build`
  // receives the assigned number and returns the frozen invoice record.
  issueInvoice(build) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const number = this.highestInvoiceNumber() + 1;
    const record = build(number);
    fs.appendFileSync(INVOICE_LEDGER, JSON.stringify(record) + '\n');
    return record;
  },

  getInvoiceByToken(token) {
    if (!token) return null;
    return this.readInvoiceLedger().find((r) => r.token === token) || null;
  },

  invoicesForClient(clientId) {
    return this.readInvoiceLedger().filter((r) => r.clientId === clientId);
  },

  // ---- payment state: MUTABLE, lives in db.json, never mutates the frozen
  // ledger record. Keyed by invoice number. ----
  markInvoicePaid(number, { method = 'manual' } = {}) {
    const data = load();
    if (!data.meta.payments) data.meta.payments = {};
    data.meta.payments[number] = { paidAt: new Date().toISOString(), method };
    save();
    return data.meta.payments[number];
  },

  getPayment(number) {
    return load().meta.payments?.[number] || null;
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
