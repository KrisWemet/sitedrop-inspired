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
photos), `GOOGLE_PLACES_API_KEY` (storefront photo, preview only),
`AGENCY_NAME`/`AGENCY_EMAIL`/`AGENCY_PHONE`/`AGENCY_ADDRESS`/`AGENCY_WEBSITE`
+ `PRICE_SETUP` (2000) / `PRICE_MONTHLY` (250) / `AGENCY_TAX_RATE` (0)
(proposals + invoices).

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
  `sanitizeContacts` strips placeholder emails/websites (RFC-2606 reserved
  domains: example.com/.org/.net, test, invalid) — `generateSite` calls it
  FIRST so a fake contact can never reach the page or the JSON-LD.
- `lib/generator.js` — renders the final self-contained HTML (inline CSS,
  inline SVG, no external assets, no JS). Returns `{ html, faqs, keywords,
  checklist, title, description }`. Four themes in `THEMES`. Renders a
  testimonials section (`renderReviews`) ONLY from real `lead.reviews[]`
  (author/rating/text/source) — never fabricated — the same entries that
  feed the Review+AggregateRating JSON-LD in seo.js.
- `lib/icons.js` — curated inline-SVG icon set vendored from Lucide (ISC,
  see `assets/lucide/LICENSE`). `icon(name,{size,fill,cls,label})` inlines a
  self-contained `<svg>`; `starRow(rating)` builds review stars;
  `industryIcon(industry)` maps to an accent glyph. Zero runtime dep — paths
  are baked in. Use sparingly (never the banned icon-tile-above-heading).
- `lib/seo-report.js` — white-label monthly "Search & AI visibility report"
  (care-plan deliverable) at an unguessable `rpt_` token URL, noindex.
  Renders PURELY from data the app has (checklist status, keyword targets,
  AEO/schema state, entered reviews, GBP checklist, seeded content plan) —
  contains NO invented metrics (no fake traffic/rankings); says so on the page.
- `lib/verify.js` — web-presence verification: probes listed sites (dead/
  parked/social-only detection) and DNS+HTTP-probes slug-guessed domains for
  no-website leads.
- `lib/outreach.js` — pitch email drafts (template or Claude).
- `lib/zip.js` — minimal store-only ZIP writer for the deploy pack.
- `lib/images.js` — photo pipeline. Sources: `client` (uploads, live-site
  source of truth), `pexels` (licensed stock, allowed live, needs key),
  `openverse` (KEYLESS stock restricted to `license=cc0` so it's live-safe;
  the default when no Pexels key is set and the fallback when Pexels errors),
  `ai` (KEYLESS bespoke photography via Pollinations Flux — per-industry
  interior/detail prompts, NEVER people or text, honest "AI-generated
  photograph" credit, allowed live; `.github/workflows/generate-images.yml`
  + `assets/ai-photo-prompts.json` generate the same set on GitHub runners
  for environments whose network blocks the API). The generated set is
  committed to `assets/demo-photos/<industry>_{hero,detail}.jpg` and used by
  `attachBundledImages` as an INSTANT, OFFLINE, keyless default: the
  `/generate` handler and autopilot auto-attach the matching industry pair
  when a lead has no photos, so a generated site is never empty (the operator
  can then replace them with client uploads or fresh AI/stock). `places`
  (Google storefront, PREVIEW ONLY — `selectImages(lead, 'live')` strips it
  and the tests assert this; never weaken that). Live selection order: client >
  pexels > ai > openverse. Unlicensed sources (Pinterest, Google Images,
  social scrapes) are deliberately refused — never add one. Preview embeds
  data URIs; live mode (`generateSite(..., {mode:'live', imageMode:'files'})`)
  ships files under `images/`. An `<img>` renders only when bytes exist on
  disk, and stock/AI attach rejects non-photo content types.
- `lib/publish.js` — Vercel REST deploys; slug = name+city+id-suffix
  (collision-safe).
- `lib/mailer.js` — Resend via plain fetch. ONLY sends the operator digest;
  pitch emails are never auto-sent (ESP AUP + jurisdictional law).
- `lib/autopilot.js` — campaigns (geocoded once at creation), chained-
  setTimeout scheduler with overlap guard, per-run + daily caps, activity
  log, daily digest builder. Calls `searchBusinesses` directly — a live-API
  failure is a logged failed run, never a demo-data substitution.
