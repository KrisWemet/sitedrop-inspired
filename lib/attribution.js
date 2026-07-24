// Attribution: the receipts that make a retainer un-cancellable.
//
// The care plan is worth $500/month only if the client can SEE what it
// produced. This module records real, verifiable lead events — a form the
// site actually captured, a call the tracked number actually received — into
// an append-only JSONL ledger, and rolls them up per month.
//
// HONESTY MODEL (the same rule the SEO report holds to):
//   * Counts are FACTS. Every number here is a logged event with a timestamp;
//     nothing is modelled, estimated, or inferred.
//   * Money is ARITHMETIC ON THE CLIENT'S OWN INPUTS, always labelled as an
//     estimate: enquiries x their average job value x their close rate. We
//     never invent an average job value, a close rate, or a conversion figure,
//     and with no economics entered we show counts only.
//   * We never claim a lead "came from Google" or attribute a channel we
//     cannot observe. A form post and a tracked call are the only two things
//     we can honestly say we saw.
//
// The ledger is append-only with no rewrite path, exactly like sent-log and
// the invoice ledger: a db.json reset must never destroy or inflate a client's
// evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

const LEAD_LEDGER = path.join(DATA_DIR, 'leads.jsonl');

export const EVENT_KINDS = ['form', 'call'];

export function newCaptureToken() {
  return 'cap_' + crypto.randomBytes(9).toString('hex');
}

// Append one observed event. Never rewrites; a crash mid-append can only lose
// the final line, which readEvents tolerates.
export function recordEvent(leadId, kind, payload = {}) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`Unknown event kind: ${kind}`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const event = {
    id: 'ev_' + crypto.randomBytes(6).toString('hex'),
    at: new Date().toISOString(),
    leadId,
    kind,
    ...payload,
  };
  fs.appendFileSync(LEAD_LEDGER, JSON.stringify(event) + '\n');
  return event;
}

export function readEvents(leadId = null) {
  let text;
  try { text = fs.readFileSync(LEAD_LEDGER, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      if (!leadId || rec.leadId === leadId) out.push(rec);
    } catch { /* truncated final line from a crash — skip */ }
  }
  return out;
}

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// Whole-dollar integers only; never float-sum money (same rule as billing.js).
const int = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Estimated booked value from the CLIENT'S OWN numbers. Returns null when they
// haven't given us an average job value — we show counts rather than guess.
export function estimateValue(enquiries, economics = {}) {
  const avg = int(economics.avgJobValue);
  if (!avg || !enquiries) return null;
  // Close rate is a percentage the client states; default to 100% is wrong and
  // flattering, so an unset rate means "we can't estimate conversion" and we
  // report the pipeline value instead, clearly labelled by the caller.
  const rate = int(economics.closeRate);
  const pct = rate > 0 && rate <= 100 ? rate : null;
  return {
    avgJobValue: avg,
    closeRate: pct,
    // Integer math throughout.
    pipeline: enquiries * avg,
    booked: pct === null ? null : Math.round((enquiries * avg * pct) / 100),
  };
}

// Roll the ledger up for one lead. `month` is a Date inside the target month
// (defaults to now). Returns real counts plus the previous month for trend.
export function monthlyRollup(leadId, { month = new Date(), economics = {} } = {}) {
  const events = readEvents(leadId);
  const target = monthKey(month);
  const prevDate = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
  const prev = monthKey(prevDate);

  const bucket = { calls: 0, forms: 0, total: 0 };
  const prevBucket = { calls: 0, forms: 0, total: 0 };
  const recent = [];
  for (const ev of events) {
    const k = monthKey(new Date(ev.at));
    const target_ = k === target ? bucket : k === prev ? prevBucket : null;
    if (!target_) continue;
    if (ev.kind === 'call') target_.calls++;
    else if (ev.kind === 'form') target_.forms++;
    target_.total++;
    if (k === target) recent.push(ev);
  }
  recent.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    month: target,
    calls: bucket.calls,
    forms: bucket.forms,
    total: bucket.total,
    previousTotal: prevBucket.total,
    // null when there is no prior month to compare against (avoids a fake +100%)
    changePct: prevBucket.total > 0
      ? Math.round(((bucket.total - prevBucket.total) / prevBucket.total) * 100)
      : null,
    value: estimateValue(bucket.total, economics),
    recent: recent.slice(0, 10),
    lifetime: events.length,
  };
}

// Dashboard summary across every client.
export function totals() {
  const events = readEvents();
  const thisMonth = monthKey(new Date());
  let month = 0;
  for (const ev of events) if (monthKey(new Date(ev.at)) === thisMonth) month++;
  return { lifetime: events.length, thisMonth: month };
}
