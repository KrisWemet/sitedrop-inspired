// Website generator: turns an enriched lead into a complete, self-contained,
// responsive single-page website (inline CSS, no external assets, no JS).
//
// Architecture: one set of section renderers driven by a per-theme "recipe"
// (hero composition, services layout, brand treatment, type/spacing tokens)
// plus a seeded intra-theme layout variation — so four themes yield many
// distinct-looking sites while esc() discipline and the SEO/JSON-LD head
// stay in exactly one code path for every theme.
import crypto from 'node:crypto';
import { buildMetaTags, buildJsonLd, buildFaqs, keywordSet, seoChecklist, sanitizeContacts, parseOpeningHours } from './seo.js';
import { serviceName } from './enrich.js';
import { selectImages, imageDataUri, readImageBytes } from './images.js';
import { icon, starRow } from './icons.js';

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
    display: "Didot, 'Bodoni MT', 'Hoefler Text', 'Times New Roman', ui-serif, serif",
    body: "Optima, Candara, 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
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
    display: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
    body: "Corbel, 'Segoe UI', system-ui, sans-serif",
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
    body: "'Lucida Grande', 'Lucida Sans Unicode', 'Lucida Sans', Tahoma, system-ui, sans-serif",
    radius: '12px', displayWeight: 700, displaySpacing: '-0.02em',
    oldstyleNums: false, dropCap: false, grain: false, cardHover: true,
    recipe: { hero: 'minimal', services: ['cards', 'twocol'], values: 'checklist', brand: 'dot' },
  },
};

export const THEME_KEYS = Object.keys(THEMES);

// Brand colors for a theme — used by companion pages (review funnel) so they
// match the generated site.
export function themeColors(themeKey) {
  const t = THEMES[themeKey] || THEMES.clean;
  return { primary: t.primary, primaryInk: t.primaryInk };
}

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const telHref = (phone) => 'tel:' + String(phone).replace(/[^\d+]/g, '');
const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- per-day opening hours (for the contact-band strip) ----------
const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const WEEK_DAYS = Object.keys(DAY_SHORT);

function fmtClock(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  if (Number.isNaN(h)) return hm;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

// Compact label for a set of day names: a consecutive run becomes a range —
// including across the week boundary, so closed Sun+Mon reads "Sun – Mon" —
// anything non-consecutive falls back to a comma list.
function dayGroupLabel(days) {
  const idx = days.map((d) => WEEK_DAYS.indexOf(d)).filter((i) => i >= 0);
  if (!idx.length) return days.join(', ');
  if (idx.length === 1) return DAY_SHORT[WEEK_DAYS[idx[0]]];
  const set = new Set(idx);
  for (const start of idx) {
    let run = true;
    for (let k = 1; k < idx.length; k++) {
      if (!set.has((start + k) % 7)) { run = false; break; }
    }
    if (run) return `${DAY_SHORT[WEEK_DAYS[start]]} – ${DAY_SHORT[WEEK_DAYS[(start + idx.length - 1) % 7]]}`;
  }
  return [...set].sort((a, b) => a - b).map((i) => DAY_SHORT[WEEK_DAYS[i]]).join(', ');
}

// [label, times] rows from the same parse that feeds openingHoursSpecification,
// so the visible strip and the JSON-LD can never disagree. Days with no spec
// get an explicit Closed row; unparseable input falls back to the humanized text.
function hoursRows(lead, profile) {
  const specs = parseOpeningHours(lead.openingHours);
  if (specs.length) {
    const covered = new Set();
    const rows = specs.map((s) => {
      s.dayOfWeek.forEach((d) => covered.add(d));
      return [dayGroupLabel(s.dayOfWeek), `${fmtClock(s.opens)} – ${fmtClock(s.closes)}`];
    });
    const closed = WEEK_DAYS.filter((d) => !covered.has(d));
    if (closed.length && closed.length < 7) rows.push([dayGroupLabel(closed), 'Closed']);
    return rows;
  }
  return (profile.hoursHuman || []).map((line) => {
    const i = line.indexOf(': ');
    return i > 0 ? [line.slice(0, i), line.slice(i + 2)] : [line, ''];
  });
}

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
    ctx.reviews.length ? ['#reviews', 'Reviews'] : null,
    ctx.hoursRows.length ? ['#hours', 'Hours'] : null,
    ['#faq', 'FAQ'],
    ['#contact', 'Contact'],
  ].filter(Boolean);
  // The nav button's label must match what clicking it can actually do: a
  // transactional label (Book/Quote) only when a booking link or form exists.
  const navCta = lead.phone
    ? `<a class="btn" href="${telHref(lead.phone)}">Call Now</a>`
    : ctx.bookingUrl
      ? `<a class="btn" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">${esc(profile.heroCta)}</a>`
      : `<a class="btn" href="#contact">${ctx.formAction ? esc(profile.heroCta) : 'Contact Us'}</a>`;
  return `<header>
  <div class="wrap nav">
    <a class="brand" href="#top">${renderBrand(esc(lead.name), theme.recipe.brand)}</a>
    <nav class="links" aria-label="Site">
      ${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n      ')}
      ${navCta}
    </nav>
  </div>
</header>`;
}

