// SiteSpark dashboard — vanilla-JS SPA with hash routing.
const view = document.getElementById('view');

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const cap = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const post = (path, body) => api(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});
const patch = (path, body) => api(path, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

const STATUSES = ['new', 'contacted', 'pitched', 'won', 'lost'];
const statusBadge = (s) => `<span class="badge status-${s || 'new'}">${cap(s || 'new')}</span>`;

const VERIFY_LABELS = {
  'verified-no-website': ['✓ Verified: no website', 'hot'],
  'dead-site': ['✓ Site is dead — hot', 'hot'],
  'social-only': ['✓ Social page only — hot', 'hot'],
  'possible-site-found': ['⚠ Possible site found', 'demo'],
  'confirmed-live': ['✓ Site confirmed live', 'ok'],
  'demo-simulated': ['Demo — simulated', 'demo'],
};
const verifyBadge = (v) => {
  if (!v) return '';
  const [label, cls] = VERIFY_LABELS[v.outcome] || [v.outcome, 'demo'];
  return `<span class="badge ${cls}" title="${esc(v.detail)}">${label}</span>`;
};

let lastSearch = null; // { leads, stats, notice, source, location, query, loc }

// ---------- routing ----------
function route() {
  const hash = location.hash || '#/leads';
  const m = hash.match(/^#\/lead\/([\w-]+)/);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', hash.startsWith('#/' + a.dataset.nav));
  });
  if (m) return renderLead(m[1]);
  if (hash.startsWith('#/sites')) return renderSites();
  return renderLeads();
}
window.addEventListener('hashchange', route);

// ---------- lead finder ----------
function renderLeads() {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Lead Finder</h1>
        <p>Search a niche and a city. Businesses with no website get flagged 🔥 and sorted to the top.</p>
      </div>
    </div>
    <div class="panel">
      <form class="search-form" id="searchForm">
        <div class="field">
          <label for="q">Business type</label>
          <input id="q" placeholder="e.g. plumber, restaurant, hair salon" required value="${esc(lastSearch?.query || '')}">
        </div>
        <div class="field">
          <label for="loc">City / area</label>
          <input id="loc" placeholder='e.g. "Asheville, NC" — or "demo" for sample data' value="${esc(lastSearch?.loc || '')}">
        </div>
        <div class="field">
          <label for="radius">Radius</label>
          <select id="radius">
            <option value="3">3 km</option>
            <option value="5" selected>5 km</option>
            <option value="10">10 km</option>
            <option value="20">20 km</option>
          </select>
        </div>
        <button class="btn" id="searchBtn" type="submit">Search</button>
      </form>
      <p class="hint">Live results come from OpenStreetMap. No network? Type <code>demo</code> as the location for a bundled sample dataset.</p>
    </div>
    <div id="results"></div>`;

  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('searchBtn');
    const query = document.getElementById('q').value.trim();
    const loc = document.getElementById('loc').value.trim();
    const radiusKm = Number(document.getElementById('radius').value);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    document.getElementById('results').innerHTML = '<div class="empty"><p>Pulling businesses off the map…</p></div>';
    try {
      const data = await post('/api/search', { query, location: loc, radiusKm });
      lastSearch = { ...data, query, loc };
      renderResults(data);
    } catch (err) {
      document.getElementById('results').innerHTML = `<div class="notice">Search failed: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Search';
    }
  });

  if (lastSearch) renderResults(lastSearch);
  else loadExistingLeads();
}

async function loadExistingLeads() {
  try {
    const { leads } = await api('/api/leads');
    if (leads.length) {
      renderResults({
        leads,
        stats: {
          total: leads.length,
          noWebsite: leads.filter((l) => !l.hasWebsite).length,
          withPhone: leads.filter((l) => l.phone).length,
        },
        notice: null,
        source: null,
        savedHeading: true,
      });
    }
  } catch { /* fresh install, nothing saved yet */ }
}

