// SEO + AI-optimization (AEO/GEO) engine. Builds everything search engines
// and AI crawlers feed on: JSON-LD structured data (LocalBusiness subtype,
// FAQPage, WebSite/WebPage with speakable), meta/OG/geo tags, local keyword
// sets, FAQ content, and the deploy-pack files (robots.txt with AI crawlers
// explicitly welcomed, sitemap.xml, llms.txt).

const titleCase = (s = '') => s.replace(/\b\w/g, (c) => c.toUpperCase());
// Services are `{name, desc}` objects (older data may hold plain strings).
const svcName = (s) => (typeof s === 'string' ? s : s?.name || '');

// ---- schema.org LocalBusiness subtype mapping ----
const SCHEMA_TYPES = [
  ['plumber', 'Plumber'],
  ['electrician', 'Electrician'],
  ['roofer', 'RoofingContractor'],
  ['painter', 'HousePainter'],
  ['hvac', 'HVACBusiness'],
  ['locksmith', 'Locksmith'],
  ['carpenter', 'GeneralContractor'],
  ['car repair', 'AutoRepair'],
  ['car wash', 'AutoWash'],
  ['restaurant', 'Restaurant'],
  ['fast food', 'FastFoodRestaurant'],
  ['ice cream', 'IceCreamShop'],
  ['cafe', 'CafeOrCoffeeShop'],
  ['bar', 'BarOrPub'],
  ['pub', 'BarOrPub'],
  ['bakery', 'Bakery'],
  ['hairdresser', 'HairSalon'],
  ['beauty', 'BeautySalon'],
  ['tattoo', 'TattooParlor'],
  ['spa', 'DaySpa'],
  ['dentist', 'Dentist'],
  ['doctors', 'MedicalClinic'],
  ['veterinary', 'VeterinaryCare'],
  ['pharmacy', 'Pharmacy'],
  ['optician', 'Optician'],
  ['fitness', 'ExerciseGym'],
  ['gym', 'ExerciseGym'],
  ['lawyer', 'Attorney'],
  ['accountant', 'AccountingService'],
  ['estate agent', 'RealEstateAgent'],
  ['insurance', 'InsuranceAgency'],
  ['florist', 'Florist'],
  ['books', 'BookStore'],
  ['clothes', 'ClothingStore'],
  ['jewelry', 'JewelryStore'],
  ['furniture', 'FurnitureStore'],
  ['hardware', 'HardwareStore'],
  ['doityourself', 'HardwareStore'],
  ['pet', 'PetStore'],
  ['convenience', 'ConvenienceStore'],
  ['supermarket', 'GroceryStore'],
  ['hotel', 'Hotel'],
  ['guest house', 'BedAndBreakfast'],
  ['gardener', 'HomeAndConstructionBusiness'],
  ['cleaning', 'HomeAndConstructionBusiness'],
  ['laundry', 'DryCleaningOrLaundry'],
  ['dry cleaning', 'DryCleaningOrLaundry'],
];

export function schemaTypeFor(category = '') {
  const c = category.toLowerCase();
  for (const [needle, type] of SCHEMA_TYPES) {
    if (c.includes(needle)) return type;
  }
  return 'LocalBusiness';
}