// ---------- conversion elements ----------
// Everything here renders from REAL data only: the star rating comes from
// reviews the operator actually entered, the credentials/response time/
// guarantee come from `lead.proof` fields the operator filled in, and the
// amenities come from OSM tags. Nothing is invented — an unfilled field
// simply doesn't render.
function trustSignals(ctx) {
  const { lead } = ctx;
  const proof = lead.proof || {};
  const out = [];
  if (ctx.reviews.length) {
    const avg = (ctx.reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ctx.reviews.length).toFixed(1);
    out.push({ icon: 'star', text: `${avg} from ${ctx.reviews.length} review${ctx.reviews.length === 1 ? '' : 's'}`, rating: Number(avg) });
  }
  if (proof.since) out.push({ icon: 'award', text: `Serving ${ctx.cityLine || 'the area'} since ${proof.since}` });
  if (proof.credentials) out.push({ icon: 'shield-check', text: proof.credentials });
  if (proof.responseTime) out.push({ icon: 'clock', text: `Replies in ${proof.responseTime}` });
  if (!out.length && ctx.amenities.length) {
    for (const a of ctx.amenities.slice(0, 2)) out.push({ icon: 'badge-check', text: a });
  }
  return out.slice(0, 4);
}

function renderTrustBar(ctx) {
  const signals = trustSignals(ctx);
  if (!signals.length) return '';
  return `<ul class="trust-bar">${signals.map((s) => `<li>${s.rating ? starRow(s.rating) : icon(s.icon, { size: 17 })}<span>${esc(s.text)}</span></li>`).join('')}</ul>`;
}

// The friction-killer under the buttons. Only real, operator-entered promises.
function ctaMicrocopy(ctx) {
  const proof = ctx.lead.proof || {};
  const bits = [];
  if (proof.guarantee) bits.push(proof.guarantee);
  if (proof.responseTime) bits.push(`Most enquiries answered in ${proof.responseTime}`);
  if (proof.credentials && !bits.length) bits.push(proof.credentials);
  return bits.length ? `<p class="cta-micro">${bits.map(esc).join(' · ')}</p>` : '';
}

// A sticky call bar in the mobile thumb zone — the single biggest mobile
// conversion lever for a local business. Pure CSS, no JS, hidden on desktop
// and in print.
function renderStickyCta(ctx) {
  const { lead, profile } = ctx;
  if (!lead.phone && !ctx.bookingUrl && !ctx.formAction) return '';
  const primary = lead.phone
    ? `<a class="sticky-call" href="${telHref(lead.phone)}">${icon('phone-call', { size: 18 })}<span>Call ${esc(lead.phone)}</span></a>`
    : ctx.bookingUrl
      ? `<a class="sticky-call" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">${icon('calendar-check', { size: 18 })}<span>${esc(profile.heroCta)}</span></a>`
      : `<a class="sticky-call" href="#contact">${icon('mail', { size: 18 })}<span>${esc(profile.heroCta)}</span></a>`;
  const secondary = lead.phone && (ctx.bookingUrl || ctx.formAction)
    ? (ctx.bookingUrl
      ? `<a class="sticky-alt" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">Book</a>`
      : `<a class="sticky-alt" href="#contact">Message</a>`)
    : '';
  return `<div class="sticky-cta" aria-label="Contact ${esc(lead.name)}">${primary}${secondary}</div>`;
}

// How it works: genuinely sequential, so numbered markers carry real meaning
// here (the anti-pattern is numbering non-sequential content). Removes the
// "what am I committing to?" anxiety that stops people clicking.
function renderSteps(ctx) {
  const steps = ctx.profile.steps || [];
  if (!steps.length) return '';
  return `<section id="how" class="how" aria-labelledby="how-h">
  <div class="wrap">
    <div class="section-head">
      <h2 id="how-h">How it works</h2>
    </div>
    <ol class="steps">
      ${steps.map(([title, desc]) => `<li>
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
      </li>`).join('\n      ')}
    </ol>
  </div>
</section>`;
}

// The secondary CTA must do what its label promises: a real booking link, a
// real form (via #contact), or — when neither exists — an honest label for
// where it actually lands. Transactional copy with no transaction behind it
// is the fastest way to burn a visitor's trust.
function heroSecondaryCta(ctx) {
  const { profile, lead } = ctx;
  if (ctx.bookingUrl) return `<a class="btn ghost" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">${esc(profile.heroCta)}</a>`;
  if (ctx.formAction) return `<a class="btn ghost" href="#contact">${esc(profile.heroCta)}</a>`;
  const label = (ctx.hoursRows.length || lead.address) ? 'See Hours &amp; Location' : 'Get in Touch';
  return `<a class="btn ghost" href="#contact">${label}</a>`;
}

function heroInner(ctx) {
  const { lead, profile } = ctx;
  // No uppercase tracked eyebrow chip (the default AI hero shape) — the
  // local-SEO phrase runs as one normal-case line under the h1 instead.
  return {
    kicker: `<p class="locale-line">${esc(titleCase(lead.category))}${ctx.cityLine ? ' in ' + esc(ctx.cityLine) : ''}</p>`,
    h1: esc(profile.hook || lead.name),
    lead: esc(profile.tagline),
    promise: renderPromiseList(ctx),
    actions: `<div class="actions">
      ${heroPrimaryCta(ctx)}
      ${heroSecondaryCta(ctx)}
    </div>
    ${ctaMicrocopy(ctx)}
    ${renderTrustBar(ctx)}`,
  };
}