function renderResults({ leads, stats, notice, source, location, savedHeading }) {
  const el = document.getElementById('results');
  if (!el) return;
  if (!leads.length) {
    el.innerHTML = `<div class="empty"><h3>No businesses found</h3><p>Try a broader category or a bigger radius.</p></div>`;
    return;
  }
  el.innerHTML = `
    ${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="n">${stats.total}</div><div class="l">${savedHeading ? 'Saved leads' : 'Businesses found'}</div></div>
      <div class="stat hot"><div class="n">${stats.noWebsite}</div><div class="l">🔥 No website</div></div>
      <div class="stat"><div class="n">${stats.withPhone}</div><div class="l">With phone number</div></div>
    </div>
    ${location ? `<p class="hint" style="margin:0 0 14px">Area: ${esc(location.displayName)}</p>` : ''}
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <a class="btn small ghost" href="/api/leads.csv" download>⤓ Export all leads (CSV)</a>
    </div>
    <div class="table-wrap">
      <table class="leads">
        <thead><tr>
          <th>Business</th><th>Website</th><th>Status</th><th>Phone</th><th>Score</th><th></th>
        </tr></thead>
        <tbody>
          ${leads.map(leadRow).join('')}
        </tbody>
      </table>
    </div>`;
}

function leadRow(l) {
  return `<tr>
    <td>
      <div class="biz-name">${esc(l.name)} ${l.source === 'demo' ? '<span class="badge demo">demo</span>' : ''}</div>
      <div class="biz-cat">${esc(l.category)}${l.cuisine ? ' · ' + esc(l.cuisine) : ''}</div>
    </td>
    <td>${l.hasWebsite
      ? `<span class="badge ok">Has site</span>`
      : `<span class="badge hot">🔥 No website</span>`}
      ${l.verification ? '<br>' + verifyBadge(l.verification) : ''}</td>
    <td>${statusBadge(l.status)}${l.siteId ? ' <span class="badge demo" title="Website generated">⚡ site</span>' : ''}</td>
    <td>${l.phone ? esc(l.phone) : '<span style="color:var(--muted)">—</span>'}</td>
    <td><span class="score-bar"><i style="width:${l.score}%"></i></span>${l.score}</td>
    <td>
      <div class="row-actions">
        <a class="btn small secondary" href="#/lead/${l.id}">Open lead</a>
      </div>
    </td>
  </tr>`;
}

// ---------- lead detail ----------
async function renderLead(id) {
  view.innerHTML = '<div class="empty"><p>Loading lead…</p></div>';
  let lead;
  try {
    ({ lead } = await api('/api/leads/' + id));
  } catch (err) {
    view.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
    return;
  }
  let site = null, publishConfigured = false;
  if (lead.siteId) {
    try { ({ site, publishConfigured } = await api('/api/sites/' + lead.siteId)); } catch { /* site file may be gone */ }
  }
  drawLead(lead, { site, publishConfigured });
}

