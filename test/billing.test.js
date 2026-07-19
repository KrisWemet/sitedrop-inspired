import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir set before the store loads.
process.env.SITESPARK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sitespark-bill-'));
process.env.AGENCY_NAME = 'Test Web Studio';
process.env.PRICE_SETUP = '2000';
process.env.PRICE_MONTHLY = '250';
const { pricingConfig, buildClient, buildInvoiceRecord, mrr, retainersDue, advanceRetainer, formatMoney } = await import('../lib/billing.js');
const { renderInvoiceHtml } = await import('../lib/invoice.js');
const { renderProposalHtml } = await import('../lib/proposal.js');
const { db } = await import('../lib/store.js');

const lead = {
  id: 'lead_billtest', name: 'Baker & Rye', category: 'bakery', city: 'Milltown', state: 'OR',
  phone: '(555) 202-7748', hasWebsite: false, verification: { outcome: 'verified-no-website' },
};

test('pricingConfig reads env with integer coercion and defaults', () => {
  const p = pricingConfig();
  assert.equal(p.setup, 2000);
  assert.equal(p.monthly, 250);
  assert.equal(p.agency.name, 'Test Web Studio');
  assert.equal(p.configured, true);
});

test('formatMoney formats without floats', () => {
  assert.equal(formatMoney(2000, 'USD'), '$2,000');
  assert.equal(formatMoney(250, 'GBP'), '£250');
});

test('buildInvoiceRecord freezes a self-consistent snapshot with tax', () => {
  process.env.AGENCY_TAX_RATE = '10';
  const client = buildClient(lead, pricingConfig());
  const rec = buildInvoiceRecord(1001, {
    client, kind: 'setup', pricing: pricingConfig(),
    lineItems: [{ description: 'Website build', quantity: 1, unit: client.setup }],
  });
  assert.equal(rec.number, 1001);
  assert.ok(rec.token.startsWith('inv_'));
  assert.equal(rec.subtotal, 2000);
  assert.equal(rec.tax, 200);       // 10% of 2000
  assert.equal(rec.total, 2200);
  // Snapshot is frozen: agency name + billTo captured, not referenced live.
  assert.equal(rec.agency.name, 'Test Web Studio');
  assert.equal(rec.billTo.name, 'Baker & Rye');
  delete process.env.AGENCY_TAX_RATE;
});

test('invoice numbering: ledger-derived, never reused, tolerant of a garbage line', () => {
  // First issue.
  const client = buildClient(lead, pricingConfig());
  db.upsertClient(client);
  const rec1 = db.issueInvoice((n) => buildInvoiceRecord(n, {
    client, kind: 'setup', pricing: pricingConfig(),
    lineItems: [{ description: 'Build', quantity: 1, unit: 2000 }],
  }));
  assert.equal(rec1.number, 1001);

  // Corrupt the ledger with a truncated final line; numbering must still advance.
  fs.appendFileSync(path.join(process.env.SITESPARK_DATA_DIR, 'invoices.jsonl'), '{"number":10');
  const rec2 = db.issueInvoice((n) => buildInvoiceRecord(n, {
    client, kind: 'retainer', pricing: pricingConfig(),
    lineItems: [{ description: 'Retainer', quantity: 1, unit: 250 }],
  }));
  assert.equal(rec2.number, 1002, 'number advances despite the corrupt line, never reuses 1001');
  assert.notEqual(rec1.token, rec2.token);
});

test('payment state is mutable in db, never mutates the frozen ledger record', () => {
  const rec = db.readInvoiceLedger()[0];
  const before = JSON.stringify(rec);
  db.markInvoicePaid(rec.number);
  assert.ok(db.getPayment(rec.number).paidAt);
  const after = JSON.stringify(db.readInvoiceLedger()[0]);
  assert.equal(before, after, 'ledger record is immutable; paidAt lives elsewhere');
});

test('MRR and retainersDue reflect active clients and schedule', () => {
  const c1 = buildClient(lead, { setup: 2000, monthly: 250, currency: 'USD' });
  const c2 = buildClient({ ...lead, id: 'x2', name: 'Other Co' }, { setup: 2000, monthly: 300, currency: 'USD' });
  c2.status = 'cancelled';
  assert.equal(mrr([c1, c2]), 250, 'cancelled clients do not count toward MRR');

  c1.nextRetainerAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(retainersDue([c1, c2]).length, 1);
  const adv = advanceRetainer(c1);
  assert.ok(new Date(adv.nextRetainerAt).getTime() > Date.now());
});

test('invoice HTML renders from frozen record only, noindex, paid/due states', () => {
  const client = buildClient(lead, pricingConfig());
  const rec = buildInvoiceRecord(1005, {
    client, kind: 'setup', pricing: pricingConfig(),
    lineItems: [{ description: 'Website design & launch', quantity: 1, unit: 2000 }],
  });
  const due = renderInvoiceHtml(rec, null);
  assert.ok(due.includes('noindex'));
  assert.ok(due.includes('Test Web Studio'));
  assert.ok(due.includes('$2,000'));
  assert.ok(due.includes('>Due<'));
  const paid = renderInvoiceHtml(rec, { paidAt: new Date().toISOString() });
  assert.ok(paid.includes('>Paid<'));
});

test('proposal HTML is agency-to-business, noindex, and escapes hostile names', () => {
  const evil = { ...lead, name: 'Evil <script>alert(1)</script> Bakery' };
  const site = { seoChecklist: [{ label: 'LocalBusiness structured data', ok: true }], keywords: ['bakery in Milltown'] };
  const html = renderProposalHtml(evil, {}, site, { previewUrl: '/sites/x.html', pricing: pricingConfig() });
  assert.ok(html.includes('noindex'));
  assert.ok(html.includes('prepared by Test Web Studio'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('$2,000'));
  assert.ok(html.includes('$250'));
});
