// Website generator: turns an enriched lead into a complete, self-contained,
// responsive single-page website (inline CSS, no external assets, no JS).
//
// Architecture: one set of section renderers driven by a per-theme "recipe"
// (hero composition, services layout, brand treatment, type/spacing tokens)
// plus a seeded intra-theme layout variation — so four themes yield many
// distinct-looking sites while esc() discipline and the SEO/JSON-LD head
// stay in exactly one code path for every theme.
import crypto from 'node:crypto';
import { buildMetaTags, buildJsonLd, buildFaqs, keywordSet, seoChecklist } from './seo.js';
import { serviceName } from './enrich.js';

// ---------- themes: tokens + layout recipe ----------
const THEMES = {
  warm: {
    name: 'Warm & Inviting',
    // Neither cream/beige (the default AI surface) nor terracotta: a
    // blush-rose paper that leans toward the burgundy accent.
    bg: '#f9f0ee', surface: '#fffbfa', ink: '#2a1c19', muted: '#6e5c56',
    primary: '#6d222f', primaryInk: '#f9ecd8', accent: '#a97e28',
    heroBg: 'linear-gradient(155deg, #401319 0%, #61202c 55%, #7a2b39 100%)',
    heroInk: '#f7ecd9',
    display: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, ui-serif, serif",
    body: "Seravek, 'Gill Sans', 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif",
    radius: '10px', displayWeight: 700, displaySpacing: '-0.01em',
    oldstyleNums: true, dropCap: true, grain: true, cardHover: false,
    recipe: { hero: 'centered', services: ['menu', 'twocol'], values: 'statements-dash', brand: 'amp' },
  },
  elegant: {
    name: 'Elegant & Refined',
    bg: '#faf9f7', surface: '#ffffff', ink: '#1c1917', muted: '#655f58',
    primary: '#7c2247', primaryInk: '#ffffff', accent: '#a16207',
    heroBg: 'linear-gradient(160deg, #171412 0%, #3d3733 55%, #6b1e3e 135%)',
    heroInk: '#f7f2ec',
    display: "Didot, 'Bodoni MT', 'Playfair Display', 'Times New Roman', ui-serif, serif",
    body: "'Helvetica Neue', Helvetica, Arial, ui-sans-serif, sans-serif",
    radius: '2px', displayWeight: 500, displaySpacing: '0.01em',
    oldstyleNums: true, dropCap: true, grain: true, cardHover: false, rule: true,
    recipe: { hero: 'split', services: ['twocol', 'menu'], values: 'columns', brand: 'smallcaps' },
  },
  bold: {
    name: 'Bold & Confident',
    bg: '#f6f8fb', surface: '#ffffff', ink: '#0c1220', muted: '#5b6577',
    primary: '#1740c4', primaryInk: '#ffffff', accent: '#ea580c',
    heroBg: 'linear-gradient(135deg, #0b1120 0%, #172c66 55%, #1740c4 110%)',
    heroInk: '#edf2ff',
    display: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
    body: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
    radius: '4px', displayWeight: 800, displaySpacing: '-0.03em',
    oldstyleNums: false, dropCap: false, grain: false, cardHover: true, upperCta: true, cardStrong: true,
    recipe: { hero: 'diagonal', services: ['cards', 'menu'], values: 'statements-highlight', brand: 'first' },
  },
  clean: {
    name: 'Clean & Professional',
    bg: '#fafbfb', surface: '#ffffff', ink: '#101828', muted: '#667085',
    primary: '#0c6e64', primaryInk: '#ffffff', accent: '#0e7490',
    heroBg: '#ffffff',
    heroInk: '#101828',
    display: "ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif",
    body: "'Segoe UI', system-ui, -apple-system, sans-serif",
    radius: '12px', displayWeight: 700, displaySpacing: '-0.02em',
    oldstyleNums: false, dropCap: false, grain: false, cardHover: true,
    recipe: { hero: 'minimal', services: ['cards', 'twocol'], values: 'checklist', brand: 'dot' },
  },
};

export const THEME_KEYS = Object.keys(THEMES);

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const telHref = (phone) => 'tel:' + String(phone).replace(/[^\d+]/g, '');
const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- industry motif art (abstract, currentColor, zero assets) ----------
function industryGroup(industry) {
  if (['restaurant', 'cafe', 'bakery'].includes(industry)) return 'food';
  if (industry === 'salon') return 'flow';
  if (['trades', 'auto'].includes(industry)) return 'grid';
  if (industry === 'health') return 'calm';
  if (industry === 'fitness') return 'pulse';
  return 'field'; // retail / professional / hospitality / generic
}