function drawLead(lead, opts = {}) {
  const e = lead.enrichment;
  view.innerHTML = `
    <a class="back-link" href="#/leads">← Back to leads</a>
    <div class="page-head">
      <div>
        <h1>${esc(lead.name)}</h1>
        <p style="text-transform:capitalize">${esc(lead.category)}${lead.cuisine ? ' · ' + esc(lead.cuisine) : ''}${lead.city ? ' · ' + esc(lead.city) + (lead.state ? ', ' + esc(lead.state) : '') : ''}</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="color:var(--muted);font-size:0.85rem;font-weight:600">Pipeline:</label>
        <select id="statusSel" class="status-select">
          ${STATUSES.map((s) => `<option value="${s}" ${lead.status === s ? 'selected' : ''}>${cap(s)}</option>`).join('')}
        </select>
        ${lead.hasWebsite
          ? `<span class="badge ok">Already has a website</span>`
          : `<span class="badge hot" style="font-size:0.9rem;padding:8px 16px">🔥 No website — hot prospect</span>`}
      </div>
    </div>

    <div class="detail-grid">
      <div class="panel">
        <h3>Contact & Raw Data</h3>
        <ul class="kv">
          <li><b>Phone</b><span>${esc(lead.phone || 'Not listed')}</span></li>
          <li><b>Email</b><span>${esc(lead.email || 'Not listed')}</span></li>
          <li><b>Address</b><span>${esc(lead.address || 'Not listed')}</span></li>
          <li><b>Hours</b><span>${esc(lead.openingHours || 'Not listed')}</span></li>
          <li><b>Website</b><span>${lead.website ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(lead.website)}</a>` : 'None found'}</span></li>
          <li><b>Source</b><span>${lead.source === 'demo' ? 'Demo dataset (fictional)' : 'OpenStreetMap (' + esc(lead.osmRef || 'live') + ')'}</span></li>
          <li><b>Lead score</b><span>${lead.score}/100</span></li>
        </ul>
        <div class="verify-box" id="verifyBox">
          ${lead.verification ? `
            <div style="margin-bottom:6px">${verifyBadge(lead.verification)}</div>
            <p class="hint" style="margin:0">${esc(lead.verification.detail)}</p>
            ${lead.verification.foundUrl ? `<p class="hint" style="margin:6px 0 0"><a href="${esc(lead.verification.foundUrl)}" target="_blank" rel="noopener">${esc(lead.verification.foundUrl)}</a></p>` : ''}
            <button class="btn small ghost" id="verifyBtn" style="margin-top:10px">Re-verify</button>
          ` : `
            <p class="hint" style="margin:0 0 10px">The no-website flag comes from map data. Verify it before pitching — checks the listed site is alive (or social-only) and probes likely domains.</p>
            <button class="btn small secondary" id="verifyBtn">🔎 Verify web presence</button>
          `}
        </div>
        <h3 style="margin-top:20px">Notes</h3>
        <textarea id="notesBox" class="notes-box" placeholder="Call notes, decision maker's name, follow-up date…">${esc(lead.notes || '')}</textarea>
        <button class="btn small ghost" id="notesBtn" style="margin-top:8px">Save notes</button>
      </div>

      <div class="panel" id="enrichPanel">
        ${e ? enrichedHtml(e) : `
          <h3>Prospect Profile</h3>
          <div class="empty" style="padding:34px 10px">
            <h3>Not gathered yet</h3>
            <p>Compile contact intel, industry positioning, and ready-to-use website copy for this business.</p>
            <br>
            <button class="btn accent" id="enrichBtn">🧠 Gather Information</button>
          </div>`}
      </div>
    </div>

    <div class="panel" style="margin-top:22px" id="genPanel">
      <h3>Website Generator ${lead.siteId ? '<span class="tag">site generated</span>' : ''}</h3>
      <p style="color:var(--muted);font-size:0.92rem">Build a complete, responsive one-page website from the gathered data. Pick a theme and generate — the preview appears below.</p>
      <div class="theme-row" id="themeRow">
        ${['warm', 'elegant', 'bold', 'clean'].map((t) => `
          <button class="theme-chip ${((opts.theme || e?.theme || 'clean') === t) ? 'selected' : ''}" data-theme="${t}">${cap(t)}</button>`).join('')}
      </div>
      <button class="btn" id="genBtn">⚡ ${lead.siteId ? 'Regenerate Website' : 'Generate Website'}</button>
      <div id="seoArea">${opts.site?.seoChecklist ? seoChecklistHtml(opts.site) : ''}</div>
      <div id="previewArea">${lead.siteId ? previewHtml(lead.siteId, opts.site, opts.publishConfigured) : ''}</div>
    </div>

    <div class="panel" style="margin-top:22px" id="outreachPanel">
      <h3>Outreach ${lead.outreach ? `<span class="tag">${lead.outreach.source === 'claude' ? 'AI-written' : 'drafted'}</span>` : ''}</h3>
      ${lead.outreach ? outreachHtml(lead) : `
        <p style="color:var(--muted);font-size:0.92rem">Draft a personalized pitch email for this business — references their missing website, AI-search invisibility, and the preview link. ${lead.siteId ? '' : 'Generates the website first if needed.'}</p>
        <button class="btn accent" id="outreachBtn" style="margin-top:10px">✉️ Draft Pitch Email</button>
      `}
    </div>`;

  const enrichBtn = document.getElementById('enrichBtn');
  if (enrichBtn) enrichBtn.addEventListener('click', () => enrich(lead.id));

  document.getElementById('verifyBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying…';
    try {
      const { lead: fresh } = await post(`/api/leads/${lead.id}/verify`);
      drawLead(fresh, opts);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🔎 Verify web presence';
      alert('Verification failed: ' + err.message);
    }
  });

  document.getElementById('statusSel')?.addEventListener('change', async (ev) => {
    try {
      await patch(`/api/leads/${lead.id}`, { status: ev.target.value });
    } catch (err) { alert('Could not save status: ' + err.message); }
  });

  document.getElementById('notesBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.textContent = 'Saving…';
    try {
      await patch(`/api/leads/${lead.id}`, { notes: document.getElementById('notesBox').value });
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.textContent = 'Save notes'; }, 1500);
    } catch (err) {
      btn.textContent = 'Save notes';
      alert('Could not save notes: ' + err.message);
    }
  });

  document.getElementById('outreachBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Drafting…';
    try {
      const { lead: fresh } = await post(`/api/leads/${lead.id}/outreach`);
      drawLead(fresh, opts);
      document.getElementById('outreachPanel')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '✉️ Draft Pitch Email';
      alert('Outreach draft failed: ' + err.message);
    }
  });

  document.getElementById('publishBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Publishing…';
    try {
      const { site } = await post(`/api/sites/${btn.dataset.site}/publish`);
      const { lead: fresh } = await api('/api/leads/' + lead.id);
      drawLead(fresh, { ...opts, site, publishConfigured: true });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🚀 Publish live';
      alert('Publish failed: ' + err.message);
    }
  });

  document.getElementById('copyEmailBtn')?.addEventListener('click', async (ev) => {
    const o = lead.outreach;
    await navigator.clipboard.writeText(`Subject: ${o.subject}\n\n${o.body}`);
    ev.currentTarget.textContent = '✓ Copied';
    setTimeout(() => { document.getElementById('copyEmailBtn').textContent = 'Copy email'; }, 1500);
  });

  document.getElementById('redraftBtn')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'Redrafting…';
    try {
      const { lead: fresh } = await post(`/api/leads/${lead.id}/outreach`);
      drawLead(fresh, opts);
    } catch (err) { alert('Redraft failed: ' + err.message); }
  });

  let theme = opts.theme || e?.theme || 'clean';
  document.querySelectorAll('.theme-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      theme = chip.dataset.theme;
      document.querySelectorAll('.theme-chip').forEach((c) => c.classList.toggle('selected', c === chip));
    });
  });

  document.getElementById('genBtn').addEventListener('click', async () => {
    const btn = document.getElementById('genBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building site…';
    try {
      const { site } = await post(`/api/leads/${lead.id}/generate`, { theme });
      const { lead: fresh } = await api('/api/leads/' + lead.id);
      drawLead(fresh, { theme: site.theme, site });
      document.getElementById('seoArea')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '⚡ Generate Website';
      alert('Generation failed: ' + err.message);
    }
  });
}

function enrichedHtml(e) {
  return `
    <h3>Prospect Profile <span class="tag">${e.copySource === 'claude' ? 'AI copy (Claude)' : 'gathered'}</span></h3>
    <ul class="kv" style="margin-bottom:14px">
      <li><b>Industry</b><span style="text-transform:capitalize">${esc(e.industry)}</span></li>
      <li><b>Tagline</b><span>“${esc(e.tagline)}”</span></li>
      <li><b>About</b><span>${esc(e.about)}</span></li>
      <li><b>Services</b><span>${e.services.map(esc).join(' · ')}</span></li>
    </ul>
    <h3 style="margin-top:18px">Gathered Data Points</h3>
    <ul class="datapoints">
      ${e.dataPoints.map((d) => `<li class="${d.includes('NO WEBSITE') ? 'hot' : ''}">${esc(d)}</li>`).join('')}
    </ul>`;
}

async function enrich(id) {
  const btn = document.getElementById('enrichBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gathering…';
  try {
    const { lead } = await post(`/api/leads/${id}/enrich`);
    drawLead(lead);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '🧠 Gather Information';
    alert('Enrichment failed: ' + err.message);
  }
}

function previewHtml(siteId, site, publishConfigured) {
  const url = `/sites/${siteId}.html`;
  const published = site?.published;
  return `
    ${published ? `<div class="notice" style="background:var(--ok-soft);border-color:rgba(46,204,113,0.35);color:var(--ok)">🌐 Live at <a href="${esc(published.url)}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">${esc(published.url)}</a> — outreach drafts now use this URL.</div>` : ''}
    <div class="preview-bar">
      <span class="url">${published ? esc(published.url) : location.origin + url}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn small secondary" href="${url}" target="_blank" rel="noopener">Open full tab ↗</a>
        <a class="btn small ghost" href="${url}?download" download>Download HTML</a>
        <a class="btn small ghost" href="/sites/${siteId}/pack.zip" download title="index.html + robots.txt + sitemap.xml + llms.txt">⤓ Deploy pack</a>
        <button class="btn small accent" id="publishBtn" data-site="${siteId}" title="${publishConfigured ? 'Deploy to Vercel — the prospect gets a real URL' : 'Set VERCEL_TOKEN to enable one-click publishing'}">${published ? '↻ Republish' : '🚀 Publish live'}</button>
      </span>
    </div>
    <iframe class="preview-frame" src="${url}" title="Generated website preview"></iframe>`;
}

function seoChecklistHtml(site) {
  const items = site.seoChecklist || [];
  const okCount = items.filter((i) => i.ok).length;
  return `
    <div class="seo-panel">
      <div class="seo-head">
        <strong>SEO &amp; AI-optimization report</strong>
        <span class="badge ok">${okCount}/${items.length} baked in</span>
      </div>
      <ul class="seo-list">
        ${items.map((i) => `<li class="${i.ok ? 'ok' : 'miss'}">${i.ok ? '✓' : '✗'} ${esc(i.label)}</li>`).join('')}
      </ul>
      <p class="hint" style="margin:10px 0 0">Title: <em>${esc(site.title || '')}</em><br>Keywords targeted: ${(site.keywords || []).map(esc).join(' · ')}</p>
    </div>`;
}

function outreachHtml(lead) {
  const o = lead.outreach;
  const mailto = lead.email
    ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(o.body)}`
    : null;
  return `
    <ul class="kv" style="margin-bottom:12px">
      <li><b>Subject</b><span>${esc(o.subject)}</span></li>
    </ul>
    <textarea class="notes-box" style="min-height:260px" readonly>${esc(o.body)}</textarea>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn small secondary" id="copyEmailBtn">Copy email</button>
      ${mailto ? `<a class="btn small accent" href="${mailto}">Open in email app (${esc(lead.email)})</a>` : '<span class="hint" style="align-self:center">No email on file — copy and send via your own channel.</span>'}
      <button class="btn small ghost" id="redraftBtn">↻ Redraft</button>
    </div>
    <p class="hint" style="margin-top:10px">The preview link points at this local server — replace it with your hosted URL (deploy pack ↑) before sending.</p>`;
}

