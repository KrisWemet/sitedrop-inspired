// Proposal renderer. A self-contained sales document, unmistakably FROM the
// agency TO the business — not the business's own page (that would impersonate
// them). noindex/nofollow: a proposal is a private commercial document. It
// carries what the outreach email can't: itemized pricing and a clear
// before/after. It links the live preview rather than re-embedding the site,
// so the Places-photo "preview-only" invariant is never at risk here.
import { formatMoney } from './billing.js';

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());

// The "why now" hook, drawn from the verification already on the lead.
function problemLine(lead) {
  const cat = lead.category.toLowerCase();
  const city = lead.city || 'your area';
  const outcome = lead.verification?.outcome;
  if (outcome === 'dead-site') return `Your listed website no longer loads. To anyone searching for a ${cat} in ${city}, that reads the same as having no site at all.`;
  if (outcome === 'social-only') return `Right now your only web presence is a social page. It works for regulars, but it does not show up when someone searches Google — or asks an AI assistant — for a ${cat} in ${city}.`;
  return `When someone searches for a ${cat} in ${city} — on Google, or increasingly by asking an AI assistant — ${lead.name} does not appear, because there is no website to find. Your competitors with a site get that call instead.`;
}

export function renderProposalHtml(lead, enrichment, site, { previewUrl, pricing }) {
  const cityLine = [lead.city, lead.state].filter(Boolean).join(', ');
  const a = pricing.agency;
  const money = (d) => formatMoney(d, pricing.currency);
  const checklist = (site?.seoChecklist || []).filter((c) => c.ok);
  const keywords = (site?.keywords || []).slice(0, 4);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Website proposal for ${esc(lead.name)} — prepared by ${esc(a.name)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--ink:#141821;--muted:#5c6472;--line:#e6e9ee;--brand:#1740c4;--good:#1a7f45}
  body{font-family:'Helvetica Neue',Helvetica,Arial,system-ui,sans-serif;color:var(--ink);background:#f2f4f7;line-height:1.6;padding:32px 16px}
  .sheet{max-width:780px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .band{background:linear-gradient(135deg,#0b1120,#1e3a8a 70%,#1740c4);color:#eef2ff;padding:44px 52px}
  .from{font-size:.78rem;text-transform:uppercase;letter-spacing:.14em;opacity:.8}
  .band h1{font-size:1.9rem;margin:10px 0 6px;letter-spacing:-.01em}
  .band p{opacity:.9;font-size:1rem}
  main{padding:44px 52px}
  section{margin-bottom:38px}
  h2{font-size:1.25rem;margin-bottom:12px;letter-spacing:-.01em}
  p.lead-copy{font-size:1.05rem}
  .muted{color:var(--muted)}
  .cta{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:9px;margin-top:6px}
  .checks{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;margin-top:6px}
  .checks li{font-size:.92rem;color:var(--muted);padding-left:22px;position:relative}
  .checks li::before{content:'✓';position:absolute;left:0;color:var(--good);font-weight:700}
  .keywords{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .keywords span{background:#eef2ff;color:#1e3a8a;border-radius:100px;padding:5px 13px;font-size:.85rem}
  .price-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
  .price{border:1px solid var(--line);border-radius:12px;padding:24px}
  .price.headline{border-color:var(--brand);border-width:2px}
  .price .amt{font-size:2rem;font-weight:800;letter-spacing:-.02em}
  .price .amt small{font-size:.95rem;font-weight:500;color:var(--muted)}
  .price h3{font-size:.95rem;margin-bottom:6px}
  .price p{font-size:.88rem;color:var(--muted);margin-top:8px}
  .steps{list-style:none;counter-reset:s}
  .steps li{counter-increment:s;padding:10px 0 10px 40px;position:relative;border-bottom:1px solid var(--line)}
  .steps li:last-child{border-bottom:none}
  .steps li::before{content:counter(s);position:absolute;left:0;top:9px;width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:.85rem;font-weight:700}
  footer{padding:26px 52px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
  @media (max-width:640px){.band,main,footer{padding-left:26px;padding-right:26px}.checks,.price-grid{grid-template-columns:1fr}}
  @media print{body{background:#fff;padding:0}.sheet{border:none;border-radius:0}.cta{border:1px solid var(--brand)}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="band">
      <p class="from">Website proposal · prepared by ${esc(a.name)}</p>
      <h1>A website for ${esc(lead.name)}</h1>
      <p>${esc(titleCase(lead.category))}${cityLine ? ' · ' + esc(cityLine) : ''}</p>
    </div>
    <main>
      <section>
        <h2>The situation</h2>
        <p class="lead-copy">${esc(problemLine(lead))}</p>
      </section>

      <section>
        <h2>What we've already built you</h2>
        <p class="muted">Rather than pitch you on an idea, we built the site first. Take a look — it is live and ready:</p>
        <p style="margin-top:14px"><a class="cta" href="${esc(previewUrl)}" target="_blank" rel="noopener">View your website →</a></p>
        ${keywords.length ? `<div class="keywords">${keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
      </section>

      ${checklist.length ? `<section>
        <h2>Built to be found</h2>
        <p class="muted">It is optimized out of the box for Google and for AI assistants like ChatGPT and Claude:</p>
        <ul class="checks">
          ${checklist.slice(0, 8).map((c) => `<li>${esc(c.label)}</li>`).join('\n          ')}
        </ul>
      </section>` : ''}

      <section>
        <h2>Investment</h2>
        <div class="price-grid">
          <div class="price headline">
            <h3>One-time build</h3>
            <div class="amt">${esc(money(pricing.setup))}</div>
            <p>Design, copy, launch on your own domain, and everything above — yours to keep.</p>
          </div>
          <div class="price">
            <h3>Care plan</h3>
            <div class="amt">${esc(money(pricing.monthly))}<small> / month</small></div>
            <p>Hosting, updates, edits, and monitoring so the site stays current and online. Cancel anytime.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Next steps</h2>
        <ol class="steps">
          <li>You look over the live preview and tell us what to tweak.</li>
          <li>We point it at your domain and it goes live, usually the same week.</li>
          <li>The care plan keeps it running — you focus on the business.</li>
        </ol>
      </section>
    </main>
    <footer>
      Prepared for ${esc(lead.name)} by ${esc(a.name)}.
      ${a.email ? esc(a.email) : ''}${a.phone ? ' · ' + esc(a.phone) : ''}${a.website ? ' · ' + esc(a.website) : ''}
      <br>This proposal is a private document. Pricing is valid for 30 days.
    </footer>
  </div>
</body>
</html>`;
}
