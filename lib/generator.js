// Website generator: turns an enriched lead into a complete, self-contained,
// responsive single-page website (inline CSS, no external assets) ready to
// preview, download, or host anywhere.
import crypto from 'node:crypto';

const THEMES = {
  warm: {
    name: 'Warm & Inviting',
    bg: '#fffaf3', surface: '#ffffff', ink: '#2d1b0e', muted: '#7a6a5b',
    primary: '#c2410c', primaryInk: '#ffffff', accent: '#f59e0b',
    heroBg: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 55%, #ea580c 100%)',
    heroInk: '#fff7ed', font: "Georgia, 'Times New Roman', serif",
    headingFont: "Georgia, 'Times New Roman', serif", radius: '14px',
  },
  elegant: {
    name: 'Elegant & Refined',
    bg: '#faf9f7', surface: '#ffffff', ink: '#1c1917', muted: '#78716c',
    primary: '#831843', primaryInk: '#ffffff', accent: '#b45309',
    heroBg: 'linear-gradient(135deg, #1c1917 0%, #44403c 60%, #831843 130%)',
    heroInk: '#faf5f0', font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    headingFont: "Georgia, 'Times New Roman', serif", radius: '4px',
  },
  bold: {
    name: 'Bold & Confident',
    bg: '#f8fafc', surface: '#ffffff', ink: '#0f172a', muted: '#64748b',
    primary: '#1d4ed8', primaryInk: '#ffffff', accent: '#f97316',
    heroBg: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)',
    heroInk: '#eff6ff', font: "'Segoe UI', system-ui, -apple-system, sans-serif",
    headingFont: "'Segoe UI', system-ui, -apple-system, sans-serif", radius: '12px',
  },
  clean: {
    name: 'Clean & Professional',
    bg: '#f9fafb', surface: '#ffffff', ink: '#111827', muted: '#6b7280',
    primary: '#0f766e', primaryInk: '#ffffff', accent: '#0ea5e9',
    heroBg: 'linear-gradient(135deg, #134e4a 0%, #0f766e 60%, #0d9488 100%)',
    heroInk: '#f0fdfa', font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    headingFont: "system-ui, -apple-system, 'Segoe UI', sans-serif", radius: '10px',
  },
};

export const THEME_KEYS = Object.keys(THEMES);

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const telHref = (phone) => 'tel:' + String(phone).replace(/[^\d+]/g, '');

// Decorative inline-SVG hero pattern so the page needs no external images.
function heroPattern() {
  return `<svg class="hero-art" viewBox="0 0 600 600" aria-hidden="true">
    <circle cx="470" cy="130" r="160" fill="rgba(255,255,255,0.07)"/>
    <circle cx="470" cy="130" r="110" fill="rgba(255,255,255,0.07)"/>
    <circle cx="120" cy="500" r="200" fill="rgba(255,255,255,0.05)"/>
    <path d="M0 420 Q150 340 300 400 T600 380 V600 H0 Z" fill="rgba(255,255,255,0.06)"/>
  </svg>`;
}

