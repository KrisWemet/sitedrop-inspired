// SEO/AEO care-plan report: the white-label monthly deliverable that makes
// the retainer feel real. Everything in it derives from data the app truly
// has (checklist status, keyword targets, schema/AEO state, entered reviews)
// — it deliberately contains NO invented metrics: no fabricated rankings,
// traffic numbers, or growth curves. Status + plan, honestly framed.
// Served at an unguessable rpt_ token URL, noindex, like proposals/invoices.
import { formatMoney } from './billing.js';

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Content-plan suggestions seeded per industry+month so consecutive reports
// don't repeat. Suggestions, not deliveries — phrased as this month's plan.
const CONTENT_IDEAS = {
  generic: [
    'Add a customer question you actually got this month to the site FAQ',
    'Publish one before/after or recent-work note with a photo',
    'Refresh the About copy with one concrete, dated detail (anniversary, new equipment, staff milestone)',
    'Add a short answer for a seasonal question customers ask this time of year',
    'Ask two recent happy customers for a Google review (send the review link)',
    'Check that hours, phone, and address match everywhere: site, Google, socials',
  ],
};

function contentPlan(industry, monthIndex) {
  const pool = CONTENT_IDEAS[industry] || CONTENT_IDEAS.generic;
  const start = monthIndex % pool.length;
  return [0, 1, 2].map((i) => pool[(start + i) % pool.length]);
}

// Google Business Profile checklist with per-lead data hints.
function gbpChecklist(lead) {
  const has = (v) => Boolean(v);
  return [
    { label: 'Claim and verify the Google Business Profile', hint: 'The single highest-leverage local ranking factor.' },
    { label: 'Hours filled in and current', hint: has(lead.openingHours) ? 'Site and profile hours must match.' : 'No hours on file yet — collect them from the owner first.' },
    { label: 'Phone number matches the website exactly', hint: has(lead.phone) ? `Use ${lead.phone} everywhere.` : 'No phone on file yet.' },
    { label: 'Website link points at the new site', hint: 'Once the site is live on its domain.' },
    { label: 'At least 5 real photos uploaded', hint: 'Owner photos outperform stock on profiles.' },
    { label: 'Primary category set precisely', hint: `Closest match for "${lead.category}".` },
    { label: 'Reply to every review, good or bad', hint: 'Response rate is visible to searchers.' },
  ];
}

