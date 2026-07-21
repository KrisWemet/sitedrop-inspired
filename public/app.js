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
  if (hash.startsWith('#/autopilot')) return renderAutopilot();
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
  let lead, providers = {}, pricing = {}, billing = {};
  try {
    ({ lead, providers, pricing, billing } = await api('/api/leads/' + id));
  } catch (err) {
    view.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
    return;
  }
  let site = null, publishConfigured = false;
  if (lead.siteId) {
    try { ({ site, publishConfigured } = await api('/api/sites/' + lead.siteId)); } catch { /* site file may be gone */ }
  }
  drawLead(lead, { site, publishConfigured, providers, pricing, billing });
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
        ${/@(\w+\.)?(example\.(com|org|net)|test|invalid)$/i.test(lead.email || '') ? `<div class="notice" style="margin:0 0 12px">⚠ This email looks like placeholder data — it is automatically stripped from the live site and schema so it can't ship broken. Get a real address before going live.</div>` : ''}
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

    <div class="panel" style="margin-top:22px" id="photosPanel">
      <h3>Photos ${lead.images?.length ? `<span class="tag">${lead.images.length} attached</span>` : ''}</h3>
      <p style="color:var(--muted);font-size:0.92rem">Previews can use licensed stock and the storefront photo from the business's Google listing. <b>Live sites ship only client uploads and licensed stock</b> — Google photos are stripped automatically at publish.</p>
      ${lead.images?.length ? `<div class="img-grid">
        ${lead.images.map((img) => `
          <div class="img-card">
            <img src="/api/leads/${lead.id}/images/${img.id}/raw" alt="${esc(img.alt || '')}">
            <div class="img-meta">
              <span class="badge ${img.source === 'client' ? 'ok' : img.source === 'places' ? 'demo' : 'status-contacted'}">${img.source === 'places' ? 'Google · preview only' : img.source}</span>
              <button class="btn small ghost" data-img-del="${img.id}">✕</button>
            </div>
          </div>`).join('')}
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <label class="btn small secondary" style="cursor:pointer">📁 Upload client photos
          <input type="file" id="imgUpload" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
        </label>
        <button class="btn small secondary" id="stockBtn" title="${opts.providers?.pexels ? 'Pexels library (API key set)' : 'CC0 public-domain photos via Openverse — no key needed; set PEXELS_API_KEY for the bigger Pexels library'}">🖼 Browse stock photos</button>
        <button class="btn small secondary" id="aiBtn" title="Bespoke photography generated with the free Pollinations Flux API — interiors and detail shots matched to the industry, no key needed">✨ Generate AI photos</button>
        <button class="btn small secondary" id="storefrontBtn" ${opts.providers?.places && lead.source !== 'demo' ? '' : 'disabled title="Set GOOGLE_PLACES_API_KEY (demo leads have no real storefront)"'}>📍 Get storefront from Google</button>
      </div>
      <div id="stockPicker"></div>
      ${lead.images?.length ? '<p class="hint" style="margin-top:10px">Regenerate the website below to weave the photos in.</p>' : ''}
    </div>

    <div class="panel" style="margin-top:22px" id="genPanel">
      <h3>Website Generator ${lead.siteId ? '<span class="tag">site generated</span>' : ''}</h3>
      <p style="color:var(--muted);font-size:0.92rem">Build a complete, responsive one-page website from the gathered data. Pick a theme and generate — the preview appears below.</p>
      <div class="theme-row" id="themeRow">
        ${['warm', 'elegant', 'bold', 'clean'].map((t) => `
          <button class="theme-chip ${((opts.theme || e?.theme || 'clean') === t) ? 'selected' : ''}" data-theme="${t}">${cap(t)}</button>`).join('')}
      </div>
      <details class="conv-box" ${(lead.cta?.bookingUrl || lead.cta?.formEndpoint) ? 'open' : ''}>
        <summary>Lead capture — booking link &amp; contact form</summary>
        <p class="hint" style="margin:8px 0">Turn the "${esc(e?.heroCta || 'Get in touch')}" button into a real booking link, and add a working contact form. Both stay JavaScript-free. Regenerate after saving.</p>
        <div class="field"><label>Booking link (Calendly, Cal.com, Square…)</label><input id="bookingUrl" placeholder="https://calendly.com/your-business" value="${esc(lead.cta?.bookingUrl || '')}"></div>
        <div class="field" style="margin-top:10px"><label>Contact-form endpoint (Formspree, Basin, Web3Forms…)</label><input id="formEndpoint" placeholder="https://formspree.io/f/xxxxxxx" value="${esc(lead.cta?.formEndpoint || '')}"></div>
        <div class="field" style="margin-top:10px"><label>Google review link (for the review funnel — from the business's Google profile "Ask for reviews")</label><input id="googleReviewUrl" placeholder="https://g.page/r/xxxx/review" value="${esc(lead.cta?.googleReviewUrl || '')}"></div>
        <button class="btn small ghost" id="ctaSaveBtn" style="margin-top:10px">Save lead-capture settings</button>
      </details>
      <details class="conv-box" ${(lead.reviews?.length) ? 'open' : ''}>
        <summary>Customer reviews — testimonials &amp; star rating (${(lead.reviews || []).length})</summary>
        <p class="hint" style="margin:8px 0">Add <strong>real</strong> reviews only — copy them from the business's Google/Facebook listing or from messages the owner has permission to share. These render as a testimonials section with a star rating and feed the site's Review schema. Never invent a review; a fabricated testimonial is illegal and a fake-star manual-action risk. Regenerate after saving.</p>
        <div id="reviewRows">${(lead.reviews || []).map((r, i) => reviewRowHtml(r, i)).join('')}</div>
        <button class="btn small ghost" id="reviewAddBtn" style="margin-top:8px">+ Add review</button>
        <button class="btn small" id="reviewSaveBtn" style="margin-top:8px">Save reviews</button>
      </details>
      <button class="btn" id="genBtn" style="margin-top:14px">⚡ ${lead.siteId ? 'Regenerate Website' : 'Generate Website'}</button>
      <div id="seoArea">${opts.site?.seoChecklist ? seoChecklistHtml(opts.site) : ''}</div>
      <div id="previewArea">${lead.siteId ? previewHtml(lead.siteId, opts.site, opts.publishConfigured) : ''}</div>
    </div>

    <div class="panel" style="margin-top:22px" id="outreachPanel">
      <h3>Outreach ${lead.outreach ? `<span class="tag">${lead.outreach.source === 'claude' ? 'AI-written' : 'drafted'}</span>` : ''}</h3>
      ${lead.outreach ? outreachHtml(lead) : `
        <p style="color:var(--muted);font-size:0.92rem">Draft a personalized pitch email for this business — references their missing website, AI-search invisibility, and the preview link. ${lead.siteId ? '' : 'Generates the website first if needed.'}</p>
        <button class="btn accent" id="outreachBtn" style="margin-top:10px">✉️ Draft Pitch Email</button>
      `}
    </div>

    <div class="panel" style="margin-top:22px" id="billingPanel">
      ${billingHtml(lead, opts)}
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

  document.getElementById('imgUpload')?.addEventListener('change', async (ev) => {
    for (const file of ev.target.files) {
      const dataBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      try {
        await post(`/api/leads/${lead.id}/images`, { filename: file.name, contentType: file.type, dataBase64 });
      } catch (err) { alert(`Upload of ${file.name} failed: ` + err.message); }
    }
    renderLead(lead.id);
  });

  document.getElementById('stockBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    try {
      const { candidates } = await api(`/api/leads/${lead.id}/images/stock`);
      document.getElementById('stockPicker').innerHTML = candidates.length ? `
        <p class="hint" style="margin:14px 0 8px">Pick the photos that fit — all licensed for commercial use (${esc(candidates[0].license || 'stock license')}):</p>
        <div class="img-grid">
          ${candidates.map((c) => `
            <div class="img-card img-pick" data-pick="${esc(c.candidateId)}" title="${esc(c.query)}">
              <img src="${esc(c.thumb)}" alt="${esc(c.query)}">
              <div class="img-meta"><span class="hint">${esc(c.photographer || '')}</span></div>
            </div>`).join('')}
        </div>` : '<p class="hint">No results. Try again later.</p>';
      document.querySelectorAll('[data-pick]').forEach((card) => card.addEventListener('click', async () => {
        card.style.opacity = '0.4';
        try {
          await post(`/api/leads/${lead.id}/images/stock`, { candidateId: card.dataset.pick });
          renderLead(lead.id);
        } catch (err) { alert('Could not attach photo: ' + err.message); card.style.opacity = '1'; }
      }));
    } catch (err) { alert('Stock search failed: ' + err.message); }
    btn.disabled = false;
    btn.textContent = '🖼 Browse stock photos';
  });

  document.getElementById('aiBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating (can take a minute)…';
    try {
      await post(`/api/leads/${lead.id}/images/ai`, {});
      renderLead(lead.id);
    } catch (err) {
      alert('AI photo generation failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = '✨ Generate AI photos';
    }
  });

  document.getElementById('storefrontBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Fetching…';
    try {
      await post(`/api/leads/${lead.id}/images/storefront`);
      renderLead(lead.id);
    } catch (err) {
      alert('Storefront fetch failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = '📍 Get storefront from Google';
    }
  });

  view.querySelectorAll('[data-img-del]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/leads/${lead.id}/images/${b.dataset.imgDel}`, { method: 'DELETE' });
    renderLead(lead.id);
  }));

  document.getElementById('ctaSaveBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.textContent = 'Saving…';
    try {
      await patch(`/api/leads/${lead.id}`, {
        cta: {
          bookingUrl: document.getElementById('bookingUrl').value.trim(),
          formEndpoint: document.getElementById('formEndpoint').value.trim(),
          googleReviewUrl: document.getElementById('googleReviewUrl').value.trim(),
        },
      });
      btn.textContent = '✓ Saved — regenerate to apply';
      setTimeout(() => { const b = document.getElementById('ctaSaveBtn'); if (b) b.textContent = 'Save lead-capture settings'; }, 2500);
    } catch (err) {
      btn.textContent = 'Save lead-capture settings';
      alert('Could not save: ' + err.message);
    }
  });

  document.getElementById('reviewAddBtn')?.addEventListener('click', () => {
    const rows = document.getElementById('reviewRows');
    rows.insertAdjacentHTML('beforeend', reviewRowHtml({ rating: 5 }, rows.children.length));
    rows.querySelectorAll('[data-review-del]').forEach(bindReviewDelete);
  });
  document.querySelectorAll('[data-review-del]').forEach(bindReviewDelete);

  document.getElementById('reviewSaveBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.textContent = 'Saving…';
    const reviews = [...document.querySelectorAll('#reviewRows .review-row')].map((row) => ({
      author: row.querySelector('[data-f=author]').value.trim(),
      rating: Number(row.querySelector('[data-f=rating]').value),
      text: row.querySelector('[data-f=text]').value.trim(),
      source: row.querySelector('[data-f=source]').value.trim(),
    })).filter((r) => r.author && r.text);
    try {
      await patch(`/api/leads/${lead.id}`, { reviews });
      btn.textContent = '✓ Saved — regenerate to apply';
      setTimeout(() => renderLead(lead.id), 900);
    } catch (err) {
      btn.textContent = 'Save reviews';
      alert('Could not save reviews: ' + err.message);
    }
  });

  document.getElementById('proposalBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      await post(`/api/leads/${lead.id}/proposal`);
      renderLead(lead.id);
    } catch (err) { btn.disabled = false; alert('Proposal failed: ' + err.message); }
  });

  document.getElementById('copyProposalBtn')?.addEventListener('click', async (ev) => {
    await navigator.clipboard.writeText(location.origin + ev.currentTarget.dataset.url);
    ev.currentTarget.textContent = '✓ Copied';
    setTimeout(() => { const b = document.getElementById('copyProposalBtn'); if (b) b.textContent = 'Copy link'; }, 1500);
  });

  document.getElementById('voiceBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      const r = await post(`/api/leads/${lead.id}/voice-agent`);
      if (r?.note) setTimeout(() => alert(r.note), 50);
      renderLead(lead.id);
    } catch (err) { btn.disabled = false; alert('Voice agent failed: ' + err.message); }
  });

  document.getElementById('seoReportBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      await post(`/api/leads/${lead.id}/seo-report`);
      renderLead(lead.id);
    } catch (err) { btn.disabled = false; alert('SEO report failed: ' + err.message); }
  });

  document.getElementById('createClientBtn')?.addEventListener('click', async () => {
    const setup = Number(document.getElementById('setupAmt').value);
    const monthly = Number(document.getElementById('monthlyAmt').value);
    try {
      await post(`/api/leads/${lead.id}/client`, { setup, monthly });
      renderLead(lead.id);
    } catch (err) { alert('Could not start care plan: ' + err.message); }
  });

  view.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> Issuing…';
    try {
      const { url } = await post(`/api/leads/${lead.id}/invoice`, { kind: b.dataset.invoice });
      window.open(url, '_blank');
      renderLead(lead.id);
    } catch (err) { b.disabled = false; alert('Invoice failed: ' + err.message); }
  }));

  view.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post(`/api/invoices/${b.dataset.pay}/paid`);
      renderLead(lead.id);
    } catch (err) { alert('Could not mark paid: ' + err.message); }
  }));

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
      <li><b>Services</b><span>${e.services.map((s) => esc(typeof s === 'string' ? s : s.name)).join(' · ')}</span></li>
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

