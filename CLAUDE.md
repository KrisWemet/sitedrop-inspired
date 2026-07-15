# SiteSpark (sitedrop-inspired)

A zero-dependency Node.js app that recreates the sitedrop.ai loop: find local
businesses **without websites** → gather their info → generate an SEO/AEO-optimized
website → draft outreach. No build step, no `npm install`, no framework.

## Commands

```bash
npm start        # serve on http://localhost:3000 (dashboard at /app)
npm test         # node:test suite in test/
PORT=8080 npm start
ANTHROPIC_API_KEY=... npm start   # enables Claude copywriting + AI outreach drafts
```

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
- `public/app.js` — vanilla-JS hash-routed SPA (#/leads, #/lead/:id, #/sites).

## Invariants

- **Zero runtime dependencies.** Everything uses Node built-ins and fetch.
- Generated sites must stay fully self-contained: no external scripts,
  stylesheets, fonts, or images (external *links* are fine).
- All business data rendered into HTML goes through the local `esc()` helpers
  (XSS: business names come from OSM, i.e. the public internet).
- Demo leads are fictional and must be labeled as such in UI and never
  trigger real network probes.
- Site/lead ids are validated (`[\w-]+` routes, regex in `readSiteHtml`)
  before touching the filesystem.
