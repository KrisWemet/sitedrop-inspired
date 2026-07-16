# SiteSpark (sitedrop-inspired)

A zero-dependency Node.js app that recreates the sitedrop.ai loop: find local
businesses **without websites** → verify → gather their info → generate an
SEO/AEO-optimized website → draft outreach → publish — plus an Autopilot that
runs the whole pipeline unattended. No build step, no `npm install`, no framework.

## Commands

```bash
npm start        # serve on http://localhost:3000 (dashboard at /app)
npm test         # node:test suite in test/
PORT=8080 npm start
```

Optional env (each feature degrades gracefully when unset):
`ANTHROPIC_API_KEY` (Claude copywriting + AI pitch drafts, `CLAUDE_MODEL` to
override), `VERCEL_TOKEN`/`VERCEL_TEAM_ID` (one-click publish),
`RESEND_API_KEY` + `OUTREACH_FROM` + `DIGEST_TO` (daily digest email,
`DIGEST_HOUR` default 8), `BASE_URL` (hosted dashboard URL used in drafted
pitch links), `AUTOPILOT_MAX_PER_RUN` (default 5),
`AUTOPILOT_DAILY_GEN_CAP` (default 20), `PEXELS_API_KEY` (licensed stock
photos), `GOOGLE_PLACES_API_KEY` (storefront photo, preview only).

## How to verify changes end-to-end

The bundled demo dataset makes the full flow testable offline:

```bash
node server.js &
curl -X POST localhost:3000/api/search -H 'Content-Type: application/json' \
  -d '{"query":"salon","location":"demo"}'                    # → leads, no-website flags
curl -X POST localhost:3000/api/leads/<id>/enrich             # → prospect profile
curl -X POST localhost:3000/api/leads/<id>/verify             # → web-presence verification
curl -X POST localhost:3000/api/leads/<id>/generate -d '{}' \
  -H 'Content-Type: application/json'                         # → site + seoChecklist
curl -X POST localhost:3000/api/leads/<id>/outreach           # → pitch email draft
curl localhost:3000/sites/<siteId>.html                       # → the generated website
curl -o pack.zip localhost:3000/sites/<siteId>/pack.zip       # → deploy pack
```

For UI changes, drive the dashboard with Playwright (chromium is at
`/opt/pw-browsers` in remote sessions; the module at `$(npm root -g)/playwright`).
Search with location `demo`, open a lead, enrich, generate, and screenshot.

## Architecture

- `server.js` — hand-rolled HTTP router. All API handlers live here; static
  files from `public/`; generated sites served from `data/sites/`.
- `lib/store.js` — JSON persistence in `data/db.json` (gitignored). Leads,
  sites, searches. `upsertLeads` preserves work fields (enrichment, siteId,
  status, notes, verification, outreach) across re-searches — don't break that.
- `lib/osm.js` — Nominatim geocoding + Overpass business search. The
  no-website flag = absence of website/contact:website/url OSM tags.
  `scoreLead` ranks contactability. `CATEGORY_MAP` translates human search
  terms to OSM selectors.
- `lib/demo-data.js` — fictional businesses (Milltown, OR) used when location
  is "demo" or live APIs fail. Never probe networks for demo leads.
- `lib/enrich.js` — industry knowledge base (11 industries) → profile with
  tagline/about/services/values + humanized hours. Claude rewrite if
  ANTHROPIC_API_KEY is set (plain fetch, no SDK — keep zero-dep).
- `lib/seo.js` — all SEO/AEO: JSON-LD builders (LocalBusiness subtype map,
  FAQPage, WebPage+speakable), OSM hours → openingHoursSpecification parser,
  meta/OG/geo tags, keyword sets, FAQ content, robots.txt (AI crawlers
  explicitly allowed), sitemap.xml, llms.txt, and the dashboard checklist.
- `lib/generator.js` — renders the final self-contained HTML (inline CSS,
  inline SVG, no external assets, no JS). Returns `{ html, faqs, keywords,
  checklist, title, description }`. Four themes in `THEMES`.
- `lib/verify.js` — web-presence verification: probes listed sites (dead/
  parked/social-only detection) and DNS+HTTP-probes slug-guessed domains for
  no-website leads.
- `lib/outreach.js` — pitch email drafts (template or Claude).
- `lib/zip.js` — minimal store-only ZIP writer for the deploy pack.
- `lib/images.js` — photo pipeline. Sources: `client` (uploads, live-site
  source of truth), `pexels` (licensed stock, allowed live), `places`
  (Google storefront, PREVIEW ONLY — `selectImages(lead, 'live')` strips it
  and the tests assert this; never weaken that). Preview embeds data URIs;
  live mode (`generateSite(..., {mode:'live', imageMode:'files'})`) ships
  files under `images/`. An `<img>` renders only when bytes exist on disk.
- `lib/publish.js` — Vercel REST deploys; slug = name+city+id-suffix
  (collision-safe).
- `lib/mailer.js` — Resend via plain fetch. ONLY sends the operator digest;
  pitch emails are never auto-sent (ESP AUP + jurisdictional law).
- `lib/autopilot.js` — campaigns (geocoded once at creation), chained-
  setTimeout scheduler with overlap guard, per-run + daily caps, activity
  log, daily digest builder. Calls `searchBusinesses` directly — a live-API
  failure is a logged failed run, never a demo-data substitution.
- `public/app.js` — vanilla-JS hash-routed SPA (#/leads, #/lead/:id, #/sites,
  #/autopilot).

## Generator design system (lib/generator.js)

Section renderers driven by per-theme recipes: hero composition
(centered/split/diagonal/minimal), services layout (cards/numbered/twocol,
seed-picked from the theme's allowed list via `profile.layoutSeed`), brand
treatment, typographic tokens, abstract per-industry-group SVG motifs
(6 groups; keep them abstract — literal clip-art reads worse than nothing).
The SEO head (meta + JSON-LD) is one code path for all themes — there is a
parity test asserting identical structured data across themes; keep it green.
Copy comes from the seeded knowledge base in enrich.js (per-service
descriptions, 5 taglines/values per industry, heading variants) — never add
copy that repeats an identical sentence pattern across items.

Anti-pattern rules (audited against pbakaus/impeccable's detectors, enforced
by the "impeccable guards" test in test/generator.test.js — keep it green):
no uppercase tracked eyebrow/kicker chips, no side-tab accent borders on
cards or statements, no cream/beige page background, no single-font themes
(pair display + body), no icon-tile-above-heading cards, no numbered markers
on non-sequential content, ≤3 em-dashes in rendered body copy (AI cadence
tell — write KB copy with commas/colons/periods), no nested cards (the
contact CTA panel is deliberately flat), no hairline-border + wide-shadow
combos, body text measures ≤ ~70ch.

## Invariants

- **Zero runtime dependencies.** Everything uses Node built-ins and fetch.
- Generated sites must stay fully self-contained: no external scripts,
  stylesheets, fonts, or images (external *links* are fine).
- All business data rendered into HTML goes through the local `esc()` helpers
  (XSS: business names come from OSM, i.e. the public internet).
- Demo leads are fictional and must be labeled as such in UI and never
  trigger real network probes. Autopilot must never touch demo data.
- **No prospect email is ever sent automatically.** The mailer sends the
  operator digest only; outreach stays draft + one-click manual send. The
  sent-log (`data/sent-log.jsonl`) is append-only and separate from db.json.
- Site/lead ids are validated (`[\w-]+` routes, regex in `readSiteHtml`)
  before touching the filesystem.
- db.json writes are atomic (tmp + rename, .bak kept). Don't reintroduce
  direct `writeFileSync` on the live path.
