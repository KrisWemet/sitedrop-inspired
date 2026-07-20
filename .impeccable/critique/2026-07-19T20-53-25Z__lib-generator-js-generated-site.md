---
target: generated site (lib/generator.js)
total_score: 31
p0_count: 1
p1_count: 1
timestamp: 2026-07-19T20-53-25Z
slug: lib-generator-js-generated-site
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Targets: two representative generated sites — `lead_salon.html` (Elegant, Shear Bliss Hair Studio) and `lead_plumb.html` (Bold, Hartley & Sons Plumbing) — plus all four themes scanned by the detector. Register: brand/marketing. Bar: a site a local owner would pay $2,000 + $250/mo for, that does not read as auto-generated.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Static brochure; sticky nav + focus states good, no active-section indication |
| 2 | Match System / Real World | 4 | Plain, human language; hours/services phrased as a customer thinks |
| 3 | User Control and Freedom | 3 | Anchors + FAQ toggles, but no back-to-top and the only real action is a phone call |
| 4 | Consistency and Standards | 4 | Rigorously consistent; JSON-LD parity across themes |
| 5 | Error Prevention | 3 | Few error surfaces (no form rendered) — avoidance, not design |
| 6 | Recognition Rather Than Recall | 4 | Everything visible on one page; contact repeated where needed |
| 7 | Flexibility and Efficiency | 2 | One path: every CTA resolves to "call this number" |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, but tips into *under*-filled; whitespace reads as missing content |
| 9 | Error Recovery | 2 | No fallback if a call isn't answered; no form/validation story |
| 10 | Help and Documentation | 3 | FAQ is a decent help layer |
| **Total** | | **31/40** | **Good — ship-worthy with real gaps** |

## Anti-Patterns Verdict

**Deterministic scan (Assessment B): fully clean.** `detect.mjs` returned **0 findings, exit 0** across both targets, all four themes, and the GPT/Gemini provider-specific passes. Browser evidence corroborates the fundamentals: **every** text/background pair passes WCAG AA (body 16–17:1, muted ~5.5–6:1, hero text on gradient 7.3–10:1, buttons 8–9.6:1); **zero** horizontal overflow at 1280px or 390px; H1 65.6px; body measure ~62ch; a visible focus outline on all 12 focusable elements per page. On measurable craft, these pass.

**LLM assessment (Assessment A): "AI made this" — yes, but not for the usual reasons.** The component craft is above the AI baseline (real font pairings, oldstyle numerals, drop cap, diagonal hero, dotted service leaders, noise texture, careful a11y/SEO). The tell is one layer up, where the rule detector can't see: **structural sameness and emptiness.**

- **Interchangeable skeleton.** Side by side, the two pages are the same wireframe recolored: sticky header → dark gradient hero with a faint motif → "Welcome" + "At a Glance" card → services → 3-up values band → near-empty hours strip → two-column FAQ → dark contact band → centered footer. The recipe system varies the garnish, never the page.
- **Emptiness that reads as unfinished.** These businesses ship with no photos and the layout advertises it rather than absorbing it: the plumber hero has a large blank right half; the Opening Hours section holds a single row in an 88px-padded full-width band; values/standards bands leave a dead column.
- **Generic copy cadence and zero un-generatable detail** — no owner name, no "since 1998," no real photo, no signature service.

**Where they agree:** the anti-pattern *primitives* are gone — both the detector and the human reviewer confirm no eyebrow chips, no cream-on-cream, no icon-tiles, good contrast. **Where the human caught what the detector can't:** skeleton sameness and empty-section composition are page-level judgments outside a per-element rule engine. The detector's silence is necessary, not sufficient — passing the linter and being worth $2k are different bars.

## Overall Impression

Component-level, a designer clearly touched this. Page-level, a machine assembled it. The single biggest opportunity is **content-adaptive layout**: design for the *little* content these businesses actually have, so thin data reads as deliberate restraint instead of an unfinished template.

## What's Working

1. **Typographic discipline is real.** Didot display + Optima body with oldstyle numerals and a serif drop-cap on the salon; heavy Avenir Next (800/-0.03em) + Corbel on the plumber. Two distinct, non-default voices — a detail most small-biz sites never bother with.
2. **Restraint at the anti-pattern level, verified two ways.** No tracked eyebrows, icon-tiles, cream backgrounds, or hairline+shadow cards — and the detector agrees at 0 findings.
3. **Solid invisible fundamentals.** `prefers-reduced-motion`, `:focus-visible` outlines on all interactive elements, `text-wrap:balance`, print stylesheet, and a thorough JSON-LD/SEO head (LocalBusiness subtype, FAQPage, speakable) — real value for the AEO pitch, and all AA-contrast-clean.

## Priority Issues

