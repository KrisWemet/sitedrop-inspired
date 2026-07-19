// Invoice renderer. Renders a self-contained, print-friendly HTML invoice
// PURELY from a frozen ledger record — never from the live lead or env — so a
// re-render years later is byte-stable. noindex/nofollow: a client's invoice
// must never land in a search engine. No PDF library (zero-dep); "print to
// PDF" from the browser is the escape hatch, and the print CSS is tuned for it.
import { formatMoney } from './billing.js';

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const money = (rec, dollars) => formatMoney(dollars, rec.currency);
const dateStr = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function renderInvoiceHtml(rec, payment = null) {
  const a = rec.agency || {};
  const paid = Boolean(payment?.paidAt);
  const kindLabel = rec.kind === 'retainer' ? 'Care plan — monthly' : 'Website build';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Invoice #${esc(rec.number)} — ${esc(a.name || 'Invoice')}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Helvetica,Arial,system-ui,sans-serif;color:#1a1a1a;background:#eef0f3;line-height:1.55;padding:32px 16px}
  .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e5ea;border-radius:8px;padding:52px 56px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}
  .agency-name{font-size:1.4rem;font-weight:700;letter-spacing:-.01em}
  .muted{color:#6b7280;font-size:.9rem}
  .doc-title{text-align:right}
  .doc-title h1{font-size:2rem;letter-spacing:.02em;color:#111}
  .status{display:inline-block;margin-top:8px;padding:5px 14px;border-radius:100px;font-weight:700;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
  .status.paid{background:#e7f6ec;color:#1a7f45}
  .status.due{background:#fdecec;color:#b42318}
  .meta-row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin:36px 0 28px;padding:22px 0;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}
  .meta-block h3{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:#9aa1ad;margin-bottom:7px}
  .meta-block p{font-size:.96rem}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#9aa1ad;padding:0 0 12px;border-bottom:2px solid #1a1a1a}
  th.num,td.num{text-align:right}
  td{padding:16px 0;border-bottom:1px solid #edf0f3;font-size:.97rem;vertical-align:top}
  td .desc-note{display:block;color:#6b7280;font-size:.85rem;margin-top:3px}
  .totals{margin-left:auto;width:min(320px,100%);margin-top:22px}
  .totals div{display:flex;justify-content:space-between;padding:8px 0;font-size:.97rem}
  .totals .grand{border-top:2px solid #1a1a1a;margin-top:6px;padding-top:14px;font-size:1.2rem;font-weight:700}
  .foot{margin-top:40px;padding-top:22px;border-top:1px solid #edf0f3;color:#6b7280;font-size:.86rem}
  @media print{
    body{background:#fff;padding:0}
    .sheet{border:none;border-radius:0;max-width:none;padding:0}
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="agency-name">${esc(a.name || 'Your Web Studio')}</div>
        ${a.address ? `<p class="muted">${esc(a.address)}</p>` : ''}
        ${a.email ? `<p class="muted">${esc(a.email)}</p>` : ''}
        ${a.phone ? `<p class="muted">${esc(a.phone)}</p>` : ''}
      </div>
      <div class="doc-title">
        <h1>INVOICE</h1>
        <p class="muted">#${esc(rec.number)}</p>
        <span class="status ${paid ? 'paid' : 'due'}">${paid ? 'Paid' : 'Due'}</span>
      </div>
    </div>

    <div class="meta-row">
      <div class="meta-block">
        <h3>Billed to</h3>
        <p><strong>${esc(rec.billTo?.name || '')}</strong></p>
        ${rec.billTo?.location ? `<p class="muted">${esc(rec.billTo.location)}</p>` : ''}
      </div>
      <div class="meta-block">
        <h3>Issued</h3>
        <p>${esc(dateStr(rec.issuedAt))}</p>
      </div>
      <div class="meta-block">
        <h3>For</h3>
        <p>${esc(kindLabel)}</p>
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rec.lineItems.map((li) => `<tr>
          <td>${esc(li.description)}</td>
          <td class="num">${esc(li.quantity)}</td>
          <td class="num">${esc(money(rec, li.unit))}</td>
          <td class="num">${esc(money(rec, li.amount))}</td>
        </tr>`).join('\n        ')}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${esc(money(rec, rec.subtotal))}</span></div>
      ${rec.tax > 0 ? `<div><span>Tax (${esc(rec.taxRatePercent)}%)</span><span>${esc(money(rec, rec.tax))}</span></div>` : ''}
      <div class="grand"><span>Total ${esc(rec.currency)}</span><span>${esc(money(rec, rec.total))}</span></div>
    </div>

    <div class="foot">
      ${paid
        ? `Paid on ${esc(dateStr(payment.paidAt))}. Thank you.`
        : `Payment due on receipt.${a.email ? ` Questions? ${esc(a.email)}` : ''}`}
      <br>Invoice #${esc(rec.number)} · ${esc(rec.currency)} · issued by ${esc(a.name || 'Your Web Studio')}.
    </div>
  </div>
</body>
</html>`;
}
