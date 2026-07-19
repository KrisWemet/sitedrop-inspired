// Billing model: the $2,000-upfront + $250/month care-plan relationship.
//
// A won lead is promoted to a "client" with contract terms and a recurring
// retainer schedule. The setup invoice is the first record in the append-only
// ledger; monthly retainers are the same shape, issued per period. Money is
// held as whole-dollar integers and formatted only at render — never summed
// as floats. Nothing here sends anything; issuing is generate-only, and the
// operator confirms amounts before they are frozen.
import crypto from 'node:crypto';

const int = (v, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Agency identity + default pricing from env. These are *defaults*; the
// operator confirms/overrides the amounts before an invoice is frozen.
export function pricingConfig() {
  return {
    setup: int(process.env.PRICE_SETUP, 2000),
    monthly: int(process.env.PRICE_MONTHLY, 250),
    currency: (process.env.BILLING_CURRENCY || 'USD').toUpperCase(),
    taxRate: Math.max(0, Number(process.env.AGENCY_TAX_RATE) || 0), // percent, default 0
    agency: {
      name: process.env.AGENCY_NAME || 'Your Web Studio',
      email: process.env.AGENCY_EMAIL || '',
      phone: process.env.AGENCY_PHONE || '',
      address: process.env.AGENCY_ADDRESS || '',
      website: process.env.AGENCY_WEBSITE || '',
    },
    configured: Boolean(process.env.AGENCY_NAME),
  };
}

const CURRENCY_SYMBOLS = { USD: '$', CAD: '$', AUD: '$', EUR: '€', GBP: '£' };

export function formatMoney(dollars, currency = 'USD') {
  const sym = CURRENCY_SYMBOLS[currency] || '';
  const n = Number(dollars) || 0;
  return `${sym}${n.toLocaleString('en-US')}${sym ? '' : ' ' + currency}`;
}

const addMonths = (iso, n) => {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
};

// Promote a won lead into a client record with contract terms. Amounts come
// in already-confirmed by the operator (env values are only the form default).
export function buildClient(lead, { setup, monthly, currency }) {
  const now = new Date().toISOString();
  return {
    id: 'client_' + crypto.randomBytes(6).toString('hex'),
    leadId: lead.id,
    businessName: lead.name,
    city: [lead.city, lead.state].filter(Boolean).join(', ') || null,
    setup: int(setup, 2000),
    monthly: int(monthly, 250),
    currency: (currency || 'USD').toUpperCase(),
    status: 'active', // active | paused | cancelled
    startedAt: now,
    nextRetainerAt: addMonths(now, 1),
    createdAt: now,
  };
}

export function advanceRetainer(client) {
  return { id: client.id, nextRetainerAt: addMonths(client.nextRetainerAt || client.startedAt, 1) };
}

// Monthly recurring revenue across active clients (integer dollars, no floats).
export function mrr(clients) {
  return clients
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (Number.isInteger(c.monthly) ? c.monthly : 0), 0);
}

// Active clients whose retainer period has come due (schedule tracked here;
// the operator still issues each invoice — money stays a one-click human step).
export function retainersDue(clients, now = Date.now()) {
  return clients.filter((c) => c.status === 'active' && c.nextRetainerAt &&
    new Date(c.nextRetainerAt).getTime() <= now);
}

// Build the FROZEN invoice snapshot. Everything the invoice will ever show is
// captured here at issue time so re-rendering later can never drift with the
// live lead or env. `number` is assigned inside the store's critical section.
export function buildInvoiceRecord(number, { client, kind, lineItems, pricing }) {
  const items = lineItems.map((li) => ({
    description: String(li.description),
    quantity: int(li.quantity, 1),
    unit: int(li.unit, 0),
    amount: int(li.quantity, 1) * int(li.unit, 0),
  }));
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(subtotal * (pricing.taxRate / 100));
  const total = subtotal + tax;
  return {
    number,
    token: 'inv_' + crypto.randomBytes(9).toString('hex'),
    kind, // 'setup' | 'retainer'
    clientId: client.id,
    leadId: client.leadId,
    issuedAt: new Date().toISOString(),
    currency: client.currency,
    // Frozen copies — never re-read from live sources when rendering.
    billTo: { name: client.businessName, location: client.city || '' },
    agency: { ...pricing.agency },
    taxRatePercent: pricing.taxRate,
    lineItems: items,
    subtotal,
    tax,
    total,
  };
}