**[P0] Empty sections and hero voids broadcast "no content."**
- *Why it matters:* This is the biggest "AI-generated / unfinished" signal and the thing that breaks the $2k illusion. Owners and customers read whitespace-around-one-fact as "they didn't finish."
- *Fix:* Make layout content-adaptive. Collapse Opening Hours into a slim inline strip or the contact band instead of a full section; when there's no photo, center/left-bind the hero and drop the reserved empty column rather than filling 46% with a faint motif; when a values/services group has ≤3 items, use a tighter max-width composition instead of full bleed.
- *Suggested command:* `/impeccable layout`

**[P1] CTAs promise a booking/quote the page can't fulfill; the secondary CTA dead-ends.**
- *Why it matters:* The hero label renders transactional copy ("Book an Appointment," "Get a Free Quote") even when no booking URL or form endpoint is configured — in which case the button just scrolls to a phone-only contact band. The `.lead-form` styles ship but no form renders unless a `formEndpoint` is set. A button that doesn't do what it says erodes the exact trust a paid marketing site exists to build, and phone-only excludes everyone who won't cold-call.
- *Fix:* Make the label honest to the lead's actual capabilities — when there's no booking/form, either render a real lead-form (name/phone/message → owner email) so "Book"/"Quote" lands somewhere, or fall the label back to a truthful one ("See Hours & Location" / "Call Now"). Never ship a label that overpromises.
- *Suggested command:* `/impeccable clarify` (label honesty) + `/impeccable craft` (render the form)

**[P2] The contact-band CTA panel is redundant padding, not persuasion.**
- *Why it matters:* The right-hand panel repeats the phone number already listed inches to its left under generic "Let's talk today" copy. At the decision moment you want *new* reassurance, not a duplicate.
- *Fix:* Replace the duplicate with trust content at the point of decision — move "Licensed & insured / free estimates" (plumber) or "walk-ins welcome" (salon) next to the button, add a response expectation ("We usually answer within the hour"). One phone CTA, not two identical ones.
- *Suggested command:* `/impeccable clarify`

**[P3] The abstract SVG motif reads as "asset failed to load," not as art.**
- *Why it matters:* At opacity .08–.16 the hero line-art is barely perceptible and draws the eye to the missing photo. A stand-in that reads as absence is worse than a confident solid color.
- *Fix:* Either commit the motif harder (higher opacity/scale, anchored to the composition) or drop it for a richer gradient/geometric treatment that owns the space.
- *Suggested command:* `/impeccable bolder`

**[P3] No social proof or trust signals anywhere.**
- *Why it matters:* Local-service conversion runs on trust; a site with no ratings/years/credentials competes poorly with a Google listing that has stars.
- *Fix:* Add an optional trust strip (star line, "Serving Milltown since ___", license #) that renders when data exists, with a graceful empty state.
- *Suggested command:* `/impeccable craft`

## Persona Red Flags

**Jordan (first-timer):** Clicks the hero "Book an Appointment" expecting a form, scrolls to the contact band, finds only a phone number, stalls. The `.btn.ghost` secondary CTA has no matching action for a lead without a booking URL.

**Riley (stress tester):** Within 15 seconds spots that (a) both hero CTAs collapse to one phone number, (b) the CTA panel duplicates the number verbatim, (c) Opening Hours is one row in a huge band, (d) the plumber hero's blank right half, (e) "View map" points at an OpenStreetMap *search query* (not a pinned location), which for these addresses returns a broken-feeling result. Every "template" seam is visible.

**Casey (distracted mobile):** Best-served persona — the mobile stack is clean, the hero void disappears (`hero-side{display:none}`), "Call Now" is sticky. Red flags: the mobile Hours row still floats with big gaps; four near-identical service blocks + three values become a gray wall of small muted text with no scannable hierarchy; there's no tap-to-text or tap-to-map, which a distracted mobile user often prefers over a voice call.

## Minor Observations

- The same three facts (address/phone/hours) appear ~3× per page (At-a-Glance card, contact band, footer) — contributes to the "stretched thin" feeling.
- The visible Hours is a single "Tuesday–Saturday" row, wasting the richer `openingHoursSpecification` already in the JSON-LD.
- Footer is a lone centered copyright line — a missed chance for a compact contact/nav repeat.
- The salon hero has two human chips ("Wheelchair accessible," "Cards accepted"); the plumber hero has none, so the two heroes feel unevenly furnished.
- FAQ force-opens item one; in the desktop two-column layout that makes the left column taller, a slight imbalance.

## Questions to Consider

1. If you removed the name and colors, could anyone tell the two sites apart from the wireframe alone — and if not, what is the $2,000 buying beyond a recolor?
2. The pitch is "no website → we build one," yet the only conversion path is a phone call — the channel these owners already have. What net-new capability does the site give them that a Google Business Profile doesn't?
3. You've engineered hard against the anti-pattern *detector* (0 findings). Is the design optimizing for the absence of findings rather than for a present, memorable point of view?