// ---- OSM opening_hours → schema.org openingHoursSpecification ----
const DAY_FULL = {
  Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday',
  Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday',
};
const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function parseOpeningHours(oh) {
  if (!oh) return [];
  const specs = [];
  for (const part of String(oh).split(';')) {
    const m = part.trim().match(/^([A-Z][a-z](?:-[A-Z][a-z])?(?:,\s*[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    const days = [];
    for (const token of m[1].split(',')) {
      const range = token.trim().split('-');
      if (range.length === 2) {
        const from = DAY_ORDER.indexOf(range[0]);
        const to = DAY_ORDER.indexOf(range[1]);
        if (from < 0 || to < 0) continue;
        for (let i = from; i !== (to + 1) % 7; i = (i + 1) % 7) {
          days.push(DAY_FULL[DAY_ORDER[i]]);
          if (days.length > 7) break;
        }
      } else if (DAY_FULL[range[0]]) {
        days.push(DAY_FULL[range[0]]);
      }
    }
    if (!days.length) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days,
      opens: m[2].padStart(5, '0'),
      closes: m[3].padStart(5, '0'),
    });
  }
  return specs;
}

// ---- local keyword set, woven through copy and metadata ----
export function keywordSet(lead, profile) {
  const cat = lead.category.toLowerCase();
  const city = lead.city || '';
  const cityState = [lead.city, lead.state].filter(Boolean).join(', ');
  const kws = [
    cityState ? `${cat} in ${cityState}` : `local ${cat}`,
    city ? `${cat} ${city}` : null,
    `${cat} near me`,
    city ? `best ${cat} in ${city}` : `best local ${cat}`,
    ...(profile?.services || []).slice(0, 3).map((s) =>
      city ? `${svcName(s).toLowerCase()} ${city}` : svcName(s).toLowerCase()),
    lead.cuisine && city ? `${lead.cuisine} ${city}` : null,
  ].filter(Boolean);
  return [...new Set(kws)];
}

// ---- FAQ content (rendered on-page AND emitted as FAQPage JSON-LD) ----
export function buildFaqs(lead, profile) {
  const city = lead.city || 'the local area';
  const cat = lead.category.toLowerCase();
  const name = lead.name;
  const faqs = [];

  faqs.push({
    q: `Where is ${name} located?`,
    a: lead.address
      ? `${name} is located at ${lead.address}. We proudly serve ${city} and the surrounding area.`
      : `${name} serves ${city} and the surrounding area. Contact us for service details.`,
  });

  if (profile.hoursHuman?.length) {
    faqs.push({
      q: `What are ${name}'s opening hours?`,
      a: `Our current hours are: ${profile.hoursHuman.join('; ')}. Hours may vary on holidays — call ahead to confirm.`,
    });
  }

  faqs.push({
    q: `How do I contact ${name}?`,
    a: [
      lead.phone ? `Call us at ${lead.phone}` : null,
      lead.email ? `email ${lead.email}` : null,
      lead.address ? `or visit us at ${lead.address}` : null,
    ].filter(Boolean).join(', ') + '. We respond quickly and are happy to answer questions.',
  });

  const industryFaq = {
    restaurant: { q: `Does ${name} take reservations or offer takeout?`, a: `Yes — give us a call and we'll take care of you. Ask about catering and private events too.` },
    cafe: { q: `Does ${name} have Wi-Fi and seating for working?`, a: `Stop in and make yourself at home — we're a favorite spot in ${city} for meeting or getting things done.` },
    bakery: { q: `Can I order a custom cake from ${name}?`, a: `Absolutely. Contact us with your date and occasion and we'll walk you through options and pricing.` },
    salon: { q: `Do I need an appointment at ${name}?`, a: `Appointments are recommended so we can give you unhurried attention — call to book, and ask about walk-in availability.` },
    trades: { q: `Does ${name} offer free estimates?`, a: `Yes — we provide upfront, no-obligation quotes before any work begins, anywhere in the ${city} area.` },
    auto: { q: `Does ${name} provide repair estimates?`, a: `Yes. We diagnose first, show you the problem, and give a clear estimate before any work starts.` },
    health: { q: `Is ${name} accepting new patients?`, a: `Contact us to ask about new patient availability and insurance — we'll get you scheduled as quickly as we can.` },
    fitness: { q: `Does ${name} offer trials or beginner options?`, a: `Yes — all levels are welcome. Contact us about trial passes and beginner-friendly programs.` },
    professional: { q: `Does ${name} offer an initial consultation?`, a: `Yes — reach out to schedule an initial consultation and we'll explain your options in plain language.` },
    retail: { q: `Can ${name} order items not in stock?`, a: `In most cases, yes — ask us about special orders and we'll track down what you need.` },
    hospitality: { q: `How do I book a stay at ${name}?`, a: `Call or email us directly for availability and rates — booking direct always gets you our best answer.` },
    generic: { q: `Why choose ${name}?`, a: `We're locally owned, easy to reach, and we stand behind our work. Ask around ${city} — our reputation is our best advertising.` },
  }[profile.industry] || null;
  if (industryFaq) faqs.push(industryFaq);

  faqs.push({
    q: `What areas does ${name} serve?`,
    a: `We serve ${city}${lead.state ? ', ' + lead.state : ''} and nearby communities. If you're close by, chances are we can help — just ask.`,
  });

  return faqs;
}

// ---- JSON-LD ----
export function buildJsonLd(lead, profile, faqs) {
  const cityState = [lead.city, lead.state].filter(Boolean).join(', ');
  const business = {
    '@context': 'https://schema.org',
    '@type': schemaTypeFor(lead.category),
    '@id': '#business',
    name: lead.name,
    description: profile.about,
    slogan: profile.tagline,
  };
  if (lead.phone) business.telephone = lead.phone;
  if (lead.email) business.email = lead.email;
  if (lead.address || lead.city) {
    business.address = {
      '@type': 'PostalAddress',
      ...(lead.address ? { streetAddress: lead.address.split(',')[0] } : {}),
      ...(lead.city ? { addressLocality: lead.city } : {}),
      ...(lead.state ? { addressRegion: lead.state } : {}),
    };
  }
  if (lead.lat && lead.lon) {
    business.geo = { '@type': 'GeoCoordinates', latitude: lead.lat, longitude: lead.lon };
    business.hasMap = `https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lon}#map=17/${lead.lat}/${lead.lon}`;
  }
  const hoursSpec = parseOpeningHours(lead.openingHours);
  if (hoursSpec.length) business.openingHoursSpecification = hoursSpec;
  if (cityState) business.areaServed = { '@type': 'City', name: lead.city };
  if (lead.cuisine) business.servesCuisine = titleCase(lead.cuisine);
  if (profile.services?.length) {
    business.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: profile.services.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: svcName(s) },
      })),
    };
  }

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${lead.name}${cityState ? ' | ' + titleCase(lead.category) + ' in ' + cityState : ''}`,
    description: profile.about,
    about: { '@id': '#business' },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#about-text', '.hero h1', '.hero .lead'],
    },
  };

  const faqPage = faqs.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  return [business, webPage, faqPage].filter(Boolean);
}

// ---- meta / OG / geo tag block (returns raw HTML for the <head>) ----
const escAttr = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function buildMetaTags(lead, profile, keywords) {
  const cityState = [lead.city, lead.state].filter(Boolean).join(', ');
  const title = `${lead.name} | ${titleCase(lead.category)}${cityState ? ' in ' + cityState : ''}`;
  const description = clampDescription(
    `${lead.name} — ${profile.tagline} ${titleCase(lead.category)} serving ${lead.city || 'the local area'}${lead.state ? ', ' + lead.state : ''}.` +
    (lead.phone ? ` Call ${lead.phone}.` : '') +
    (profile.services?.length ? ` ${profile.services.slice(0, 3).map(svcName).join(', ')}.` : '')
  );

  const tags = [
    `<title>${escAttr(title)}</title>`,
    `<meta name="description" content="${escAttr(description)}">`,
    `<meta name="keywords" content="${escAttr(keywords.join(', '))}">`,
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">`,
    `<meta property="og:type" content="business.business">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:site_name" content="${escAttr(lead.name)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escAttr(title)}">`,
    `<meta name="twitter:description" content="${escAttr(description)}">`,
  ];
  if (lead.city) tags.push(`<meta name="geo.placename" content="${escAttr(cityState || lead.city)}">`);
  if (lead.state) tags.push(`<meta name="geo.region" content="US-${escAttr(lead.state)}">`);
  if (lead.lat && lead.lon) {
    tags.push(`<meta name="geo.position" content="${lead.lat};${lead.lon}">`);
    tags.push(`<meta name="ICBM" content="${lead.lat}, ${lead.lon}">`);
  }
  return { title, description, html: tags.join('\n') };
}