- `lib/billing.js` — the $2k-setup + $250/mo care-plan model. Env pricing/
  agency config, won-lead→client promotion with a recurring retainer schedule,
  MRR, and `buildInvoiceRecord` (freezes a full snapshot: integer money, no
  float sums). Nothing here sends anything.
- `lib/invoice.js` / `lib/proposal.js` — self-contained HTML renderers.
  Invoices render PURELY from the frozen ledger record (never live lead/env,
  so a re-render can't drift); both are `noindex,nofollow` and served at
  unguessable `inv_`/`prop_` token URLs. Proposals are explicitly agency→
  business (letterhead, not impersonation).
- `public/app.js` — vanilla-JS hash-routed SPA (#/leads, #/lead/:id, #/sites,
  #/autopilot).

## Generator design system (lib/generator.js)

Section renderers driven by per-theme recipes: hero composition
(centered/split/diagonal/minimal), services layout (cards/numbered/twocol,
seed-picked from the theme's allowed list via `profile.layoutSeed`), brand
treatment, typographic tokens, abstract per-industry-group SVG motifs
(6 groups; keep them abstract — literal clip-art reads worse than nothing).

Content-adaptive layout (from the /impeccable critique; guarded by the
"no-photo leads get the compact hero" tests): a lead with NO photo gets the
compact hero on every theme — name as a letterspaced mark, tagline as the
h1, single bounded column, no motif, no reserved empty half; the theme's
two-column/motif hero returns only when a real photo exists (split shows the
photo in the hero and the about aside then skips it). Opening hours render as
a per-day strip inside the contact band (`.hours-strip`, keeps the `#hours`
anchor; same `parseOpeningHours` feed as the JSON-LD so page and schema can't
disagree; uncovered days get an explicit Closed row) — never as a standalone
one-row section. CTAs are honest: transactional labels (Book/Quote/Schedule)
render only when a bookingUrl or formEndpoint exists, otherwise the secondary
CTA says where it actually lands; the contact band's phone row is suppressed
when the action button already carries the number.
The SEO head (meta + JSON-LD) is one code path for all themes — there is a
parity test asserting identical structured data across themes; keep it green.
Copy comes from the seeded knowledge base in enrich.js (per-service
descriptions, 5 taglines/values per industry, heading variants) — never add
copy that repeats an identical sentence pattern across items.

Anti-pattern rules (audited against pbakaus/impeccable's detectors, enforced
by the two "impeccable guards" tests in test/generator.test.js — keep them
green): no uppercase tracked eyebrow/kicker chips, no side-tab accent borders
on cards or statements, no cream/beige page background, no single-font themes
(pair display + body — each theme's display and body must resolve to two
distinct, non-generic families), no overused/AI-default fonts as the primary
face (Helvetica, Arial, Inter, Geist, Fraunces, …; we ship only self-hosted
system stacks led by a distinctive face — Optima/Didot, Corbel/Avenir Next,
Lucida/SF Pro Rounded, Seravek/Iowan), no icon-tile-above-heading cards, no
numbered markers on non-sequential content, ≤3 em-dashes in rendered body
copy (AI cadence tell — write KB copy with commas/colons/periods), no nested
cards (the contact CTA panel is deliberately flat), no hairline-border +
wide-shadow combos, body text measures ≤ ~70ch.

The full impeccable skill is vendored at `.claude/skills/impeccable/`
(Apache-2.0, v3.9.1) so `/impeccable audit|critique|polish|…` and its
detector run offline. Audit a rendered page directly with
`node .claude/skills/impeccable/scripts/detect.mjs <file.html>` — all four
themes must report zero findings.

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
- **Billing safety.** Invoices are issuable only for a `won` client, never
  auto-sent. `data/invoices.jsonl` is an append-only ledger with NO `.bak`
  rotation — its integrity model is append-only. Invoice numbers come from
  `db.issueInvoice` (a synchronous read-max→assign→append critical section,
  tolerant of a truncated final line); never number by array length and never
  reissue. Payment state (`paidAt`) is mutable in db.json, keyed by number,
  and must never mutate the frozen ledger record. Don't add a "paid" value to
  the sales-pipeline `status`.
- Site/lead ids are validated (`[\w-]+` routes, regex in `readSiteHtml`)
  before touching the filesystem.
- db.json writes are atomic (tmp + rename, .bak kept). Don't reintroduce
  direct `writeFileSync` on the live path.