export function renderSeoReportHtml(lead, site, { pricing, period = new Date() } = {}) {
  const a = pricing.agency;
  const cityLine = [lead.city, lead.state].filter(Boolean).join(', ');
  const checklist = site?.seoChecklist || [];
  const done = checklist.filter((c) => c.ok);
  const todo = checklist.filter((c) => !c.ok);
  const keywords = site?.keywords || [];
  const monthIndex = period.getMonth();
  const monthName = `${MONTHS[monthIndex]} ${period.getFullYear()}`;
  const industry = lead.enrichment?.industry || 'generic';
  const plan = contentPlan(industry, monthIndex + (lead.id.length % 3));
  const reviews = Array.isArray(lead.reviews) ? lead.reviews : [];
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1)
    : null;

  // AEO facts pulled from the checklist labels the generator actually set.
  const aeoRows = checklist.filter((c) => /JSON-LD|schema|FAQ|speakable|llms|AI crawler|robots/i.test(c.label));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Search &amp; AI visibility report — ${esc(lead.name)} — ${esc(monthName)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--ink:#141821;--muted:#5c6472;--line:#e6e9ee;--brand:#0c6e64;--good:#1a7f45;--warn:#b45309}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--ink);background:#f2f4f7;line-height:1.6;padding:32px 16px}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .band{background:linear-gradient(135deg,#052e2a,#0c6e64);color:#ecfdf5;padding:40px 52px}
  .from{font-size:.78rem;text-transform:uppercase;letter-spacing:.14em;opacity:.85}
  .band h1{font-size:1.7rem;margin:10px 0 4px;letter-spacing:-.01em}
  .band p{opacity:.9}
  main{padding:40px 52px}
  section{margin-bottom:36px}
  h2{font-size:1.2rem;margin-bottom:10px;letter-spacing:-.01em}
  .muted{color:var(--muted)}
  .stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:10px}
  .stat{border:1px solid var(--line);border-radius:10px;padding:16px 18px}
  .stat b{font-size:1.5rem;display:block}
  .stat span{font-size:.85rem;color:var(--muted)}
  ul.plain{list-style:none}
  ul.plain li{padding:8px 0 8px 26px;position:relative;border-bottom:1px solid var(--line);font-size:.94rem}
  ul.plain li:last-child{border-bottom:none}
  li.ok::before{content:'✓';position:absolute;left:2px;color:var(--good);font-weight:700}
  li.todo::before{content:'→';position:absolute;left:0;color:var(--warn);font-weight:700}
  .hint{display:block;font-size:.82rem;color:var(--muted)}
  .keywords{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .keywords span{background:#ecfdf5;color:#065f46;border-radius:100px;padding:5px 13px;font-size:.85rem}
  .note{background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:14px 18px;font-size:.88rem;color:var(--muted);margin-top:12px}
  footer{padding:24px 52px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
  @media (max-width:640px){.band,main,footer{padding-left:24px;padding-right:24px}.stat-row{grid-template-columns:1fr}}
  @media print{body{background:#fff;padding:0}.sheet{border:none;border-radius:0}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="band">
      <p class="from">Search &amp; AI visibility report · ${esc(monthName)} · prepared by ${esc(a.name)}</p>
      <h1>${esc(lead.name)}</h1>
      <p>${esc(titleCase(lead.category))}${cityLine ? ' · ' + esc(cityLine) : ''}</p>
    </div>
    <main>
      <section>
        <h2>At a glance</h2>
        <div class="stat-row">
          <div class="stat"><b>${done.length}/${checklist.length}</b><span>search &amp; AI optimizations in place on the site</span></div>
          <div class="stat"><b>${keywords.length}</b><span>local search phrases the site targets</span></div>
          <div class="stat"><b>${reviews.length ? `${esc(avgRating)}★` : '—'}</b><span>${reviews.length ? `average across ${reviews.length} customer review${reviews.length === 1 ? '' : 's'} on the site` : 'no customer reviews on the site yet'}</span></div>
        </div>
        <p class="note">This report shows the verifiable state of your web presence and this month's plan. We don't invent traffic or ranking numbers — when you connect Google Business Profile and Search Console, their real dashboards complete the picture.</p>
      </section>

      <section>
        <h2>Search phrases we target</h2>
        <p class="muted">Woven through your page titles, headings, and copy so Google and AI assistants connect you to these searches:</p>
        <div class="keywords">${keywords.slice(0, 8).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
      </section>

      <section>
        <h2>AI-assistant readiness (AEO)</h2>
        <p class="muted">More customers now ask ChatGPT, Claude, or voice assistants for recommendations. Your site speaks their language:</p>
        <ul class="plain">
          ${aeoRows.map((c) => `<li class="${c.ok ? 'ok' : 'todo'}">${esc(c.label)}</li>`).join('\n          ')}
        </ul>
      </section>

      ${todo.length ? `<section>
        <h2>Open items we're working through</h2>
        <ul class="plain">
          ${todo.map((c) => `<li class="todo">${esc(c.label)}</li>`).join('\n          ')}
        </ul>
      </section>` : ''}

      <section>
        <h2>This month's plan</h2>
        <ul class="plain">
          ${plan.map((p) => `<li class="todo">${esc(p)}</li>`).join('\n          ')}
        </ul>
      </section>

      <section>
        <h2>Google Business Profile checklist</h2>
        <ul class="plain">
          ${gbpChecklist(lead).map((g) => `<li class="todo">${esc(g.label)}<span class="hint">${esc(g.hint)}</span></li>`).join('\n          ')}
        </ul>
      </section>
    </main>
    <footer>
      Prepared for ${esc(lead.name)} by ${esc(a.name)}${a.email ? ' · ' + esc(a.email) : ''}${a.phone ? ' · ' + esc(a.phone) : ''}.
      <br>Care plan${pricing.monthly ? ` (${esc(formatMoney(pricing.monthly, pricing.currency))}/month)` : ''}: hosting, updates, this report, and the work in it.
    </footer>
  </div>
</body>
</html>`;
}