function clampDescription(s) {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length <= 158) return clean;
  return clean.slice(0, 155).replace(/[,;\s]+\S*$/, '') + '…';
}

// ---- deploy-pack files ----

// robots.txt that explicitly welcomes AI crawlers (AEO): being visible to
// AI assistants is the "AI optimization" a website-less business is missing.
export function robotsTxt() {
  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
    'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended',
    'Bytespider', 'CCBot', 'meta-externalagent'];
  return [
    '# All crawlers welcome — including AI assistants and answer engines.',
    'User-agent: *',
    'Allow: /',
    '',
    ...aiBots.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
    'Sitemap: /sitemap.xml',
    '',
  ].join('\n');
}

export function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

// llms.txt — a plain-language brief for AI crawlers/answer engines.
export function llmsTxt(lead, profile, faqs) {
  const cityState = [lead.city, lead.state].filter(Boolean).join(', ');
  const lines = [
    `# ${lead.name}`,
    '',
    `> ${titleCase(lead.category)}${cityState ? ' in ' + cityState : ''}. ${profile.tagline}`,
    '',
    profile.about,
    '',
    '## Key facts',
    '',
    `- Business type: ${titleCase(lead.category)}${lead.cuisine ? ' (' + titleCase(lead.cuisine) + ')' : ''}`,
    cityState ? `- Location: ${lead.address || cityState}` : null,
    lead.phone ? `- Phone: ${lead.phone}` : null,
    lead.email ? `- Email: ${lead.email}` : null,
    profile.hoursHuman?.length ? `- Hours: ${profile.hoursHuman.join('; ')}` : null,
    `- Services: ${profile.services.map(svcName).join(', ')}`,
    '',
    '## Frequently asked questions',
    '',
    ...faqs.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
  ].filter((l) => l !== null);
  return lines.join('\n');
}

// ---- SEO checklist shown in the dashboard after generation ----
export function seoChecklist(lead, profile) {
  const hoursSpec = parseOpeningHours(lead.openingHours);
  return [
    { label: `LocalBusiness structured data (schema.org/${schemaTypeFor(lead.category)})`, ok: true },
    { label: 'FAQPage structured data + on-page FAQ section', ok: true },
    { label: 'Speakable markup for voice/AI assistants', ok: true },
    { label: 'SEO title & meta description with local keywords', ok: true },
    { label: 'Open Graph + Twitter card tags', ok: true },
    { label: 'Geo meta tags (geo.position, ICBM, geo.region)', ok: Boolean(lead.lat && lead.lon) || Boolean(lead.state) },
    { label: 'Opening hours as openingHoursSpecification', ok: hoursSpec.length > 0 },
    { label: 'Click-to-call phone markup', ok: Boolean(lead.phone) },
    { label: 'Semantic HTML5 (header/main/section/address, single h1)', ok: true },
    { label: 'Mobile-friendly viewport + responsive layout', ok: true },
    { label: 'Zero render-blocking external resources (inline CSS, no JS)', ok: true },
    { label: 'AI-crawler-friendly robots.txt + llms.txt in deploy pack', ok: true },
    { label: 'sitemap.xml in deploy pack', ok: true },
  ];
}