// ---------- sites gallery ----------
async function renderSites() {
  view.innerHTML = '<div class="empty"><p>Loading sites…</p></div>';
  let sites = [];
  try {
    ({ sites } = await api('/api/sites'));
  } catch { /* ignore */ }

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Generated Sites</h1>
        <p>Every website you've built, ready to preview, download, and pitch.</p>
      </div>
    </div>
    ${sites.length ? `<div class="sites-grid">
      ${sites.map((s) => `
        <div class="site-card">
          <iframe src="/sites/${s.id}.html" loading="lazy" scrolling="no" tabindex="-1" title="${esc(s.businessName)} preview"></iframe>
          <div class="body">
            <h3>${esc(s.businessName)}</h3>
            <div class="meta">${esc(s.category)}${s.city ? ' · ' + esc(s.city) : ''} · ${esc(s.theme)} theme · ${(s.bytes / 1024).toFixed(0)} KB</div>
            ${s.seoChecklist ? `<div class="meta">SEO/AEO: ${s.seoChecklist.filter((i) => i.ok).length}/${s.seoChecklist.length} optimizations</div>` : ''}
            ${s.published ? `<div class="meta">🌐 <a href="${esc(s.published.url)}" target="_blank" rel="noopener">${esc(s.published.url.replace('https://', ''))}</a></div>` : ''}
            <div class="actions">
              <a class="btn small secondary" href="/sites/${s.id}.html" target="_blank" rel="noopener">Open ↗</a>
              <a class="btn small ghost" href="/sites/${s.id}/pack.zip" download>Deploy pack</a>
              <a class="btn small ghost" href="#/lead/${s.leadId}">Lead</a>
            </div>
          </div>
        </div>`).join('')}
    </div>` : `
    <div class="empty">
      <h3>No sites generated yet</h3>
      <p>Find a lead without a website and hit <b>Generate Website</b>.</p>
      <br><a class="btn" href="#/leads">Go to Lead Finder</a>
    </div>`}`;
}

route();
