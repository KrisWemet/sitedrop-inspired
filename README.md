# SiteSpark — a sitedrop.ai-inspired recreation

Find local businesses **without websites**, gather their information, and generate a
professional website for them — the full sitedrop.ai loop in one self-hosted app.

**Zero dependencies.** No build step, no `npm install`. Just:

```bash
npm start        # → http://localhost:3000
```

## What it does

1. **Lead Finder** — search any niche in any city (e.g. *plumber* in *Asheville, NC*).
   Businesses are pulled live from OpenStreetMap; any business with no `website` tag is
   auto-flagged 🔥, scored by contactability (phone / email / address / hours), and
   sorted to the top of the list.

2. **Gather Information** — one click compiles a prospect profile: contact channels,
   parsed opening hours, industry classification (11 categories), gathered data points,
   and ready-to-use positioning copy — tagline, about text, services, value props.

3. **Verify before you pitch** — the no-website flag comes from map data, so one
   click verifies it: probes the listed website (dead sites and parked domains get
   re-flagged hot), detects Facebook/Instagram-only "websites", and DNS+HTTP-probes
   likely domains guessed from the business name so you don't pitch someone whose
   site simply isn't mapped.

4. **Generate Website** — builds a complete, responsive, professionally designed
   one-page site from the gathered data: sticky nav, hero with call CTA, about +
   at-a-glance card, services grid, "why choose us", FAQ, and a contact band with
   per-day opening hours and map link. Four themes (Warm / Elegant / Bold / Clean),
   auto-matched to the industry and switchable per generation. The layout adapts
   to the content it actually has: photo-less businesses get a deliberately
   compact hero (no empty half waiting for a missing image), and hours render as
   a slim strip beside the contact info instead of a near-empty section. Live
   preview in-tab; each site is one self-contained HTML file you can download and
   host anywhere.
   **Lead capture without JavaScript:** add a booking link (Calendly/Cal.com/Square)
   and/or a hosted contact-form endpoint (Formspree/Basin/Web3Forms) per lead — the
   site renders a real `<form>` that posts natively (no JS) and retargets the hero CTA
   to real booking, so a button never dead-scrolls to a services blurb. **Placeholder
   contact data** (`example.com` and other reserved domains) is stripped from the live
   site and its schema automatically, so a fake email can never ship.

5. **Extreme SEO + AI optimization, baked into every site** — each generated page
   ships with:
   - **JSON-LD structured data**: `LocalBusiness` subtype (schema.org/Plumber,
     /Bakery, /HairSalon, …45+ mappings) with `openingHoursSpecification`, geo
     coordinates, offer catalog; `FAQPage`; `WebPage` with **speakable** markup for
     voice/AI assistants
   - **Local keyword weaving** ("plumber in Milltown, OR", "… near me") through the
     title, meta description, headings, and copy
   - Open Graph + Twitter cards, geo meta tags (`geo.position`, `ICBM`,
     `geo.region`), tuned robots directives
   - An on-page **FAQ section** mirrored in FAQPage schema (answer-engine bait)
   - Semantic HTML5, single h1, zero render-blocking external resources
   - A downloadable **deploy pack (.zip)**: `index.html` + `robots.txt` that
     explicitly welcomes AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) +
     `sitemap.xml` + **`llms.txt`** (a plain-language business brief for AI
     assistants)
   - A per-site **SEO/AEO report** in the dashboard showing everything baked in

6. **Work the pipeline** — pipeline statuses (new → contacted → pitched → won/lost),
   per-lead notes, one-click **pitch email drafts** (references their missing site,
   AI-search invisibility, and the preview link; `mailto:` ready), and CSV export of
   all leads.

7. **Autopilot** — save a campaign ("plumbers near Asheville, every 24h") and the
   whole pipeline runs unattended: search → verify → enrich → generate the website →
   draft the pitch. A daily **digest email** (via Resend) tells you which pitches are
   ready to send and which contacted leads need follow-up. Guardrails by design:
   campaigns are geocoded once at creation, live-API failures never fall back to demo
   data, per-run and daily generation caps bound API spend, and **no prospect is ever
   emailed automatically** — cold sends stay a human decision (most email providers'
   acceptable-use policies, and several countries' laws, prohibit automated cold email
   to scraped addresses). Every generated site awaits your one-click review.

8. **Close the deal** — a **proposal** page (a private, `noindex` sales document from
   your studio to the business, with the live preview link and clear pricing), and,
   once a lead is marked **won**, a **care plan** (the $2,000-upfront + $250/month
   model) with **invoices**. Invoices are frozen snapshots in an append-only ledger —
   sequential numbers that never reuse, rendered only from the frozen record so they
   can't drift — issued only for a won client, never auto-sent. The digest rolls up
   MRR and flags retainers due. Configure via `AGENCY_NAME`/`AGENCY_EMAIL`/…,
   `PRICE_SETUP` (2000), `PRICE_MONTHLY` (250), `AGENCY_TAX_RATE` (0).

## Usage

- Open **http://localhost:3000** for the landing page, or **/app** for the dashboard.
- **Live search:** enter a business type and a real city ("hair salon" + "Portland, OR").
  Data comes from the free Nominatim + Overpass OpenStreetMap APIs — no API key needed.