function serviceIcon(i) {
  const icons = [
    '<path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 7.1-1.01z"/>',
    '<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M12 21s-7.5-4.9-9.5-9A5.6 5.6 0 0 1 12 6.2 5.6 5.6 0 0 1 21.5 12c-2 4.1-9.5 9-9.5 9z"/>',
    '<rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2"/>',
    '<path d="M13 2L4.5 12.5H11L10 22l8.5-10.5H12L13 2z"/>',
  ];
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[i % icons.length]}</svg>`;
}

export function generateSiteHtml(lead, profile, themeKey) {
  const theme = THEMES[themeKey] || THEMES[profile.theme] || THEMES.clean;
  const name = esc(lead.name);
  const tagline = esc(profile.tagline);
  const cityLine = [lead.city, lead.state].filter(Boolean).join(', ');
  const hours = profile.hoursHuman || null;
  const mapLink = lead.lat && lead.lon
    ? `https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lon}#map=17/${lead.lat}/${lead.lon}`
    : lead.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(lead.address)}` : null;

  const navLinks = [
    ['#about', 'About'],
    ['#services', 'Services'],
    hours ? ['#hours', 'Hours'] : null,
    ['#contact', 'Contact'],
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${name}${cityLine ? ' — ' + esc(cityLine) : ''}. ${tagline}">
<title>${name}${cityLine ? ' | ' + esc(cityLine) : ''}</title>
<style>
  :root{
    --bg:${theme.bg};--surface:${theme.surface};--ink:${theme.ink};--muted:${theme.muted};
    --primary:${theme.primary};--primary-ink:${theme.primaryInk};--accent:${theme.accent};--radius:${theme.radius};
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:${theme.font};color:var(--ink);background:var(--bg);line-height:1.65}
  h1,h2,h3{font-family:${theme.headingFont};line-height:1.15}
  a{color:var(--primary)}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}

  header{position:sticky;top:0;z-index:50;background:var(--surface);border-bottom:1px solid rgba(0,0,0,.08);box-shadow:0 1px 12px rgba(0,0,0,.05)}
  .nav{display:flex;align-items:center;justify-content:space-between;height:68px}
  .brand{font-family:${theme.headingFont};font-weight:700;font-size:1.25rem;color:var(--ink);text-decoration:none;letter-spacing:.2px}
  .brand span{color:var(--primary)}
  nav.links{display:flex;gap:26px;align-items:center}
  nav.links a{color:var(--muted);text-decoration:none;font-size:.95rem;font-weight:500}
  nav.links a:hover{color:var(--primary)}
  .btn{display:inline-block;background:var(--primary);color:var(--primary-ink);padding:12px 26px;border-radius:var(--radius);text-decoration:none;font-weight:600;font-size:.98rem;border:2px solid transparent;transition:transform .15s ease,box-shadow .15s ease}
  .btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.18)}
  .btn.ghost{background:transparent;color:inherit;border-color:currentColor}
  nav.links .btn{padding:9px 20px}

  .hero{position:relative;overflow:hidden;background:${theme.heroBg};color:${theme.heroInk};padding:110px 0 120px;text-align:left}
  .hero-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
  .hero .wrap{position:relative}
  .kicker{display:inline-block;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;opacity:.85;margin-bottom:18px;font-weight:600}
  .hero h1{font-size:clamp(2.4rem,6vw,4rem);margin-bottom:18px}
  .hero p.lead{font-size:clamp(1.05rem,2.2vw,1.35rem);max-width:620px;opacity:.92;margin-bottom:34px}
  .hero .actions{display:flex;gap:14px;flex-wrap:wrap}

  section{padding:84px 0}
  .section-head{max-width:640px;margin-bottom:44px}
  .eyebrow{color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:.8rem}
  section h2{font-size:clamp(1.7rem,3.5vw,2.4rem);margin:8px 0 14px}
  .muted{color:var(--muted)}

  .about-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:48px;align-items:start}
  .fact-card{background:var(--surface);border:1px solid rgba(0,0,0,.07);border-radius:var(--radius);padding:26px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
  .fact-card h3{font-size:1.02rem;margin-bottom:14px;color:var(--primary)}
  .fact-card ul{list-style:none}
  .fact-card li{padding:9px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.95rem;display:flex;gap:10px}
  .fact-card li:last-child{border-bottom:none}
  .fact-card li b{min-width:74px;color:var(--muted);font-weight:600}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px}
  .card{background:var(--surface);border:1px solid rgba(0,0,0,.07);border-radius:var(--radius);padding:28px;box-shadow:0 4px 18px rgba(0,0,0,.05);transition:transform .15s ease}
  .card:hover{transform:translateY(-4px)}
  .card .icon{width:44px;height:44px;border-radius:12px;background:color-mix(in srgb,var(--primary) 12%, transparent);color:var(--primary);display:grid;place-items:center;margin-bottom:16px}
  .card .icon svg{width:22px;height:22px}
  .card h3{font-size:1.08rem;margin-bottom:8px}
  .card p{font-size:.94rem;color:var(--muted)}

  .values{background:var(--surface);border-top:1px solid rgba(0,0,0,.06);border-bottom:1px solid rgba(0,0,0,.06)}
  .values .cards .card{background:var(--bg);box-shadow:none}

  .hours-table{background:var(--surface);border:1px solid rgba(0,0,0,.07);border-radius:var(--radius);overflow:hidden;max-width:560px}
  .hours-table div{display:flex;justify-content:space-between;gap:20px;padding:14px 22px;border-bottom:1px solid rgba(0,0,0,.06);font-size:.97rem}
  .hours-table div:last-child{border-bottom:none}
  .hours-table div:nth-child(odd){background:color-mix(in srgb,var(--primary) 4%, transparent)}

  .contact-band{background:${theme.heroBg};color:${theme.heroInk};border-radius:calc(var(--radius) * 1.5);padding:56px 48px;display:grid;grid-template-columns:1.1fr .9fr;gap:44px;position:relative;overflow:hidden}
  .contact-band h2{color:inherit}
  .contact-list{list-style:none;display:grid;gap:16px;margin-top:22px}
  .contact-list li{display:flex;gap:14px;align-items:flex-start;font-size:1.02rem}
  .contact-list svg{width:21px;height:21px;flex:none;margin-top:3px;opacity:.85}
  .contact-list a{color:inherit;font-weight:600}
  .cta-panel{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:var(--radius);padding:30px;align-self:center}
  .cta-panel h3{margin-bottom:10px;font-size:1.25rem}
  .cta-panel p{opacity:.9;font-size:.96rem;margin-bottom:20px}

  footer{padding:34px 0;text-align:center;color:var(--muted);font-size:.88rem}

  @media (max-width:760px){
    nav.links a:not(.btn){display:none}
    .about-grid,.contact-band{grid-template-columns:1fr}
    .hero{padding:80px 0 90px}
    section{padding:60px 0}
    .contact-band{padding:38px 26px}
  }
</style>
</head>
<body>
<header>
  <div class="wrap nav">
    <a class="brand" href="#top">${brandify(name)}</a>
    <nav class="links">
      ${navLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n      ')}
      ${lead.phone ? `<a class="btn" href="${telHref(lead.phone)}">Call Now</a>` : `<a class="btn" href="#contact">${esc(profile.heroCta)}</a>`}
    </nav>
  </div>
</header>

<section class="hero" id="top">
  ${heroPattern()}
  <div class="wrap">
    <span class="kicker">${esc(titleCase(lead.category))}${cityLine ? ' · ' + esc(cityLine) : ''}</span>
    <h1>${name}</h1>
    <p class="lead">${tagline}</p>
    <div class="actions">
      ${lead.phone ? `<a class="btn" href="${telHref(lead.phone)}">Call ${esc(lead.phone)}</a>` : ''}
      <a class="btn ghost" href="#services">${esc(profile.heroCta)}</a>
    </div>
  </div>
</section>

<section id="about">
  <div class="wrap about-grid">
    <div>
      <div class="section-head">
        <span class="eyebrow">About Us</span>
        <h2>Welcome to ${name}</h2>
      </div>
      <p style="font-size:1.08rem">${esc(profile.about)}</p>
    </div>
    <aside class="fact-card">
      <h3>At a Glance</h3>
      <ul>
        <li><b>Type</b><span>${esc(titleCase(lead.category))}${lead.cuisine ? ' · ' + esc(titleCase(lead.cuisine)) : ''}</span></li>
        ${cityLine ? `<li><b>Area</b><span>${esc(cityLine)}</span></li>` : ''}
        ${lead.address ? `<li><b>Address</b><span>${esc(lead.address)}</span></li>` : ''}
        ${lead.phone ? `<li><b>Phone</b><span>${esc(lead.phone)}</span></li>` : ''}
        ${lead.email ? `<li><b>Email</b><span>${esc(lead.email)}</span></li>` : ''}
      </ul>
    </aside>
  </div>
</section>

<section id="services" style="padding-top:0">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">What We Offer</span>
      <h2>Our Services</h2>
      <p class="muted">Everything we do comes with the same promise: quality work and honest service.</p>
    </div>
    <div class="cards">
      ${profile.services.map((s, i) => `<div class="card">
        <div class="icon">${serviceIcon(i)}</div>
        <h3>${esc(s)}</h3>
        <p>Ask us about ${esc(String(s).toLowerCase())} — we're happy to walk you through options and pricing.</p>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="values">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Why Choose Us</span>
      <h2>What Sets Us Apart</h2>
    </div>
    <div class="cards">
      ${profile.values.map(([title, desc], i) => `<div class="card">
        <div class="icon">${serviceIcon(i + 3)}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>

${hours ? `<section id="hours">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Visit Us</span>
      <h2>Opening Hours</h2>
    </div>
    <div class="hours-table">
      ${hours.map((line) => {
        const [d, t] = splitHoursLine(line);
        return `<div><span>${esc(d)}</span><strong>${esc(t)}</strong></div>`;
      }).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section id="contact" ${hours ? 'style="padding-top:0"' : ''}>
  <div class="wrap">
    <div class="contact-band">
      <div>
        <span class="eyebrow" style="color:inherit;opacity:.8">Get in Touch</span>
        <h2>We'd Love to Hear From You</h2>
        <ul class="contact-list">
          ${lead.phone ? `<li>${icon('phone')}<span><a href="${telHref(lead.phone)}">${esc(lead.phone)}</a></span></li>` : ''}
          ${lead.email ? `<li>${icon('mail')}<span><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span></li>` : ''}
          ${lead.address ? `<li>${icon('pin')}<span>${esc(lead.address)}${mapLink ? ` · <a href="${esc(mapLink)}" target="_blank" rel="noopener">View map</a>` : ''}</span></li>` : ''}
          ${!lead.phone && !lead.email && !lead.address ? `<li>${icon('pin')}<span>Serving ${esc(cityLine || 'the local community')} — stop by and say hello.</span></li>` : ''}
        </ul>
      </div>
      <div class="cta-panel">
        <h3>${esc(profile.heroCta)}</h3>
        <p>${lead.phone ? 'One quick call is all it takes to get started.' : 'Reach out today — we respond fast.'}</p>
        ${lead.phone
          ? `<a class="btn" style="background:#fff;color:var(--primary)" href="${telHref(lead.phone)}">Call ${esc(lead.phone)}</a>`
          : lead.email
            ? `<a class="btn" style="background:#fff;color:var(--primary)" href="mailto:${esc(lead.email)}">Email Us</a>`
            : `<a class="btn" style="background:#fff;color:var(--primary)" href="#top">Back to Top</a>`}
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <p>&copy; ${new Date().getFullYear()} ${name}. All rights reserved.</p>
  </div>
</footer>
</body>
</html>`;
}

function titleCase(s = '') {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Highlight the last word of the brand in the primary color.
function brandify(escapedName) {
  const words = escapedName.split(' ');
  if (words.length === 1) return escapedName;
  const last = words.pop();
  return `${words.join(' ')} <span>${last}</span>`;
}

function splitHoursLine(line) {
  const idx = line.indexOf(': ');
  return idx > 0 ? [line.slice(0, idx), line.slice(idx + 2)] : [line, ''];
}

function icon(kind) {
  const paths = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" fill="none" stroke="currentColor" stroke-width="2"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m22 7-10 6L2 7" fill="none" stroke="currentColor" stroke-width="2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]}</svg>`;
}

export function newSiteId() {
  return 'site_' + crypto.randomBytes(6).toString('hex');
}
