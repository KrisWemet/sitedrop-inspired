// Enrichment: turn a raw discovered lead into a full business profile —
// industry classification, service list, positioning copy, parsed hours.
// Deterministic industry knowledge base by default; if ANTHROPIC_API_KEY is
// set, Claude rewrites the copy for a bespoke feel.

const INDUSTRIES = {
  restaurant: {
    match: ['restaurant', 'fast food', 'food court', 'ice cream'],
    theme: 'warm',
    services: ['Dine-in', 'Takeout', 'Catering & private events', 'Seasonal specials'],
    values: [
      ['Fresh, local ingredients', 'Menus built around what is in season and sourced nearby.'],
      ['Made from scratch', 'Every dish is prepared in-house, the way it should be.'],
      ['A table for everyone', 'Warm service whether it is date night or family night.'],
    ],
    taglines: ['Good food, made right.', 'Where every meal feels like home.', 'Honest cooking, generous portions.'],
    heroCta: 'View Our Menu',
  },
  cafe: {
    match: ['cafe', 'coffee'],
    theme: 'warm',
    services: ['Espresso & pour-over coffee', 'Fresh pastries', 'Breakfast & lunch', 'Free Wi-Fi workspace'],
    values: [
      ['Carefully sourced beans', 'We roast and brew coffee we are proud to serve.'],
      ['Baked fresh daily', 'Pastries and breads made every morning.'],
      ['Your neighborhood spot', 'A place to meet, work, or slow down.'],
    ],
    taglines: ['Your daily ritual, done right.', 'Coffee worth crossing town for.'],
    heroCta: 'See What’s Brewing',
  },
  bakery: {
    match: ['bakery', 'pastry', 'confectionery'],
    theme: 'warm',
    services: ['Artisan breads', 'Cakes & custom orders', 'Pastries & sweets', 'Wholesale for cafes'],
    values: [
      ['Baked before sunrise', 'Everything on the shelf was made this morning.'],
      ['Real ingredients', 'Butter, flour, and patience — no shortcuts.'],
      ['Custom celebration cakes', 'Tell us the occasion; we will make it memorable.'],
    ],
    taglines: ['Fresh from the oven, every morning.', 'Baked with patience, served with pride.'],
    heroCta: 'Order Ahead',
  },
  salon: {
    match: ['hairdresser', 'beauty', 'barber', 'nail', 'spa', 'tattoo', 'cosmetics'],
    theme: 'elegant',
    services: ['Cuts & styling', 'Color & highlights', 'Special occasion styling', 'Consultations'],
    values: [
      ['Listen first', 'Every appointment starts with what you want.'],
      ['Skilled, certified stylists', 'A team that keeps learning the latest techniques.'],
      ['Relax while you are here', 'Unhurried appointments in a comfortable space.'],
    ],
    taglines: ['Look sharp. Feel sharper.', 'Leave looking like the best version of you.'],
    heroCta: 'Book an Appointment',
  },
  trades: {
    match: ['plumber', 'electrician', 'roofer', 'carpenter', 'painter', 'hvac', 'locksmith', 'cleaning', 'gardener', 'landscap', 'handyman', 'builder'],
    theme: 'bold',
    services: ['Free estimates', 'Repairs & maintenance', 'New installations', 'Emergency call-outs'],
    values: [
      ['Licensed & insured', 'Fully certified work that passes inspection the first time.'],
      ['Upfront pricing', 'A clear quote before we start — no surprises on the invoice.'],
      ['On time, every time', 'We respect your schedule and your home.'],
    ],
    taglines: ['Done right the first time.', 'The call your neighbors recommend.'],
    heroCta: 'Get a Free Quote',
  },
  auto: {
    match: ['car repair', 'car wash', 'tyres', 'car parts', 'mechanic'],
    theme: 'bold',
    services: ['Diagnostics & inspection', 'Brakes, tires & alignment', 'Oil changes & tune-ups', 'Engine & transmission work'],
    values: [
      ['Straight answers', 'We show you the problem before we fix it.'],
      ['Certified technicians', 'Factory-trained mechanics on every job.'],
      ['Fair, posted pricing', 'Estimates you can hold us to.'],
    ],
    taglines: ['Keeping you safely on the road.', 'Honest wrenching since day one.'],
    heroCta: 'Schedule Service',
  },
  health: {
    match: ['dentist', 'doctor', 'clinic', 'chiropractor', 'veterinary', 'pharmacy', 'physiotherap', 'optician', 'healthcare'],
    theme: 'clean',
    services: ['New patient exams', 'Preventive care', 'Same-week appointments', 'Insurance accepted'],
    values: [
      ['Patients, not numbers', 'Appointments that never feel rushed.'],
      ['Modern, gentle care', 'Up-to-date equipment and techniques.'],
      ['Clear communication', 'You will always understand your options and costs.'],
    ],
    taglines: ['Care you can feel good about.', 'Modern care with a personal touch.'],
    heroCta: 'Request an Appointment',
  },
  fitness: {
    match: ['fitness', 'gym', 'yoga', 'sports', 'dance', 'martial'],
    theme: 'bold',
    services: ['Open gym memberships', 'Personal training', 'Group classes', 'Beginner programs'],
    values: [
      ['All levels welcome', 'From first workout to competition prep.'],
      ['Coaches who care', 'Real programming, real form checks, real progress.'],
      ['A community, not a crowd', 'Train with people who learn your name.'],
    ],
    taglines: ['Stronger starts here.', 'Show up. We will handle the rest.'],
    heroCta: 'Start Your Free Trial',
  },
  professional: {
    match: ['lawyer', 'accountant', 'estate agent', 'insurance', 'financial', 'consultant', 'notary', 'office'],
    theme: 'clean',
    services: ['Free initial consultation', 'Transparent flat-fee options', 'Responsive communication', 'Local expertise'],
    values: [
      ['Experience that matters', 'Years of practice serving clients like you.'],
      ['Plain-language advice', 'Complex matters explained clearly.'],
      ['Your advocate', 'We work for your outcome, start to finish.'],
    ],
    taglines: ['Trusted guidance, close to home.', 'Advice you can act on.'],
    heroCta: 'Schedule a Consultation',
  },
  retail: {
    match: ['books', 'clothes', 'boutique', 'florist', 'furniture', 'hardware', 'jewelry', 'gift', 'pet', 'shop', 'convenience', 'supermarket', 'butcher', 'grooming'],
    theme: 'elegant',
    services: ['Curated in-store selection', 'Special orders', 'Gift wrapping', 'Local delivery'],
    values: [
      ['Hand-picked selection', 'Every item on our shelves earned its place.'],
      ['Real recommendations', 'Staff who know the stock and love the craft.'],
      ['Shop local, feel it', 'Your purchase stays in the community.'],
    ],
    taglines: ['Found only here.', 'Worth the trip downtown.'],
    heroCta: 'Visit the Shop',
  },
  hospitality: {
    match: ['hotel', 'guest house', 'hostel', 'bed and breakfast', 'motel'],
    theme: 'elegant',
    services: ['Comfortable rooms', 'Local recommendations', 'Flexible check-in', 'Group bookings'],
    values: [
      ['Rest easy', 'Quiet, spotless rooms and genuinely comfortable beds.'],
      ['Local hosts', 'Ask us anything — we live here.'],
      ['Honest rates', 'No resort fees, no surprises.'],
    ],
    taglines: ['Your home base in town.', 'Stay where the locals would send you.'],
    heroCta: 'Check Availability',
  },
  generic: {
    match: [],
    theme: 'clean',
    services: ['Personalized service', 'Local expertise', 'Fair pricing', 'Satisfaction guaranteed'],
    values: [
      ['Locally owned', 'Rooted in the community we serve.'],
      ['Quality first', 'We stand behind every job and every sale.'],
      ['Easy to reach', 'Call, email, or stop by — a real person answers.'],
    ],
    taglines: ['Proudly serving our neighbors.', 'Local, reliable, recommended.'],
    heroCta: 'Get in Touch',
  },
};