- **Offline / demo:** type `demo` as the location to use a bundled fictional dataset
  (also used automatically as a fallback when the live APIs are unreachable).
- **Optional AI copywriting:** set `ANTHROPIC_API_KEY` before starting and the
  enrichment step will have Claude write bespoke tagline/about/services copy instead of
  the built-in industry templates (model override via `CLAUDE_MODEL`, default
  `claude-sonnet-5`).

- **One-click publishing (Vercel):** create a token at
  [vercel.com/account/tokens](https://vercel.com/account/tokens) and start with
  `VERCEL_TOKEN` set. Every generated site gets a **🚀 Publish live** button that
  deploys it (with robots.txt, sitemap.xml, and llms.txt) to its own Vercel project —
  `business-name.vercel.app` — and outreach drafts automatically switch to the live
  URL. Optional `VERCEL_TEAM_ID` for team scopes.

- **Daily digest email:** set `RESEND_API_KEY`, `OUTREACH_FROM` (verified sender),
  and `DIGEST_TO` (your inbox). Optional `DIGEST_HOUR` (default 8). Without these,
  autopilot still runs — activity just stays in the dashboard.
- **Photos:** four sources with different rules. The licensed-stock picker
  works **with no key at all**: it searches [Openverse](https://openverse.org)
  for **CC0 (public-domain)** photos with curated per-industry queries, safe
  for live client sites with no attribution required. `PEXELS_API_KEY` (free
  at pexels.com/api) switches the picker to the bigger, better-curated Pexels
  library (Pexels license, also live-safe; falls back to Openverse if Pexels
  errors); `GOOGLE_PLACES_API_KEY` pulls the business's real **storefront
  photo from its Google listing for the preview only** (Google's terms
  restrict reuse, so it is stripped from every deploy pack and publish
  automatically); **client uploads** (JPEG/PNG/WebP, per-lead, on the lead
  page) are the live-site source of truth. Previews embed photos into the
  single HTML file; live output ships them as real files in an `images/`
  folder. Sources without verifiable reuse rights (Pinterest boards, Google
  Images) are deliberately not supported — pins are third-party copyrighted
  photos, and a paid client site is the worst place to ship one.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
VERCEL_TOKEN=... npm start       # enables 🚀 Publish live
RESEND_API_KEY=... OUTREACH_FROM=you@yourdomain.com DIGEST_TO=you@gmail.com npm start
BASE_URL=https://your-host npm start   # drafted pitches use real links
PORT=8080 npm start              # custom port
```

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/search` | POST | `{query, location, radiusKm}` → leads with no-website flags & scores |
| `/api/leads` | GET | all saved leads + recent searches |
| `/api/leads/:id` | GET | one lead |
| `/api/leads/:id` | PATCH | `{status?, notes?}` — pipeline status + notes |
| `/api/leads/:id/enrich` | POST | gather info → prospect profile |
| `/api/leads/:id/verify` | POST | verify web presence (dead/social-only/domain probing) |
| `/api/leads/:id/generate` | POST | `{theme?}` → build the website (auto-enriches if needed) |
| `/api/leads/:id/outreach` | POST | draft a pitch email (auto-generates the site if needed) |
| `/api/leads.csv` | GET | export all leads as CSV |
| `/api/sites` | GET | all generated sites |
| `/sites/:id.html` | GET | the generated website (`?download` for attachment) |
| `/sites/:id/pack.zip` | GET | deploy pack: index.html + robots.txt + sitemap.xml + llms.txt |
| `/api/sites/:id/publish` | POST | deploy the site to Vercel (needs `VERCEL_TOKEN`) |
| `/api/campaigns` | GET/POST | list / create autopilot campaigns |
| `/api/campaigns/:id` | PATCH/DELETE | pause/resume/retime or delete a campaign |
| `/api/campaigns/:id/run` | POST | run a campaign immediately |
| `/api/autopilot` | GET | scheduler status, caps, activity log |
| `/api/autopilot/digest` | POST | build (and send, if configured) the digest now |
| `/api/leads/:id/proposal` | POST | build the proposal page → token URL |
| `/api/leads/:id/client` | POST | start the care plan (won leads only) |
| `/api/leads/:id/invoice` | POST | `{kind:setup\|retainer}` → issue an invoice |
| `/api/invoices/:number/paid` | POST | mark an invoice paid |
| `/proposals/:token.html` | GET | the proposal (noindex, unguessable token) |
| `/invoices/:token.html` | GET | the invoice (noindex, unguessable token) |

## Project layout

```
server.js            zero-dependency HTTP server + router
lib/osm.js           Nominatim geocoding + Overpass business search + lead scoring
lib/enrich.js        prospect profiling, industry knowledge base, optional Claude copy
lib/generator.js     self-contained website generator (4 themes)
lib/demo-data.js     fictional fallback dataset
lib/store.js         JSON-file persistence (data/db.json, data/sites/*.html)
public/              landing page + dashboard SPA (vanilla JS)
```

## Notes

- Business data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
  Coverage of phone/email/website tags varies by region; the no-website flag means "no
  website recorded in OSM" — verify before pitching.
- Demo-mode businesses are fictional and clearly labeled in the UI.
- This is an independent open-source recreation inspired by
  [sitedrop.ai](https://sitedrop.ai); it is not affiliated with them.