// Abstract line-work per group. Deliberately NOT illustrative (no clip-art
// whisks): large, quiet geometry that reads as art direction, not decoration.
const MOTIFS = {
  food: `
    <circle cx="500" cy="120" r="170" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".18"/>
    <circle cx="500" cy="120" r="128" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".13"/>
    <circle cx="500" cy="120" r="86" fill="currentColor" opacity=".06"/>
    <path d="M-40 470 C 120 400, 240 520, 400 452 S 640 420, 660 430" fill="none" stroke="currentColor" stroke-width="2" opacity=".14"/>
    <path d="M-40 510 C 120 440, 250 556, 410 490 S 650 460, 670 470" fill="none" stroke="currentColor" stroke-width="2" opacity=".09"/>`,
  flow: `
    <path d="M420 -40 C 380 140, 560 220, 500 400 S 350 560, 420 660" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".16"/>
    <path d="M480 -40 C 440 150, 620 230, 560 410 S 410 570, 480 660" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".12"/>
    <path d="M540 -40 C 500 160, 680 240, 620 420 S 470 580, 540 660" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".08"/>
    <circle cx="140" cy="480" r="90" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".12"/>
    <circle cx="140" cy="480" r="60" fill="currentColor" opacity=".05"/>`,
  grid: `
    <g opacity=".13" stroke="currentColor" stroke-width="2">
      <path d="M340 -40 L 700 320"/><path d="M400 -40 L 700 260"/><path d="M460 -40 L 700 200"/>
      <path d="M280 -40 L 700 380"/><path d="M220 -40 L 700 440"/>
    </g>
    <rect x="70" y="290" width="120" height="120" fill="none" stroke="currentColor" stroke-width="2" opacity=".16" transform="rotate(12 130 350)"/>
    <rect x="110" y="330" width="120" height="120" fill="none" stroke="currentColor" stroke-width="2" opacity=".09" transform="rotate(12 170 390)"/>`,
  calm: `
    <circle cx="490" cy="150" r="150" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".14"/>
    <circle cx="490" cy="150" r="110" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".11"/>
    <circle cx="490" cy="150" r="70" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".08"/>
    <g fill="currentColor" opacity=".14">
      ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) =>
        `<circle cx="${60 + c * 34}" cy="${420 + r * 34}" r="2.5"/>`).join('')).join('')}
    </g>`,
  pulse: `
    <g fill="none" stroke="currentColor" stroke-width="3" opacity=".15">
      <path d="M380 520 L 470 430 L 560 520"/>
      <path d="M380 460 L 470 370 L 560 460"/>
      <path d="M380 400 L 470 310 L 560 400"/>
    </g>
    <path d="M-40 180 L 120 180 L 170 120 L 230 240 L 280 180 L 660 180" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".14"/>`,
  field: `
    <g fill="currentColor" opacity=".13">
      ${Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) =>
        `<circle cx="${400 + c * 40}" cy="${60 + r * 40}" r="2.5"/>`).join('')).join('')}
    </g>
    <circle cx="150" cy="490" r="120" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".14"/>
    <path d="M40 490 A 110 110 0 0 1 260 490" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".1"/>`,
};

function motifSvg(industry, extraClass = '') {
  return `<svg class="motif ${extraClass}" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${MOTIFS[industryGroup(industry)]}</svg>`;
}

// ---------- brand treatment (varies per theme — the same trick on every
// site is a tell) ----------
function renderBrand(name, brand) {
  const words = name.split(' ');
  switch (brand) {
    case 'amp': {
      if (words.length === 1) return name;
      const last = words.pop();
      return `${words.join(' ')} <span>${last}</span>`;
    }
    case 'smallcaps':
      return `<span class="brand-caps">${name}</span>`;
    case 'first': {
      if (words.length === 1) return name;
      const first = words.shift();
      return `<span>${first}</span> ${words.join(' ')}`;
    }
    case 'dot':
    default:
      // Underline accent instead of a trailing period — the period read as
      // a typo when the h1 and footer didn't repeat it.
      return `<span class="brand-underline">${name}</span>`;
  }
}

// ---------- section renderers ----------

function renderNav(ctx) {
  const { lead, profile, theme } = ctx;
  const links = [
    ['#about', 'About'],
    ['#services', 'Services'],
    ctx.hours ? ['#hours', 'Hours'] : null,
    ['#faq', 'FAQ'],
    ['#contact', 'Contact'],
  ].filter(Boolean);
  return `<header>
  <div class="wrap nav">
    <a class="brand" href="#top">${renderBrand(esc(lead.name), theme.recipe.brand)}</a>
    <nav class="links" aria-label="Site">
      ${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n      ')}
      ${lead.phone ? `<a class="btn" href="${telHref(lead.phone)}">Call Now</a>` : `<a class="btn" href="#contact">${esc(profile.heroCta)}</a>`}
    </nav>
  </div>
</header>`;
}