// The no-photo composition: a single bounded column where the business name
// becomes a small letterspaced mark and the tagline carries the display size.
// No reserved half, no faint motif — thin content reads as restraint, not as
// a photo that failed to load. The two-column hero returns once a real photo
// exists.
function renderCompactHero(ctx) {
  const { lead, profile } = ctx;
  return `<section class="hero hero-compact" id="top" aria-label="Introduction">
  <div class="wrap">
    <div class="hero-inner">
      <p class="brand-mark">${esc(lead.name)}</p>
      <h1>${esc(profile.hook || profile.tagline)}</h1>
      <p class="lead">${esc(profile.tagline)}</p>
      ${renderPromiseList(ctx)}
      <div class="actions">
        ${heroPrimaryCta(ctx)}
        ${heroSecondaryCta(ctx)}
      </div>
      ${ctaMicrocopy(ctx)}
      ${renderTrustBar(ctx)}
    </div>
  </div>
</section>`;
}

// Three concrete deliverables, not adjectives, so the value proposition is
// complete before the visitor scrolls. Deliberately NOT a check-icon bullet
// trio: that stack (gradient hero + three ✓ circles + big button) is the modal
// AI landing page, and impeccable's brand register fails it on the inverse
// test. A rule-separated typographic line carries the same information with a
// voice instead of a template.
function renderPromiseList(ctx) {
  const promise = ctx.profile.promise || [];
  if (!promise.length) return '';
  // Joined as flowing text so a wrap never leaves a dangling separator the way
  // border-right on flex items does.
  return `<p class="promise">${promise.map(esc).join('<span class="sep"> · </span>')}</p>`;
}

// The primary CTA states the outcome, with the number as supporting detail —
// "Call (555) 203-5561" is a mechanism; "Book your appointment" is a result.
function heroPrimaryCta(ctx) {
  const { lead, profile } = ctx;
  if (ctx.bookingUrl) return `<a class="btn btn-lg" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">${icon('calendar-check', { size: 19 })}<span>${esc(profile.heroCta)}</span></a>`;
  if (lead.phone) return `<a class="btn btn-lg" href="${telHref(lead.phone)}">${icon('phone-call', { size: 19 })}<span>${esc(profile.heroCta)}<small>${esc(lead.phone)}</small></span></a>`;
  if (ctx.formAction || lead.email) return `<a class="btn btn-lg" href="#contact">${icon('mail', { size: 19 })}<span>${esc(profile.heroCta)}</span></a>`;
  return '';
}