function reviewRowHtml(r = {}, i = 0) {
  const stars = [5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(r.rating) === n ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('');
  return `<div class="review-row" data-i="${i}">
    <div class="review-row-top">
      <input data-f="author" placeholder="Customer name" value="${esc(r.author || '')}">
      <select data-f="rating">${stars}</select>
      <input data-f="source" placeholder="Source (Google…)" value="${esc(r.source || '')}">
      <button class="btn small ghost" data-review-del title="Remove">✕</button>
    </div>
    <textarea data-f="text" rows="2" placeholder="What the customer wrote (their real words)">${esc(r.text || '')}</textarea>
  </div>`;
}
function bindReviewDelete(btn) {
  btn.addEventListener('click', () => btn.closest('.review-row')?.remove());
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

function money(cur, amount) {
  const sym = { USD: '$', CAD: '$', AUD: '$', EUR: '€', GBP: '£' }[cur] || '';
  return `${sym}${Number(amount || 0).toLocaleString('en-US')}${sym ? '' : ' ' + (cur || '')}`;
}

function billingHtml(lead, opts) {
  const pricing = opts.pricing || {};
  const client = opts.billing?.client || null;
  const invoices = opts.billing?.invoices || [];
  const proposalUrl = lead.proposal ? `/proposals/${lead.proposal.token}.html` : null;
  const cur = client?.currency || pricing.currency || 'USD';

  const proposalBlock = `
    <h3>Proposal &amp; Billing</h3>
    ${!pricing.configured ? `<div class="notice" style="margin:8px 0">Set <code>AGENCY_NAME</code> (and optionally AGENCY_EMAIL/PHONE/ADDRESS, PRICE_SETUP, PRICE_MONTHLY) so proposals and invoices carry your details. Using placeholders for now.</div>` : ''}
    <p style="color:var(--muted);font-size:0.92rem">A private proposal page — from ${esc(pricing.agency?.name || 'your studio')} to ${esc(lead.name)} — with the live preview link and clear ${money(cur, pricing.setup)} + ${money(cur, pricing.monthly)}/mo pricing.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn small ${proposalUrl ? 'secondary' : 'accent'}" id="proposalBtn">${proposalUrl ? '↻ Rebuild proposal' : '📄 Build proposal'}</button>
      ${proposalUrl ? `<a class="btn small secondary" href="${proposalUrl}" target="_blank" rel="noopener">Open proposal ↗</a>
      <button class="btn small ghost" id="copyProposalBtn" data-url="${proposalUrl}">Copy link</button>` : ''}
    </div>`;

  // The care plan / invoicing only appears once the lead is actually won —
  // you should never be able to bill a business that hasn't agreed.
  let planBlock;
  if (lead.status !== 'won') {
    planBlock = `<p class="hint" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">Mark this lead <b>won</b> (top of page) to start a care plan and issue invoices. Billing is deliberately locked until then.</p>`;
  } else if (!client) {
    planBlock = `
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
        <h3 style="font-size:0.98rem">Start the care plan</h3>
        <p class="hint">Confirm the amounts you agreed with the client — these get frozen onto every invoice.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-top:10px">
          <div class="field"><label>One-time build (${esc(cur)})</label><input id="setupAmt" type="number" min="0" value="${esc(pricing.setup)}" style="width:130px"></div>
          <div class="field"><label>Monthly (${esc(cur)})</label><input id="monthlyAmt" type="number" min="0" value="${esc(pricing.monthly)}" style="width:110px"></div>
          <button class="btn" id="createClientBtn">Start care plan</button>
        </div>
      </div>`;
  } else {
    const invRows = invoices.length ? invoices.map((iv) => `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:0.9rem">
        <span>#${iv.number} · ${iv.kind === 'retainer' ? 'Retainer' : 'Setup'} · ${money(iv.currency, iv.total)}</span>
        <span style="display:flex;gap:8px;align-items:center">
          ${iv.paidAt ? '<span class="badge ok">paid</span>' : `<button class="btn small accent" data-pay="${iv.number}">Mark paid</button>`}
          <a class="btn small secondary" href="/invoices/${iv.token}.html" target="_blank" rel="noopener">Open ↗</a>
        </span>
      </div>`).join('') : '<p class="hint">No invoices yet.</p>';
    planBlock = `
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
        <h3 style="font-size:0.98rem">Care plan <span class="badge ${client.status === 'active' ? 'ok' : 'demo'}">${esc(client.status)}</span></h3>
        <p class="hint">${money(cur, client.setup)} setup · ${money(cur, client.monthly)}/mo · next retainer ${client.nextRetainerAt ? new Date(client.nextRetainerAt).toLocaleDateString() : '—'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
          <button class="btn small secondary" data-invoice="setup">🧾 Issue setup invoice</button>
          <button class="btn small secondary" data-invoice="retainer">🔁 Issue this month's retainer</button>
        </div>
        ${invRows}
      </div>`;
  }
  // Upsell deliverables — available once a site exists, independent of the
  // sales stage. Each is one click and fully built (see notes on keys).
  const voiceUrl = lead.voiceAgent ? `/voice/${lead.voiceAgent.token}.html` : null;
  const reportUrl = lead.seoReport ? `/reports/${lead.seoReport.token}.html` : null;
  const upsellBlock = lead.siteId ? `
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
      <h3 style="font-size:0.98rem">Premium upsells</h3>
      <p class="hint">One-click add-ons that turn a $2k site into a $5k package. Each is built from this business's real data.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn small ${voiceUrl ? 'secondary' : 'accent'}" id="voiceBtn">${voiceUrl ? '↻ Rebuild voice agent' : '☎️ Voice agent'}</button>
        ${voiceUrl ? `<a class="btn small secondary" href="${voiceUrl}" target="_blank" rel="noopener">Config pack ↗</a>` : ''}
        <button class="btn small ${reportUrl ? 'secondary' : 'accent'}" id="seoReportBtn">${reportUrl ? '↻ Rebuild SEO report' : '📈 SEO/AEO report'}</button>
        ${reportUrl ? `<a class="btn small secondary" href="${reportUrl}" target="_blank" rel="noopener">Open report ↗</a>` : ''}
      </div>
      <p class="hint" style="margin-top:8px">Voice agent: keyless mode delivers a paste-ready config pack; set <code>VAPI_API_KEY</code> to provision a live phone assistant in one click.</p>
    </div>` : '';

  return proposalBlock + upsellBlock + planBlock;
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

// ---------- autopilot ----------
async function renderAutopilot() {
  view.innerHTML = '<div class="empty"><p>Loading autopilot…</p></div>';
  let s;
  try {
    s = await api('/api/autopilot');
  } catch (err) {
    view.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
    return;
  }

  const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Autopilot</h1>
        <p>Campaigns run unattended — search, verify, enrich, build the site, draft the pitch. You just review and send.</p>
      </div>
      <button class="btn secondary" id="digestBtn">📬 Send digest now</button>
    </div>

    <div class="stats">
      <div class="stat"><div class="n">${s.campaigns.filter((c) => c.enabled).length}</div><div class="l">Active campaigns</div></div>
      <div class="stat"><div class="n">${s.caps.generationsToday}/${s.caps.dailyGenerations}</div><div class="l">Sites generated today</div></div>
      <div class="stat"><div class="n">${s.caps.leadsPerRun}</div><div class="l">Leads worked per run</div></div>
      <div class="stat"><div class="n">${s.tickMinutes}m</div><div class="l">Scheduler tick</div></div>
    </div>

    ${!s.mailer.configured ? `<div class="notice">Digest email is in dry-run: ${esc(s.mailer.hint || '')} ${s.digestTo ? '' : 'Also set DIGEST_TO (your address).'} Autopilot still runs — activity just stays in this dashboard.</div>` : `<p class="hint">Daily digest → ${esc(s.digestTo)} at ${s.digestHour}:00 · last sent ${fmtWhen(s.lastDigestAt)}</p>`}
    ${!s.baseUrl ? `<p class="hint" style="margin-top:8px">Tip: set BASE_URL to your hosted dashboard URL so drafted pitches contain shareable preview links.</p>` : ''}

    <div class="panel" style="margin-top:20px">
      <h3>New Campaign</h3>
      <form class="search-form" id="campForm" style="margin-top:14px">
        <div class="field"><label>Business type</label><input id="cq" placeholder="e.g. plumber" required></div>
        <div class="field"><label>City / area (real location)</label><input id="cloc" placeholder="e.g. Asheville, NC" required></div>
        <div class="field"><label>Every</label>
          <select id="cint"><option value="24" selected>24 h</option><option value="12">12 h</option><option value="48">48 h</option><option value="168">Weekly</option></select>
        </div>
        <button class="btn" id="campBtn" type="submit">Create</button>
      </form>
      <p class="hint">Campaigns are geocoded once at creation and use live OpenStreetMap data only — never demo data. Nothing is ever emailed to a prospect automatically.</p>
    </div>

    <div style="margin-top:20px" id="campList">
      ${s.campaigns.length ? s.campaigns.map((c) => `
        <div class="panel" style="margin-bottom:12px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center">
          <div>
            <strong style="text-transform:capitalize">${esc(c.query)}</strong> <span class="muted">near</span> ${esc(c.location)}
            <span class="badge ${c.enabled ? 'ok' : 'demo'}" style="margin-left:8px">${c.enabled ? 'active' : 'paused'}</span>
            <div class="hint" style="margin-top:6px">
              every ${c.intervalHours}h · next run ${fmtWhen(c.nextRunAt)}
              ${c.lastRun ? ` · last: ${c.lastRun.error ? '<span style="color:var(--hot)">failed — ' + esc(c.lastRun.error) + '</span>' : esc(`${c.lastRun.found} found, ${c.lastRun.generated} sites, ${c.lastRun.drafted} drafts`)}` : ' · never run'}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn small secondary" data-run="${c.id}">Run now</button>
            <button class="btn small ghost" data-toggle="${c.id}" data-en="${c.enabled}">${c.enabled ? 'Pause' : 'Resume'}</button>
            <button class="btn small ghost" data-del="${c.id}">Delete</button>
          </div>
        </div>`).join('') : '<div class="empty"><h3>No campaigns yet</h3><p>Create one above — it runs on the next scheduler tick.</p></div>'}
    </div>

    <div class="panel" style="margin-top:20px">
      <h3>Activity</h3>
      <ul class="datapoints" style="margin-top:10px">
        ${s.activity.length ? s.activity.slice(0, 40).map((a) => `
          <li class="${a.kind === 'campaign-failed' ? 'hot' : ''}">
            <span class="muted">${fmtWhen(a.at)}</span> — ${esc(a.detail)}
            ${a.leadId ? ` · <a href="#/lead/${a.leadId}">open lead</a>` : ''}
          </li>`).join('') : '<li>No activity yet.</li>'}
      </ul>
    </div>`;

  document.getElementById('campForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('campBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await post('/api/campaigns', {
        query: document.getElementById('cq').value,
        location: document.getElementById('cloc').value,
        intervalHours: Number(document.getElementById('cint').value),
      });
      renderAutopilot();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Create';
      alert('Could not create campaign: ' + err.message);
    }
  });

  document.getElementById('digestBtn').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'Sending…';
    try {
      const { sent, preview } = await post('/api/autopilot/digest');
      alert((sent.dryRun || sent.skipped ? 'Digest (dry run — mailer not configured):\n\n' : 'Digest sent!\n\n') + preview.text.slice(0, 1200));
      renderAutopilot();
    } catch (err) { alert('Digest failed: ' + err.message); renderAutopilot(); }
  });

  view.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> Running…';
    try {
      await post(`/api/campaigns/${b.dataset.run}/run`);
    } catch (err) { alert('Run failed: ' + err.message); }
    renderAutopilot();
  }));
  view.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    await patch(`/api/campaigns/${b.dataset.toggle}`, { enabled: b.dataset.en !== 'true' });
    renderAutopilot();
  }));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this campaign? Its leads stay in the Lead Finder.')) return;
    await api(`/api/campaigns/${b.dataset.del}`, { method: 'DELETE' });
    renderAutopilot();
  }));
}

route();