export function classifyIndustry(category = '') {
  const c = category.toLowerCase();
  for (const [key, def] of Object.entries(INDUSTRIES)) {
    if (def.match.some((m) => c.includes(m))) return key;
  }
  return 'generic';
}

// Stable pseudo-random pick so the same business always gets the same copy.
function pick(arr, seedStr, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return arr[Math.abs(h) % arr.length];
}

const DAY_NAMES = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };

// Best-effort humanizer for common OSM opening_hours syntax.
export function humanizeHours(oh) {
  if (!oh) return null;
  try {
    return oh.split(';').map((part) => {
      const m = part.trim().match(/^([A-Z][a-z](?:-[A-Z][a-z])?(?:,\s*[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+(.+)$/);
      if (!m) return part.trim();
      const days = m[1].split(',').map((d) => {
        const range = d.trim().split('-');
        return range.map((r) => DAY_NAMES[r] || r).join(' – ');
      }).join(', ');
      const times = m[2].split(',').map((t) => {
        return t.trim().split('-').map((hm) => {
          const [h, min] = hm.trim().split(':').map(Number);
          if (Number.isNaN(h)) return hm;
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return min ? `${h12}:${String(min).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
        }).join(' – ');
      }).join(', ');
      return `${days}: ${times}`;
    });
  } catch {
    return [oh];
  }
}

function buildAbout(lead, industry) {
  const place = lead.city ? `${lead.city}${lead.state ? ', ' + lead.state : ''}` : 'the local area';
  const cat = lead.category;
  const cuisineBit = lead.cuisine ? ` known for ${lead.cuisine}` : '';
  const intros = [
    `${lead.name} is a locally owned ${cat}${cuisineBit} proudly serving ${place}.`,
    `Right in the heart of ${place}, ${lead.name} has built its reputation as the ${cat} neighbors recommend${cuisineBit}.`,
    `${lead.name} brings genuine, personal service to ${place} — the kind only a local ${cat}${cuisineBit} can offer.`,
  ];
  const closers = [
    'We believe in doing things properly, treating customers like neighbors, and standing behind our work every single day.',
    'From your first visit, you will notice the difference that local ownership and real pride in the craft make.',
    'Stop by or give us a call — we would love to meet you.',
  ];
  return `${pick(intros, lead.id, 1)} ${pick(closers, lead.id, 2)}`;
}

async function claudeRewrite(profile, lead) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Write website copy for this local business. Respond with ONLY valid JSON: {"tagline": string (max 8 words), "about": string (2-3 sentences), "services": string[4], "values": [[title, one-sentence description] x3]}.\n\nBusiness: ${lead.name}\nCategory: ${lead.category}${lead.cuisine ? `\nCuisine: ${lead.cuisine}` : ''}\nLocation: ${lead.city || 'local area'}${lead.state ? ', ' + lead.state : ''}\n\nDo not invent awards, years in business, reviews, or specific claims that cannot be verified.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (json.tagline && json.about) return json;
  } catch { /* fall back to template copy */ }
  return null;
}

export async function enrichLead(lead) {
  const industryKey = classifyIndustry(lead.category);
  const industry = INDUSTRIES[industryKey];

  const profile = {
    industry: industryKey,
    theme: industry.theme,
    tagline: pick(industry.taglines, lead.id, 3),
    about: buildAbout(lead, industry),
    services: industry.services,
    values: industry.values,
    heroCta: industry.heroCta,
    hoursHuman: humanizeHours(lead.openingHours),
    contactCompleteness: {
      phone: Boolean(lead.phone),
      email: Boolean(lead.email),
      address: Boolean(lead.address),
      hours: Boolean(lead.openingHours),
    },
    dataPoints: [
      `Category: ${lead.category}`,
      lead.cuisine ? `Cuisine: ${lead.cuisine}` : null,
      lead.address ? `Address on file: ${lead.address}` : 'No street address on record — confirm before pitching.',
      lead.phone ? `Direct phone: ${lead.phone}` : 'No phone listed — find one before outreach.',
      lead.email ? `Email: ${lead.email}` : null,
      lead.openingHours ? 'Opening hours captured from map data.' : null,
      lead.hasWebsite ? `Already has a website: ${lead.website}` : 'NO WEBSITE FOUND — prime prospect.',
      ...Object.entries(lead.extraTags || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`),
    ].filter(Boolean),
    copySource: 'template',
    enrichedAt: new Date().toISOString(),
  };

  const ai = await claudeRewrite(profile, lead);
  if (ai) {
    profile.tagline = ai.tagline;
    profile.about = ai.about;
    if (Array.isArray(ai.services) && ai.services.length) profile.services = ai.services.slice(0, 6);
    if (Array.isArray(ai.values) && ai.values.length) profile.values = ai.values.slice(0, 3);
    profile.copySource = 'claude';
  }

  return profile;
}