function renderHero(ctx) {
  const { profile, theme } = ctx;
  if (!ctx.images.hero) return renderCompactHero(ctx);
  const inner = heroInner(ctx);
  const motif = motifSvg(profile.industry);

  switch (theme.recipe.hero) {
    case 'split': {
      // The right half is a real photo when the lead has one (this branch only
      // runs with a photo present); preview-only images keep their credit.
      const img = ctx.images.hero;
      return `<section class="hero hero-split" id="top" aria-label="Introduction">
  <div class="hero-side hero-side-photo">
    <img src="${esc(img.src)}" alt="${esc(img.alt)}">
    ${img.previewOnly ? `<span class="photo-note hero-note">${esc(img.credit || 'Preview photo')}</span>` : ''}
  </div>
  <div class="wrap hero-grid">
    <div>
      <h1>${inner.h1}</h1>
      ${inner.kicker}
      <p class="lead">${inner.lead}</p>
      ${inner.promise}
      ${inner.actions}
      ${ctx.amenities.length ? `<ul class="chip-list hero-chips">${ctx.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>
    <div></div>
  </div>
</section>`;
    }
    case 'diagonal':
      return `<section class="hero hero-diagonal" id="top" aria-label="Introduction">
  ${motif}
  <div class="wrap">
    <h1>${inner.h1}</h1>
    ${inner.kicker}
    <p class="lead">${inner.lead}</p>
    ${inner.promise}
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
    ${inner.promise}
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
    ${inner.promise}
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
      ${ctx.amenities.length && !ctx.heroHasChips ? `<ul class="chip-list">${ctx.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>
    <aside>
      ${renderAboutPhoto(ctx)}
      <div class="fact-card">
      <h3>At a Glance</h3>
      <ul>
        <li><b>Type</b><span>${esc(titleCase(lead.category))}${lead.cuisine ? ' · ' + esc(titleCase(lead.cuisine)) : ''}</span></li>
        ${ctx.cityLine ? `<li><b>Area</b><span>${esc(ctx.cityLine)}</span></li>` : ''}
        ${lead.address ? `<li><b>Address</b><span>${esc(lead.address)}</span></li>` : ''}
        ${lead.phone ? `<li><b>Phone</b><span>${esc(lead.phone)}</span></li>` : ''}
        ${lead.email ? `<li><b>Email</b><span>${esc(lead.email)}</span></li>` : ''}
      </ul>
      </div>
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

// Testimonials — renders ONLY from real operator-entered reviews (the same
// entries that feed the Review/AggregateRating JSON-LD). No reviews, no
// section: a paid site never ships fabricated praise.
function renderReviews(ctx) {
  const reviews = ctx.reviews;
  if (!reviews.length) return '';
  const avg = (reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1);
  return `<section id="reviews" class="reviews" aria-labelledby="reviews-h">
  <div class="wrap">
    <div class="section-head">
      <h2 id="reviews-h">${esc(ctx.profile.headings.reviewsTitle || 'What our customers say')}</h2>
      <p class="muted reviews-avg">${starRow(avg)} <span>${esc(avg)} average from ${reviews.length} review${reviews.length === 1 ? '' : 's'}</span></p>
    </div>
    <div class="review-grid">
      ${reviews.slice(0, 6).map((r) => `<figure class="review">
        <span class="quote-mark" aria-hidden="true">${icon('quote', { size: 22 })}</span>
        ${starRow(r.rating)}
        <blockquote>${esc(r.text)}</blockquote>
        <figcaption>${esc(r.author)}${r.source ? `<span class="review-src"> · ${esc(r.source)}</span>` : ''}</figcaption>
      </figure>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

function renderFaq(ctx) {
  return `<section id="faq" aria-labelledby="faq-h">
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

// A real, no-JavaScript contact form. It POSTs natively to a hosted form
// endpoint (Formspree/Basin/Web3Forms and similar accept a plain form post),
// so the site stays 100% JS-free and self-contained; the browser's own form
// submission does the work. Includes a honeypot field for basic spam defense.
function renderContactForm(ctx) {
  if (!ctx.formAction) return '';
  return `<form class="lead-form" action="${esc(ctx.formAction)}" method="POST">
          <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
          <label>Your name<input type="text" name="name" required autocomplete="name"></label>
          <label>Email or phone<input type="text" name="contact" required autocomplete="email"></label>
          <label>How can we help?<textarea name="message" rows="3" required></textarea></label>
          <input type="hidden" name="_subject" value="New enquiry from ${esc(ctx.lead.name)} website">
          <button type="submit" class="btn btn-invert form-submit">Send message</button>
        </form>`;
}

// One reassurance line at the decision point instead of a duplicated phone
// number: what happens when they act, phrased for the channel that exists.
function contactSub(ctx) {
  const { lead } = ctx;
  if (ctx.bookingUrl) return 'Book online in under a minute, or reach us directly below.';
  if (ctx.formAction) return 'Send a message with the form and we will get right back to you.';
  if (lead.phone) {
    return ['One quick call is all it takes to get started.',
      'Ready when you are. Give us a call.',
      'Questions? We answer the phone ourselves.'][ctx.seed % 3];
  }
  return 'Reach out today, we respond fast.';
}

function contactAction(ctx) {
  const { lead } = ctx;
  // btn-invert is surface-on-dark; on the minimal theme's light band the
  // standard primary button is the visible one.
  const cls = ctx.theme.recipe.hero === 'minimal' ? 'btn' : 'btn btn-invert';
  if (ctx.bookingUrl) return `<a class="${cls}" href="${esc(ctx.bookingUrl)}" target="_blank" rel="noopener">${esc(ctx.profile.heroCta)}</a>`;
  if (lead.phone) return `<a class="${cls}" href="${telHref(lead.phone)}">Call ${esc(lead.phone)}</a>`;
  if (lead.email) return `<a class="${cls}" href="mailto:${esc(lead.email)}">Email Us</a>`;
  return '';
}

// Trust content at the point of decision: real amenity facts when OSM has
// them, otherwise the lead's first value statement (the "licensed & insured"
// class of reassurance).
function trustLine(ctx) {
  const bits = ctx.amenities.length ? ctx.amenities
    : (ctx.profile.values?.[0] ? [ctx.profile.values[0][0]] : []);
  return bits.length ? `<p class="trust-line">${bits.map(esc).join(' · ')}</p>` : '';
}

// Proof belongs at the moment of decision, not only in a section people may
// never scroll to. Uses the highest-rated real review, nothing invented.
function renderContactProof(ctx) {
  if (!ctx.reviews.length) return '';
  const best = [...ctx.reviews].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0];
  return `<figure class="cta-proof">
          ${starRow(best.rating)}
          <blockquote>${esc(best.text)}</blockquote>
          <figcaption>${esc(best.author)}${best.source ? ` · ${esc(best.source)}` : ''}</figcaption>
        </figure>`;
}

function renderContact(ctx) {
  const { lead, profile } = ctx;
  const hasForm = Boolean(ctx.formAction);
  const hasHours = ctx.hoursRows.length > 0;
  // Hours live here as a slim strip (same parse as the JSON-LD hours, so page
  // and schema can't disagree) instead of a full-width section holding one row.
  const hoursStrip = hasHours ? `<div class="hours-strip" id="hours">
        <h3 class="hours-h">Hours</h3>
        ${ctx.hoursRows.map(([d, t]) => `<div class="hrow"><b>${esc(d)}</b><span>${esc(t)}</span></div>`).join('\n        ')}
      </div>` : '';
  // When the action button IS the call button, a phone row above it would
  // repeat the same number an inch away — the padding the critique flagged.
  const phoneInButton = Boolean(lead.phone && !ctx.bookingUrl);
  const rows = [
    lead.phone && !phoneInButton ? `<li>${cIcon('phone')}<span><a href="${telHref(lead.phone)}">${esc(lead.phone)}</a></span></li>` : '',
    lead.email ? `<li>${cIcon('mail')}<span><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span></li>` : '',
    lead.address ? `<li>${cIcon('pin')}<span>${esc(lead.address)}${ctx.mapLink ? ` · <a href="${esc(ctx.mapLink)}" target="_blank" rel="noopener">View map</a>` : ''}</span></li>` : '',
    !lead.phone && !lead.email && !lead.address ? `<li>${cIcon('pin')}<span>Serving ${esc(ctx.cityLine || 'the local community')} — stop by and say hello.</span></li>` : '',
  ].filter(Boolean);
  return `<section id="contact" class="tight-top">
  <div class="wrap">
    <div class="contact-band${hasForm ? ' contact-band-form' : ''}${hasHours ? ' contact-band-hours' : ''}">
      <div class="contact-main">
        <h2>${esc(profile.headings.contactTitle)}</h2>
        <p class="contact-sub">${esc(contactSub(ctx))}</p>
        ${rows.length ? `<address>
        <ul class="contact-list">
          ${rows.join('\n          ')}
        </ul>
        </address>` : ''}
        ${contactAction(ctx)}
        ${ctaMicrocopy(ctx)}
        ${trustLine(ctx)}
        ${renderContactProof(ctx)}
      </div>
      ${hasForm ? `<div class="cta-panel">${renderContactForm(ctx)}</div>` : ''}
      ${hoursStrip}
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
  // No photo → the compact hero replaces the theme's hero variant entirely.
  const compact = !ctx.images.hero;
  // The mark/strip accents mix the theme accent toward the hero ink so they
  // stay readable on both dark bands and the minimal theme's light band.
  const markInk = `color-mix(in srgb, ${t.accent} 45%, ${t.heroInk})`;
  const bandLight = heroVariant === 'minimal';
  const bandHair = bandLight ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.22)';
  const bandRow = bandLight ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.13)';

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

${compact ? `
  .hero-compact{background:${t.heroBg};color:${t.heroInk};padding:84px 0 90px}
  .hero-compact .hero-inner{max-width:760px;margin:0 auto}
  .brand-mark{font-family:${t.display};font-weight:${t.displayWeight};font-size:1.02rem;letter-spacing:.28em;text-transform:uppercase;color:${markInk};display:inline-block;padding-bottom:10px;border-bottom:1px solid color-mix(in srgb, ${markInk} 40%, transparent);margin-bottom:24px}
  .hero-compact .hero-chips{margin:0 0 20px;justify-content:center}
  .hero-compact h1{font-size:clamp(2.6rem,6vw,4.3rem)}
  .hero-compact .locale-line{font-size:1.08rem;margin:14px 0 32px}
  ${bandLight ? `.hero-compact{border-top:4px solid var(--primary);border-bottom:1px solid rgba(0,0,0,.07)}
  .hero-compact .locale-line{color:var(--muted)}
  .hero-compact .btn.ghost{color:var(--primary)}
  .hero-compact .hero-chips li{border-color:rgba(0,0,0,.16);background:rgba(0,0,0,.03)}` : ''}` : ''}
${!compact && heroVariant === 'centered' ? `
  .hero-centered{background:${t.heroBg};color:${t.heroInk};padding:118px 0 126px;text-align:center}
  .hero-centered .lead{margin-left:auto;margin-right:auto}
  .hero-centered .actions{justify-content:center}` : ''}
${!compact && heroVariant === 'split' ? `
  .hero-split{background:${t.heroBg};color:${t.heroInk};padding:104px 0 112px}
  .hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;position:relative}
  .hero-side{position:absolute;top:0;right:0;bottom:0;width:46%;overflow:hidden;pointer-events:none}
  .hero-side-photo img{width:100%;height:100%;object-fit:cover;display:block}
  .hero-note{position:absolute;right:12px;bottom:8px;font-size:.72rem;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .hero-chips{position:relative;margin-top:28px}
  .hero-split .kicker::before{content:'';display:inline-block;width:44px;height:1px;background:currentColor;vertical-align:middle;margin-right:14px;opacity:.6}
  @media (max-width:760px){.hero-side{display:none}}` : ''}
${!compact && heroVariant === 'diagonal' ? `
  .hero-diagonal{background:${t.heroBg};color:${t.heroInk};padding:110px 0 150px}
  .diagonal-cut{position:absolute;left:0;right:0;bottom:-1px;height:90px;background:var(--bg);clip-path:polygon(0 100%,100% 100%,100% 0)}
  .hero-diagonal .kicker{color:var(--accent);opacity:1}` : ''}
${!compact && heroVariant === 'minimal' ? `
  .hero-minimal{background:var(--surface);color:var(--ink);padding:104px 0 96px;border-bottom:1px solid rgba(0,0,0,.07);border-top:4px solid var(--primary)}
  .hero-minimal .motif{opacity:.55;color:var(--primary)}
  .hero-minimal .kicker{color:var(--primary);opacity:1}
  .hero-minimal .lead{color:var(--muted)}
  .hero-minimal .btn.ghost{color:var(--primary)}` : ''}

  section{padding:72px 0}
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
  .val-statements{display:grid;grid-template-columns:repeat(3,1fr);gap:36px 44px}
  @media (max-width:760px){.val-statements{grid-template-columns:1fr}}
  .val-stmt h3{font-size:1.24rem;margin-bottom:8px}
  .val-stmt p{color:var(--muted);max-width:58ch}
  ${t.recipe.values === 'statements-dash'
    ? '.val-stmt h3{color:var(--primary)}'
    : '.val-stmt h3 span::before{content:"";display:inline-block;width:11px;height:11px;background:var(--accent);margin-right:14px;vertical-align:baseline}'}` : ''}
${t.recipe.values === 'checklist' ? `
  .val-checks{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:28px 40px}
  @media (max-width:760px){.val-checks{grid-template-columns:1fr}}
  .val-checks li{display:flex;gap:18px;align-items:flex-start}
  .val-checks .check{flex:none;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--primary) 10%, transparent);color:var(--primary);display:grid;place-items:center;margin-top:2px}
  .val-checks .check svg{width:16px;height:16px}
  .val-checks h3{font-size:1.08rem;margin-bottom:5px}
  .val-checks p{color:var(--muted);font-size:.94rem}` : ''}

  .section-compact{padding:52px 0}

  /* ---- conversion: promise list, trust bar, big CTA, sticky bar, steps ---- */
  .promise{margin:18px 0 30px;max-width:42em;font-size:1rem;font-weight:500;opacity:.92;line-height:1.7}
  .promise .sep{opacity:.45;padding:0 4px}
  .btn-lg{display:inline-flex;align-items:center;gap:11px;padding:16px 30px;font-size:1.05rem}
  .btn-lg svg{flex:none}
  .btn-lg span{display:flex;flex-direction:column;line-height:1.15;text-align:left}
  .btn-lg small{font-size:.82rem;font-weight:500;opacity:.85;margin-top:2px}
  .cta-micro{font-size:.88rem;opacity:.82;margin-top:14px}
  .trust-bar{list-style:none;display:flex;flex-wrap:wrap;gap:10px 26px;margin:26px 0 0;padding:20px 0 0;border-top:1px solid currentColor;border-image:linear-gradient(to right,currentColor,transparent) 1;max-width:44em}
  .trust-bar li{display:flex;align-items:center;gap:9px;font-size:.92rem;font-weight:500;opacity:.95}
  .trust-bar svg{flex:none;opacity:.8}
  .trust-bar .stars{color:${t.accent}}

  .how{background:var(--surface);border-top:1px solid rgba(0,0,0,.06);border-bottom:1px solid rgba(0,0,0,.06)}
  .how .steps{list-style:none;counter-reset:hw;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:26px;padding:0}
  .how .steps li{counter-increment:hw;padding-top:14px;border-top:2px solid var(--primary)}
  .how .steps li::before{content:counter(hw);display:block;font-family:${t.display};font-size:.9rem;font-weight:700;color:var(--primary);margin-bottom:8px}
  .how .steps h3{font-size:1.08rem;margin-bottom:6px}
  .how .steps p{font-size:.94rem;color:var(--muted);max-width:34ch}

  .cta-proof{margin:22px 0 0;padding:16px 0 0;border-top:1px solid ${bandHair}}
  .cta-proof blockquote{font-size:.95rem;line-height:1.55;margin:8px 0 6px;max-width:44ch;opacity:.95}
  .cta-proof figcaption{font-size:.85rem;opacity:.75;font-weight:600}

  .sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:60;display:none;gap:1px;background:rgba(0,0,0,.12);box-shadow:0 -4px 20px rgba(0,0,0,.16)}
  .sticky-cta a{flex:1;display:flex;align-items:center;justify-content:center;gap:9px;padding:15px 12px;text-decoration:none;font-weight:700;font-size:1rem;background:var(--primary);color:var(--primary-ink)}
  .sticky-cta .sticky-alt{flex:0 0 34%;background:var(--surface);color:var(--primary)}
  @media (max-width:760px){
    .sticky-cta{display:flex}
    body{padding-bottom:62px}
  }
  @media print{.sticky-cta{display:none}}

  .reviews{background:var(--surface);border-top:1px solid rgba(0,0,0,.06);border-bottom:1px solid rgba(0,0,0,.06)}
  .stars{display:inline-flex;gap:2px;color:var(--accent);vertical-align:middle}
  .stars .star.off{opacity:.28}
  .reviews-avg{display:flex;align-items:center;gap:10px;font-size:.95rem}
  .review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}
  .review{margin:0;background:var(--bg);border:1px solid rgba(0,0,0,.08);border-radius:var(--radius);padding:26px 24px 22px;display:flex;flex-direction:column;gap:12px}
  .review .quote-mark{color:var(--accent);opacity:.5}
  .review blockquote{font-size:1rem;line-height:1.6;color:var(--ink);max-width:52ch}
  .review figcaption{font-size:.9rem;color:var(--muted);font-weight:600;margin-top:auto}
  .review .review-src{font-weight:400}

  .faq-list{max-width:760px}
  @media (min-width:1024px){.faq-list{max-width:none;columns:2;column-gap:26px}.faq-list details{break-inside:avoid}}
  .faq-list details{background:var(--surface);border:1px solid rgba(0,0,0,.08);border-radius:var(--radius);margin-bottom:12px;overflow:hidden}
  .faq-list summary{cursor:pointer;padding:18px 22px;font-weight:600;font-size:1.02rem;list-style:none;display:flex;justify-content:space-between;gap:14px;align-items:center}
  .faq-list summary::-webkit-details-marker{display:none}
  .faq-list summary::after{content:'+';color:var(--primary);font-size:1.4rem;font-weight:400;line-height:1}
  .faq-list details[open] summary::after{content:'–'}
  .faq-list details p{padding:0 22px 18px;color:var(--muted);font-size:.95rem;max-width:68ch}

  .contact-band{background:${bandLight ? 'var(--surface)' : t.heroBg};color:${bandLight ? 'var(--ink)' : t.heroInk};${bandLight ? 'border:1px solid rgba(0,0,0,.1);' : ''}border-radius:calc(var(--radius) * 1.5);padding:56px 48px;display:grid;grid-template-columns:${ctx.formAction && ctx.hoursRows.length ? '1.05fr 1fr .75fr' : ctx.formAction ? '1.1fr .95fr' : ctx.hoursRows.length ? '1.25fr .8fr' : '1fr'};gap:48px;position:relative;overflow:hidden}
  .contact-band h2{color:inherit}
  .contact-sub{opacity:.88;max-width:44ch;margin-top:4px}
  .contact-list{list-style:none;display:grid;gap:16px;margin-top:22px}
  .contact-list li{display:flex;gap:14px;align-items:flex-start;font-size:1.02rem}
  .contact-list svg{width:21px;height:21px;flex:none;margin-top:3px;opacity:.85}
  .contact-list a{color:inherit;font-weight:600}
  address{font-style:normal}
  .contact-main > .btn{margin-top:26px;font-size:1.02rem;padding:14px 30px}
  .trust-line{margin-top:18px;font-size:.85rem;opacity:.75}
  .hours-strip{border-left:1px solid ${bandHair};padding-left:30px;align-self:center;scroll-margin-top:90px}
  .hours-h{font-size:.82rem;font-variant-caps:all-small-caps;letter-spacing:.09em;opacity:.8;margin:0 0 8px}
  .hrow{display:flex;justify-content:space-between;gap:18px;padding:7px 0;font-size:.93rem}
  .hrow + .hrow{border-top:1px solid ${bandRow}}
  .hrow b{font-weight:600}
  .hrow span{opacity:.85}
  .cta-panel{align-self:center;padding:0}
  .lead-form{display:grid;gap:12px}
  .lead-form label{display:grid;gap:6px;font-size:.86rem;font-weight:600;opacity:.92}
  .lead-form input,.lead-form textarea{font-family:inherit;font-size:1rem;padding:11px 13px;border-radius:var(--radius);border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:inherit;width:100%}
  .lead-form input::placeholder,.lead-form textarea::placeholder{color:inherit;opacity:.6}
  .lead-form input:focus,.lead-form textarea:focus{outline:2px solid var(--accent);outline-offset:1px;background:rgba(255,255,255,.2)}
  .lead-form textarea{resize:vertical}
  .lead-form .form-submit{margin-top:4px;justify-self:start}
  .contact-band-form .cta-panel{padding:26px;background:${heroVariant === 'minimal' ? 'color-mix(in srgb,var(--primary) 6%, transparent)' : 'rgba(255,255,255,.08)'};border:1px solid ${heroVariant === 'minimal' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.2)'};border-radius:var(--radius)}
${heroVariant === 'minimal' ? `
  .lead-form input,.lead-form textarea{border:1px solid rgba(0,0,0,.18);background:#fff;color:var(--ink)}
  .lead-form input:focus,.lead-form textarea:focus{background:#fff}` : ''}

  .photo{margin:0;overflow:hidden;border-radius:var(--radius)}
  .photo img{width:100%;height:100%;object-fit:cover;display:block}
  .about-photo{margin-bottom:18px}
  .about-photo img{aspect-ratio:4/3}
  .photo-note{display:block;font-size:.78rem;padding:6px 2px 0}
  .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
  .gallery .photo{aspect-ratio:4/3}

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
    .hours-strip{border-left:none;padding-left:0;border-top:1px solid ${bandHair};padding-top:22px}
    .brand-mark{letter-spacing:.18em;font-size:.92rem}
  }
  @media print{
    header,.actions,.cta-panel{display:none}
    .hero,.contact-band{background:none!important;color:var(--ink)!important}
    section{padding:24px 0}
  }`;
}

// ---------- images ----------
// mode 'preview' may include the Places storefront; 'live' never does.
// imageMode 'embed' inlines bytes as data URIs (single-file preview);
// 'files' references images/<id>.<ext> and returns the bytes for packaging.
function resolveImages(lead, { mode, imageMode }) {
  const picked = selectImages(lead, mode);
  const files = [];
  const srcFor = (img) => {
    if (!img) return null;
    if (imageMode === 'files') {
      const name = `images/${img.id}.${img.type.split('/')[1] === 'jpeg' ? 'jpg' : img.type.split('/')[1]}`;
      const data = readImageBytes(img);
      if (!data) return null;
      files.push({ name, data });
      return name;
    }
    return imageDataUri(img);
  };
  const withSrc = (img) => {
    const src = srcFor(img);
    return src ? { src, alt: img.alt || '', credit: img.credit || null, previewOnly: Boolean(img.previewOnly) } : null;
  };
  return {
    hero: withSrc(picked.hero),
    gallery: picked.gallery.map(withSrc).filter(Boolean),
    files,
  };
}

function renderAboutPhoto(ctx) {
  const img = ctx.images.hero;
  if (!img || ctx.heroUsesPhoto) return '';
  return `<figure class="photo about-photo">
        <img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy">
        ${img.previewOnly ? `<figcaption class="muted photo-note">${esc(img.credit || 'Preview photo')}</figcaption>` : ''}
      </figure>`;
}

function renderGallery(ctx) {
  if (!ctx.images.gallery.length) return '';
  return `<section class="section-compact" aria-label="Photos">
  <div class="wrap">
    <div class="gallery">
      ${ctx.images.gallery.map((img) => `<figure class="photo">
        <img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy">
        ${img.previewOnly ? `<figcaption class="muted photo-note">${esc(img.credit || 'Preview only; replaced before going live')}</figcaption>` : ''}
      </figure>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

// ---------- entry point ----------
export function generateSite(rawLead, profile, themeKey, opts = {}) {
  const { mode = 'preview', imageMode = 'embed' } = opts;
  const theme = THEMES[themeKey] || THEMES[profile.theme] || THEMES.clean;
  const seed = profile.layoutSeed ?? 0;

  // Strip placeholder contacts (example.com etc.) before ANY rendering, so a
  // fake email/site can never reach the page or the JSON-LD.
  const lead = sanitizeContacts(rawLead);
  // Operator-configured conversion targets (validated http(s) URLs upstream).
  const cta = lead.cta || {};
  const bookingUrl = /^https?:\/\//i.test(cta.bookingUrl || '') ? cta.bookingUrl : null;
  const formEndpoint = /^https?:\/\//i.test(cta.formEndpoint || '') ? cta.formEndpoint : null;
  // Attribution: when capture is on, the form posts to our capture URL (which
  // logs the enquiry, alerts the owner, then forwards to their own endpoint).
  // Still a native form POST, so the site stays JavaScript-free.
  const capture = lead.capture || {};
  const captureBase = (opts.baseUrl || process.env.BASE_URL || '').replace(/\/$/, '');
  const formAction = capture.enabled && capture.token && captureBase
    ? `${captureBase}/f/${capture.token}`
    : formEndpoint;
  // A tracked number forwards to their real line; the call log is the client's
  // proof that the site produced business.
  const displayPhone = (capture.enabled && capture.trackedNumber) ? capture.trackedNumber : lead.phone;
  if (displayPhone !== lead.phone) lead.phone = displayPhone;

  const ctx = {
    lead,
    profile,
    theme,
    seed,
    bookingUrl,
    formEndpoint,
    formAction,
    cityLine: [lead.city, lead.state].filter(Boolean).join(', '),
    hoursRows: hoursRows(lead, profile),
    reviews: Array.isArray(lead.reviews) ? lead.reviews.filter((r) => r && r.author && r.text && r.rating) : [],
    amenities: profile.amenities || [],
    servicesLayout: theme.recipe.services[seed % theme.recipe.services.length],
    mapLink: lead.lat && lead.lon
      ? `https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lon}#map=17/${lead.lat}/${lead.lon}`
      : lead.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(lead.address)}` : null,
    faqs: buildFaqs(lead, profile),
  };
  ctx.images = resolveImages(lead, { mode, imageMode });
  // With a photo, the split theme shows it in the hero (so the about aside
  // must not repeat it); without one, every theme gets the compact hero,
  // which always carries the amenity chips.
  ctx.heroUsesPhoto = Boolean(ctx.images.hero) && theme.recipe.hero === 'split';
  ctx.heroHasChips = !ctx.images.hero || theme.recipe.hero === 'split';

  const keywords = keywordSet(lead, profile);
  const meta = buildMetaTags(lead, profile, keywords);
  const jsonLd = buildJsonLd(lead, profile, ctx.faqs);
  const checklist = seoChecklist(lead, profile, { hasForm: Boolean(formAction), hasBooking: Boolean(bookingUrl) });

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

${renderSteps(ctx)}

${renderValues(ctx)}

${renderGallery(ctx)}

${renderReviews(ctx)}

${renderFaq(ctx)}

${renderContact(ctx)}
</main>

${renderFooter(ctx)}
${renderStickyCta(ctx)}
</body>
</html>`;

  return {
    html,
    faqs: ctx.faqs,
    keywords,
    checklist,
    title: meta.title,
    description: meta.description,
    imageFiles: ctx.images.files,
    hasImages: Boolean(ctx.images.hero),
  };
}

export function newSiteId() {
  return 'site_' + crypto.randomBytes(6).toString('hex');
}
