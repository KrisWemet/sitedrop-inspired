// Review funnel: a no-JS page that turns happy customers into public reviews
// and gives everyone an easy private-feedback channel. Served at
// /sites/:id/review.html and shipped in the deploy pack.
//
// COMPLIANCE — no review gating. The FTC's rule on review suppression and
// Google's policies forbid routing only happy customers to the public review
// while diverting unhappy ones to a private form. So this page NEVER
// conditions the public path on a star selection: the "leave a public review"
// link and the "tell us privately" link are BOTH offered openly to every
// visitor. The stars are an invitation, not a gate.
import { icon, starRow } from './icons.js';

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Public review destination: the operator-entered Google review link when
// present, otherwise a Google Maps search for the business so the customer
// can find the listing and review it. Honest either way.
function publicReviewUrl(lead) {
  if (lead.cta?.googleReviewUrl) return { url: lead.cta.googleReviewUrl, exact: true };
  const q = encodeURIComponent([lead.name, lead.address || lead.city].filter(Boolean).join(' '));
  return { url: `https://www.google.com/maps/search/?api=1&query=${q}`, exact: false };
}

function privateFeedbackLink(lead) {
  if (lead.cta?.formEndpoint) return { href: lead.cta.formEndpoint, kind: 'form' };
  if (lead.email) return { href: `mailto:${lead.email}?subject=${encodeURIComponent('Feedback for ' + lead.name)}`, kind: 'email' };
  if (lead.phone) return { href: `tel:${String(lead.phone).replace(/[^\d+]/g, '')}`, kind: 'phone' };
  return null;
}

export function renderReviewFunnel(lead, { agency, theme } = {}) {
  const name = esc(lead.name);
  const pub = publicReviewUrl(lead);
  const priv = privateFeedbackLink(lead);
  const brand = theme?.primary || '#1740c4';
  const brandInk = theme?.primaryInk || '#ffffff';
  const privLabel = priv?.kind === 'phone' ? 'Call us and let us know' : 'Tell us privately';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Leave a review for ${name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--brand:${brand};--brand-ink:${brandInk};--ink:#141821;--muted:#5c6472;--line:#e6e9ee}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--ink);background:#f4f6f9;line-height:1.6;min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{max-width:460px;width:100%;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px 34px;text-align:center;box-shadow:0 10px 40px rgba(12,18,32,.06)}
  h1{font-size:1.5rem;letter-spacing:-.01em;margin-bottom:8px}
  p.sub{color:var(--muted);margin-bottom:20px}
  .stars{display:inline-flex;gap:4px;color:#e0a52e;margin-bottom:24px}
  .stars svg{width:30px;height:30px}
  .btn{display:block;width:100%;padding:15px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1.02rem;margin-bottom:12px}
  .btn.primary{background:var(--brand);color:var(--brand-ink)}
  .btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line);font-weight:600}
  .btn .ic{vertical-align:middle;margin-right:8px}
  .hint{font-size:.82rem;color:var(--muted);margin-top:12px}
  footer{margin-top:22px;font-size:.78rem;color:var(--muted)}
  @media print{
    body{background:#fff;display:block;padding:0}
    .card{border:2px dashed #cbd2dc;box-shadow:none;max-width:none;margin:0 auto}
    .no-print{display:none}
    .print-url{display:block!important}
  }
  .print-url{display:none;margin-top:16px;font-size:.9rem;word-break:break-all}
</style>
</head>
<body>
  <div class="card">
    <div class="stars" aria-hidden="true">${starRow(5, { size: 30 })}</div>
    <h1>How did we do?</h1>
    <p class="sub">${name} would love your feedback. It only takes a minute — and it helps your neighbors find us.</p>

    <a class="btn primary" href="${esc(pub.url)}" target="_blank" rel="noopener">
      <span class="ic" aria-hidden="true">${icon('star', { size: 18, fill: 'currentColor' })}</span>Leave a public review
    </a>
    ${priv ? `<a class="btn ghost" href="${esc(priv.href)}"${priv.kind === 'form' ? '' : ''}>
      <span class="ic" aria-hidden="true">${icon(priv.kind === 'phone' ? 'phone' : 'mail', { size: 18 })}</span>${esc(privLabel)}
    </a>` : ''}

    <p class="hint">${pub.exact
      ? 'Both options are here for everyone — share your honest experience, whichever way suits you.'
      : 'The public link opens our Google listing. Prefer to reach us directly? Use the option above.'}</p>

    <div class="print-url">Leave a review: ${esc(pub.url)}</div>
    <footer>${agency?.name ? esc(agency.name) : ''}</footer>
  </div>
</body>
</html>`;
}