function heroInner(ctx) {
  const { lead, profile } = ctx;
  // No uppercase tracked eyebrow chip (the default AI hero shape) — the
  // local-SEO phrase runs as one normal-case line under the h1 instead.
  return {
    kicker: `<p class="locale-line">${esc(titleCase(lead.category))}${ctx.cityLine ? ' in ' + esc(ctx.cityLine) : ''}</p>`,
    h1: esc(lead.name),
    lead: esc(profile.tagline),
    actions: `<div class="actions">
      ${lead.phone ? `<a class="btn" href="${telHref(lead.phone)}">Call ${esc(lead.phone)}</a>` : ''}
      <a class="btn ghost" href="#services">${esc(profile.heroCta)}</a>
    </div>`,
  };
}

function renderHero(ctx) {
  const { profile, theme } = ctx;
  const inner = heroInner(ctx);
  const motif = motifSvg(profile.industry);

  switch (theme.recipe.hero) {
    case 'split':
      // No framed panel (reads as a missing photo) — a full-bleed cropped
      // motif and an oversized low-opacity monogram own the right half.
      return `<section class="hero hero-split" id="top" aria-label="Introduction">
  <div class="hero-side" aria-hidden="true">
    ${motif}
    <span class="monogram">${esc(ctx.lead.name.trim()[0] || '')}</span>
  </div>
  <div class="wrap hero-grid">
    <div>
      <h1>${inner.h1}</h1>
      ${inner.kicker}
      <p class="lead">${inner.lead}</p>
      ${inner.actions}
      ${ctx.amenities.length ? `<ul class="chip-list hero-chips">${ctx.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>
    <div></div>
  </div>
</section>`;
    case 'diagonal':
      return `<section class="hero hero-diagonal" id="top" aria-label="Introduction">
  ${motif}
  <div class="wrap">
    <h1>${inner.h1}</h1>
    ${inner.kicker}
    <p class="lead">${inner.lead}</p>
    ${inner.actions}
  </div>
  <div class="diagonal-cut" aria-hidden="true"></div>
</section>`;
    case 'minimal':
      return `<section class="hero hero-minimal" id="top" aria-label="Introduction">
  ${motif}
  <div class="wrap">
    <h1>${inner.h1}</h1>
    ${inner.kicker}
    <p class="lead">${inner.lead}</p>
    ${inner.actions}
  </div>
</section>`;
    case 'centered':
    default:
      return `<section class="hero hero-centered" id="top" aria-label="Introduction">
  ${motif}
  <div class="wrap">
    <h1>${inner.h1}</h1>
    ${inner.kicker}
    <p class="lead">${inner.lead}</p>
    ${inner.actions}
  </div>
</section>`;
  }
}

function renderAbout(ctx) {
  const { lead, profile } = ctx;
  return `<section id="about" aria-labelledby="about-h">
  <div class="wrap about-grid">
    <div>
      <div class="section-head">
        <h2 id="about-h">Welcome to ${esc(lead.name)}</h2>
      </div>
      <p id="about-text" class="about-copy">${esc(profile.about)}</p>
      ${ctx.cityLine ? `<p class="muted about-local">Proudly serving ${esc(ctx.cityLine)} and surrounding communities.</p>` : ''}
      ${ctx.amenities.length && ctx.theme.recipe.hero !== 'split' ? `<ul class="chip-list">${ctx.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>
    <aside class="fact-card">
      <h3>At a Glance</h3>
      <ul>
        <li><b>Type</b><span>${esc(titleCase(lead.category))}${lead.cuisine ? ' · ' + esc(titleCase(lead.cuisine)) : ''}</span></li>
        ${ctx.cityLine ? `<li><b>Area</b><span>${esc(ctx.cityLine)}</span></li>` : ''}
        ${lead.address ? `<li><b>Address</b><span>${esc(lead.address)}</span></li>` : ''}
        ${lead.phone ? `<li><b>Phone</b><span>${esc(lead.phone)}</span></li>` : ''}
        ${lead.email ? `<li><b>Email</b><span>${esc(lead.email)}</span></li>` : ''}
      </ul>
    </aside>
  </div>
</section>`;
}

function renderServices(ctx) {
  const { lead, profile } = ctx;
  const services = profile.services.map((s) => ({
    name: serviceName(s),
    desc: typeof s === 'string' ? '' : s.desc || '',
  }));
  const head = `<div class="section-head">
      <h2 id="services-h">${esc(titleCase(lead.category))} Services${lead.city ? ' in ' + esc(lead.city) : ''}</h2>
      <p class="muted">${esc(profile.headings.servicesIntro)}</p>
    </div>`;

  let body;
  if (ctx.servicesLayout === 'menu') {
    // Dot-leader menu list — the idiom every local business already lives in.
    body = `<ul class="svc-menu">
      ${services.map((s) => `<li>
        <div class="svc-line"><h3>${esc(s.name)}</h3><span class="leader" aria-hidden="true"></span></div>
        ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
      </li>`).join('\n      ')}
    </ul>`;
  } else if (ctx.servicesLayout === 'twocol') {
    body = `<div class="svc-twocol">
      ${services.map((s) => `<div class="svc-item">
        <h3>${esc(s.name)}</h3>${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
      </div>`).join('\n      ')}
    </div>`;
  } else {
    // No decorative icons: arbitrary icon-to-label mapping (a heart for
    // "Inspections") is a louder tell than having no icon at all.
    body = `<div class="cards">
      ${services.map((s) => `<div class="card">
        <h3>${esc(s.name)}</h3>${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
      </div>`).join('\n      ')}
    </div>`;
  }

  return `<section id="services" class="tight-top" aria-labelledby="services-h">
  <div class="wrap">
    ${head}
    ${body}
  </div>
</section>`;
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderValues(ctx) {
  const { profile, theme } = ctx;
  const layout = theme.recipe.values;
  let body;

  if (layout === 'columns') {
    // Hairline-topped editorial columns; no icons, type does the work.
    body = `<div class="val-columns">
      ${profile.values.map(([title, desc]) => `<div class="val-col">
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
      </div>`).join('\n      ')}
    </div>`;
  } else if (layout === 'statements-dash' || layout === 'statements-highlight') {
    body = `<div class="val-statements ${layout === 'statements-highlight' ? 'val-hl' : 'val-dash'}">
      ${profile.values.map(([title, desc]) => `<div class="val-stmt">
        <h3><span>${esc(title)}</span></h3>
        <p>${esc(desc)}</p>
      </div>`).join('\n      ')}
    </div>`;
  } else if (layout === 'checklist') {
    // Checks carry meaning here: each value is a promise being ticked off.
    body = `<ul class="val-checks">
      ${profile.values.map(([title, desc]) => `<li>
        <span class="check">${CHECK_ICON}</span>
        <div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>
      </li>`).join('\n      ')}
    </ul>`;
  } else {
    body = `<div class="cards">
      ${profile.values.map(([title, desc]) => `<div class="card">
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
      </div>`).join('\n      ')}
    </div>`;
  }

  // No uppercase kicker scaffolding — the varied h2 alone heads the section.
  return `<section class="values">
  <div class="wrap">
    <div class="section-head">
      <h2>${esc(profile.headings.valuesTitle)}</h2>
    </div>
    ${body}
  </div>
</section>`;
}

function renderHours(ctx) {
  if (!ctx.hours) return '';
  // Compact side-by-side band — a lone table floating in a full-height
  // section was the worst dead-space offender on wide screens.
  return `<section id="hours" class="section-compact">
  <div class="wrap hours-band">
    <div class="section-head" style="margin-bottom:0">
      <h2>Opening Hours</h2>
      <p class="muted">${esc(ctx.profile.headings.hoursEyebrow)}${ctx.lead.phone ? `, or call ${esc(ctx.lead.phone)}` : ''}</p>
    </div>
    <div class="hours-table">
      ${ctx.hours.map((line) => {
        const idx = line.indexOf(': ');
        const [d, t] = idx > 0 ? [line.slice(0, idx), line.slice(idx + 2)] : [line, ''];
        return `<div><span>${esc(d)}</span><strong>${esc(t)}</strong></div>`;
      }).join('\n      ')}
    </div>
  </div>
</section>`;
}

function renderFaq(ctx) {
  return `<section id="faq" class="${ctx.hours ? '' : 'tight-top'}" aria-labelledby="faq-h">
  <div class="wrap">
    <div class="section-head">
      <h2 id="faq-h">Frequently Asked Questions</h2>
    </div>
    <div class="faq-list">
      ${ctx.faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}>
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

const CONTACT_ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" fill="none" stroke="currentColor" stroke-width="2"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m22 7-10 6L2 7" fill="none" stroke="currentColor" stroke-width="2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const cIcon = (kind) => `<svg viewBox="0 0 24 24" aria-hidden="true">${CONTACT_ICONS[kind]}</svg>`;

function renderContact(ctx) {
  const { lead, profile } = ctx;
  return `<section id="contact" class="tight-top">
  <div class="wrap">
    <div class="contact-band">
      <div>
        <h2>${esc(profile.headings.contactTitle)}</h2>
        <address>
        <ul class="contact-list">
          ${lead.phone ? `<li>${cIcon('phone')}<span><a href="${telHref(lead.phone)}">${esc(lead.phone)}</a></span></li>` : ''}
          ${lead.email ? `<li>${cIcon('mail')}<span><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span></li>` : ''}
          ${lead.address ? `<li>${cIcon('pin')}<span>${esc(lead.address)}${ctx.mapLink ? ` · <a href="${esc(ctx.mapLink)}" target="_blank" rel="noopener">View map</a>` : ''}</span></li>` : ''}
          ${!lead.phone && !lead.email && !lead.address ? `<li>${cIcon('pin')}<span>Serving ${esc(ctx.cityLine || 'the local community')} — stop by and say hello.</span></li>` : ''}
        </ul>
        </address>
      </div>
      <div class="cta-panel">
        <h3>${esc(lead.phone
          ? ['Ready when you are', 'One call does it', "Let's talk today"][ctx.seed % 3]
          : profile.heroCta)}</h3>
        <p>${lead.phone ? 'One quick call is all it takes to get started.' : 'Reach out today — we respond fast.'}</p>
        ${lead.phone
          ? `<a class="btn btn-invert" href="${telHref(lead.phone)}">Call ${esc(lead.phone)}</a>`
          : lead.email
            ? `<a class="btn btn-invert" href="mailto:${esc(lead.email)}">Email Us</a>`
            : `<a class="btn btn-invert" href="#top">Back to Top</a>`}
      </div>
    </div>
  </div>
</section>`;
}

const FOOTER_LINES = [
  (n, cat, city) => `${cat} serving ${city}.`,
  (n, cat, city) => `Your local ${cat.toLowerCase()} in ${city}.`,
  (n, cat, city) => `Proudly part of the ${city} community.`,
  (n, cat, city) => `${city}'s neighborhood ${cat.toLowerCase()}.`,
];

function renderFooter(ctx) {
  const { lead } = ctx;
  const line = ctx.cityLine
    ? ' ' + FOOTER_LINES[ctx.seed % FOOTER_LINES.length](lead.name, titleCase(lead.category), ctx.cityLine)
    : '';
  return `<footer>
  <div class="wrap">
    <p>&copy; ${new Date().getFullYear()} ${esc(lead.name)}. All rights reserved.${esc(line)}</p>
  </div>
</footer>`;
}

// ---------- stylesheet (base + tokens + only the variant blocks in use) ----------
function buildCss(theme, ctx) {
  const t = theme;
  const heroVariant = t.recipe.hero;
  const svc = ctx.servicesLayout;

  return `
  :root{
    --bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};
    --primary:${t.primary};--primary-ink:${t.primaryInk};--accent:${t.accent};--radius:${t.radius};
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  @media (prefers-reduced-motion: reduce){
    html{scroll-behavior:auto}
    *,*::before,*::after{animation:none!important;transition:none!important}
  }
  body{font-family:${t.body};color:var(--ink);background:var(--bg);line-height:1.65;font-size:1.02rem}
  ${t.grain ? `body{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}` : ''}
  h1,h2,h3{font-family:${t.display};font-weight:${t.displayWeight};line-height:1.12;letter-spacing:${t.displaySpacing};text-wrap:balance}
  ${t.oldstyleNums ? 'body{font-variant-numeric:oldstyle-nums}' : ''}
  a{color:var(--primary)}
  ::selection{background:var(--primary);color:var(--primary-ink)}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  section{scroll-margin-top:80px}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}

  header{position:sticky;top:0;z-index:50;background:var(--surface);border-bottom:1px solid rgba(0,0,0,.08)}
  .nav{display:flex;align-items:center;justify-content:space-between;height:68px}
  .brand{font-family:${t.display};font-weight:${Math.min(t.displayWeight + 100, 800)};font-size:1.22rem;color:var(--ink);text-decoration:none;letter-spacing:${t.recipe.brand === 'smallcaps' ? '0.12em' : '.2px'}}
  .brand span{color:var(--primary)}
  .brand-caps{font-variant-caps:all-small-caps;letter-spacing:0.14em}
  .brand-underline{box-shadow:inset 0 -3px 0 var(--primary);padding-bottom:1px}
  nav.links{display:flex;gap:26px;align-items:center}
  nav.links a{color:var(--muted);text-decoration:none;font-size:.94rem;font-weight:500}
  nav.links a:hover{color:var(--primary)}
  .btn{display:inline-block;background:var(--primary);color:var(--primary-ink);padding:12px 26px;border-radius:var(--radius);text-decoration:none;font-weight:600;font-size:.97rem;border:2px solid transparent;transition:transform .15s ease,box-shadow .15s ease${t.upperCta ? ';text-transform:uppercase;letter-spacing:.07em;font-size:.88rem' : ''}}
  .btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.16)}
  .btn.ghost{background:transparent;color:inherit;border-color:currentColor}
  .btn-invert{background:var(--surface);color:var(--primary)}
  nav.links .btn{padding:9px 20px}
  nav.links a.btn{color:var(--primary-ink)}
  nav.links a.btn:hover{color:var(--primary-ink)}

  .hero{position:relative;overflow:hidden}
  .motif{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;color:currentColor}
  .hero .wrap{position:relative}
  .locale-line{font-size:1.06rem;opacity:.85;margin:2px 0 10px;font-weight:500}
  .hero h1{font-size:clamp(2.5rem,6vw,4.1rem);margin-bottom:10px}
  .hero p.lead{font-size:clamp(1.08rem,2.2vw,1.4rem);max-width:600px;opacity:.92;margin-bottom:34px}
  .actions{display:flex;gap:14px;flex-wrap:wrap}

${heroVariant === 'centered' ? `
  .hero-centered{background:${t.heroBg};color:${t.heroInk};padding:118px 0 126px;text-align:center}
  .hero-centered .lead{margin-left:auto;margin-right:auto}
  .hero-centered .actions{justify-content:center}` : ''}
${heroVariant === 'split' ? `
  .hero-split{background:${t.heroBg};color:${t.heroInk};padding:104px 0 112px}
  .hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;position:relative}
  .hero-side{position:absolute;top:0;right:0;bottom:0;width:46%;overflow:hidden;pointer-events:none}
  .hero-side .motif{transform:scale(1.5);transform-origin:center right;opacity:.9}
  .monogram{position:absolute;right:-4%;top:50%;transform:translateY(-52%);font-family:${t.display};font-size:26rem;line-height:1;opacity:.07;font-weight:${t.displayWeight};user-select:none}
  .hero-chips{position:relative;margin-top:28px}
  .hero-split .kicker::before{content:'';display:inline-block;width:44px;height:1px;background:currentColor;vertical-align:middle;margin-right:14px;opacity:.6}
  @media (max-width:760px){.hero-side{display:none}}` : ''}
${heroVariant === 'diagonal' ? `
  .hero-diagonal{background:${t.heroBg};color:${t.heroInk};padding:110px 0 150px}
  .diagonal-cut{position:absolute;left:0;right:0;bottom:-1px;height:90px;background:var(--bg);clip-path:polygon(0 100%,100% 100%,100% 0)}
  .hero-diagonal .kicker{color:var(--accent);opacity:1}` : ''}
${heroVariant === 'minimal' ? `
  .hero-minimal{background:var(--surface);color:var(--ink);padding:104px 0 96px;border-bottom:1px solid rgba(0,0,0,.07);border-top:4px solid var(--primary)}
  .hero-minimal .motif{opacity:.55;color:var(--primary)}
  .hero-minimal .kicker{color:var(--primary);opacity:1}
  .hero-minimal .lead{color:var(--muted)}
  .hero-minimal .btn.ghost{color:var(--primary)}` : ''}

  section{padding:88px 0}
  .tight-top{padding-top:0}
  .section-head{max-width:640px;margin-bottom:44px}
  ${t.rule ? '.section-head h2::after{content:"";display:block;width:48px;height:1px;background:var(--accent);margin-top:16px}' : ''}
  section h2{font-size:clamp(1.75rem,3.5vw,2.5rem);margin:0 0 14px}
  .muted{color:var(--muted)}

  .about-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:48px;align-items:start}
  .about-copy{font-size:1.12rem;max-width:58ch}
  ${t.dropCap ? `#about-text::first-letter{font-family:${t.display};float:left;font-size:3.4em;line-height:.82;padding:5px 10px 0 0;color:var(--primary);font-weight:${t.displayWeight}}` : ''}
  .about-local{margin-top:14px}
  .fact-card{background:var(--surface);border:1px solid rgba(0,0,0,.1);border-radius:var(--radius);padding:26px}
  .fact-card h3{font-size:1rem;margin-bottom:14px;color:var(--primary)}
  .fact-card ul{list-style:none}
  .fact-card li{padding:9px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.94rem;display:flex;gap:10px}
  .fact-card li:last-child{border-bottom:none}
  .fact-card li b{min-width:74px;color:var(--muted);font-weight:600}

  .chip-list{list-style:none;display:flex;flex-wrap:wrap;gap:9px;margin-top:20px;padding:0}
  .chip-list li{border:1px solid rgba(0,0,0,.14);border-radius:100px;padding:6px 14px;font-size:.84rem;font-weight:500}
  .hero-chips li{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.08)}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px}
  .card{background:var(--surface);border:${t.cardStrong ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,.08)'};border-radius:var(--radius);padding:28px${t.cardHover ? ';transition:transform .15s ease' : ''}}
  ${t.cardHover ? '.card:hover{transform:translateY(-4px)}' : ''}
  .card h3{font-size:1.08rem;margin-bottom:8px}
  .card p{font-size:.93rem;color:var(--muted)}

${svc === 'menu' ? `
  .svc-menu{list-style:none;max-width:720px;display:grid;gap:26px}
  .svc-line{display:flex;align-items:baseline;gap:14px}
  .svc-line h3{font-size:1.16rem;white-space:nowrap}
  .leader{flex:1;border-bottom:2px dotted color-mix(in srgb,var(--ink) 30%, transparent);transform:translateY(-4px)}
  .svc-menu p{color:var(--muted);font-size:.95rem;margin-top:6px;max-width:56ch}` : ''}
${svc === 'twocol' ? `
  .svc-twocol{display:grid;grid-template-columns:1fr 1fr;gap:0 56px;max-width:900px}
  .svc-item{padding:24px 0;border-top:1px solid rgba(0,0,0,.12)}
  .svc-item h3{font-size:1.12rem;margin-bottom:7px;color:var(--primary)}
  .svc-item p{color:var(--muted);font-size:.94rem}` : ''}

  .values{background:var(--surface);border-top:1px solid rgba(0,0,0,.06);border-bottom:1px solid rgba(0,0,0,.06)}
  .values .card{background:var(--bg);box-shadow:none}
${t.recipe.values === 'columns' ? `
  .val-columns{display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
  .val-col{border-top:1px solid var(--ink);padding-top:20px}
  .val-col h3{font-size:1.06rem;margin-bottom:10px;letter-spacing:.02em}
  .val-col p{font-size:.93rem;color:var(--muted)}
  @media (max-width:760px){.val-columns{grid-template-columns:1fr}}` : ''}
${t.recipe.values.startsWith('statements') ? `
  .val-statements{max-width:760px;display:grid;gap:30px}
  .val-stmt h3{font-size:1.3rem;margin-bottom:8px}
  .val-stmt p{color:var(--muted);max-width:58ch}
  ${t.recipe.values === 'statements-dash'
    ? '.val-stmt h3{color:var(--primary)}'
    : '.val-stmt h3 span::before{content:"";display:inline-block;width:11px;height:11px;background:var(--accent);margin-right:14px;vertical-align:baseline}'}` : ''}
${t.recipe.values === 'checklist' ? `
  .val-checks{list-style:none;max-width:680px;display:grid;gap:24px}
  .val-checks li{display:flex;gap:18px;align-items:flex-start}
  .val-checks .check{flex:none;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--primary) 10%, transparent);color:var(--primary);display:grid;place-items:center;margin-top:2px}
  .val-checks .check svg{width:16px;height:16px}
  .val-checks h3{font-size:1.08rem;margin-bottom:5px}
  .val-checks p{color:var(--muted);font-size:.94rem}` : ''}

  .section-compact{padding:52px 0}
  .hours-band{display:grid;grid-template-columns:auto minmax(320px,560px);gap:48px;align-items:center;justify-content:space-between}
  @media (max-width:900px){.hours-band{grid-template-columns:1fr}}
  .hours-table{background:var(--surface);border:1px solid rgba(0,0,0,.08);border-radius:var(--radius);overflow:hidden;max-width:560px;width:100%}
  .hours-table div{display:flex;justify-content:space-between;gap:20px;padding:14px 22px;border-bottom:1px solid rgba(0,0,0,.06);font-size:.96rem}
  .hours-table div:last-child{border-bottom:none}
  .hours-table div:nth-child(odd){background:color-mix(in srgb,var(--primary) 4%, transparent)}

  .faq-list{max-width:760px}
  @media (min-width:1024px){.faq-list{max-width:none;columns:2;column-gap:26px}.faq-list details{break-inside:avoid}}
  .faq-list details{background:var(--surface);border:1px solid rgba(0,0,0,.08);border-radius:var(--radius);margin-bottom:12px;overflow:hidden}
  .faq-list summary{cursor:pointer;padding:18px 22px;font-weight:600;font-size:1.02rem;list-style:none;display:flex;justify-content:space-between;gap:14px;align-items:center}
  .faq-list summary::-webkit-details-marker{display:none}
  .faq-list summary::after{content:'+';color:var(--primary);font-size:1.4rem;font-weight:400;line-height:1}
  .faq-list details[open] summary::after{content:'–'}
  .faq-list details p{padding:0 22px 18px;color:var(--muted);font-size:.95rem;max-width:68ch}

  .contact-band{background:${heroVariant === 'minimal' ? 'var(--surface)' : t.heroBg};color:${heroVariant === 'minimal' ? 'var(--ink)' : t.heroInk};${heroVariant === 'minimal' ? 'border:1px solid rgba(0,0,0,.1);' : ''}border-radius:calc(var(--radius) * 1.5);padding:56px 48px;display:grid;grid-template-columns:1.1fr .9fr;gap:44px;position:relative;overflow:hidden}
  .contact-band h2{color:inherit}
  .contact-eyebrow{color:${heroVariant === 'minimal' ? 'var(--primary)' : 'inherit'};opacity:${heroVariant === 'minimal' ? '1' : '.8'}}
  .contact-list{list-style:none;display:grid;gap:16px;margin-top:22px}
  .contact-list li{display:flex;gap:14px;align-items:flex-start;font-size:1.02rem}
  .contact-list svg{width:21px;height:21px;flex:none;margin-top:3px;opacity:.85}
  .contact-list a{color:inherit;font-weight:600}
  address{font-style:normal}
  .cta-panel{align-self:center;padding:0}
  .cta-panel h3{margin-bottom:10px;font-size:1.4rem}
  .cta-panel p{opacity:.9;font-size:.98rem;margin-bottom:22px}
  .cta-panel .btn{font-size:1.02rem;padding:14px 30px}

  footer{padding:34px 0;text-align:center;color:var(--muted);font-size:.87rem}

  @media (max-width:760px){
    nav.links a:not(.btn){display:none}
    .nav{height:auto;min-height:56px;padding:10px 0;gap:12px}
    .brand{font-size:1.02rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw}
    nav.links .btn{padding:8px 16px;font-size:.82rem}
    .about-grid,.contact-band,.hero-grid{grid-template-columns:1fr}
    ${svc === 'twocol' ? '.svc-twocol{grid-template-columns:1fr}' : ''}
    .hero{padding-top:78px;padding-bottom:88px}
    .hero-panel{min-height:200px}
    section{padding:62px 0}
    .contact-band{padding:38px 26px}
  }
  @media print{
    header,.actions,.cta-panel{display:none}
    .hero,.contact-band{background:none!important;color:var(--ink)!important}
    section{padding:24px 0}
  }`;
}

// ---------- entry point ----------
export function generateSite(lead, profile, themeKey) {
  const theme = THEMES[themeKey] || THEMES[profile.theme] || THEMES.clean;
  const seed = profile.layoutSeed ?? 0;

  const ctx = {
    lead,
    profile,
    theme,
    seed,
    cityLine: [lead.city, lead.state].filter(Boolean).join(', '),
    hours: profile.hoursHuman || null,
    amenities: profile.amenities || [],
    servicesLayout: theme.recipe.services[seed % theme.recipe.services.length],
    mapLink: lead.lat && lead.lon
      ? `https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lon}#map=17/${lead.lat}/${lead.lon}`
      : lead.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(lead.address)}` : null,
    faqs: buildFaqs(lead, profile),
  };

  const keywords = keywordSet(lead, profile);
  const meta = buildMetaTags(lead, profile, keywords);
  const jsonLd = buildJsonLd(lead, profile, ctx.faqs);
  const checklist = seoChecklist(lead, profile);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="${theme.primary}">
${meta.html}
${jsonLd.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replaceAll('</', '<\\/')}</script>`).join('\n')}
<style>${buildCss(theme, ctx)}
</style>
</head>
<body>
${renderNav(ctx)}

<main>
${renderHero(ctx)}

${renderAbout(ctx)}

${renderServices(ctx)}

${renderValues(ctx)}

${renderHours(ctx)}

${renderFaq(ctx)}

${renderContact(ctx)}
</main>

${renderFooter(ctx)}
</body>
</html>`;

  return { html, faqs: ctx.faqs, keywords, checklist, title: meta.title, description: meta.description };
}

export function newSiteId() {
  return 'site_' + crypto.randomBytes(6).toString('hex');
}
