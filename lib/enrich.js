// Enrichment: turn a raw discovered lead into a full business profile —
// industry classification, service list with real descriptions, positioning
// copy, parsed hours. Every pick is seeded by the lead id, so each business
// gets a stable but *different* combination of tagline, services, values, and
// section headings — two bakeries in the same town must not read as clones.
// If ANTHROPIC_API_KEY is set, Claude rewrites the copy for a bespoke feel.

const INDUSTRIES = {
  restaurant: {
    match: ['restaurant', 'fast food', 'food court', 'ice cream'],
    theme: 'warm',
    heroCta: 'View Our Menu',
    taglines: [
      'Good food, made right.',
      'Where every meal feels like home.',
      'Honest cooking, generous portions.',
      'Come hungry. Leave happy.',
      'The table is set.',
    ],
    services: [
      ['Dine-in', 'Settle in — a comfortable room, unhurried service, and food that arrives hot from the kitchen.'],
      ['Takeout', 'Call ahead and your order is packed and waiting when you walk in.'],
      ['Catering & private events', 'From office lunches to family celebrations, we cook for groups of any size.'],
      ['Seasonal specials', 'The menu shifts with the seasons — ask what the kitchen is excited about this week.'],
      ['Family-style platters', 'Bigger portions built for sharing, priced to make feeding a crowd easy.'],
      ['Weekend brunch', 'A slower menu for slower mornings, served until mid-afternoon.'],
    ],
    values: [
      ['Fresh, local ingredients', 'Menus built around what is in season and sourced nearby.'],
      ['Made from scratch', 'Every sauce, dough, and stock starts in our kitchen — not a freezer.'],
      ['A table for everyone', 'Warm service whether it is date night or a Tuesday with the kids.'],
      ['Consistency you can taste', 'The dish you loved last month tastes the same today.'],
      ['Respect for the craft', 'Recipes refined over years, cooked with actual care.'],
    ],
  },
  cafe: {
    match: ['cafe', 'coffee'],
    theme: 'warm',
    heroCta: 'See What’s Brewing',
    taglines: [
      'Your daily ritual, done right.',
      'Coffee worth crossing town for.',
      'Slow down. Sip. Stay a while.',
      'Small cafe. Serious coffee.',
      'Where the neighborhood wakes up.',
    ],
    services: [
      ['Espresso & pour-over', 'Carefully dialed-in shots and single-origin pour-overs, made by people who take coffee seriously.'],
      ['Fresh pastries', 'Baked every morning and usually gone by noon — arrive early for the good stuff.'],
      ['Breakfast & lunch', 'Simple, honest plates: eggs done properly, sandwiches on good bread, soup made today.'],
      ['Workspace & Wi-Fi', 'Fast internet, plenty of outlets, and nobody rushing you out of your seat.'],
      ['Beans to take home', 'The same coffee we brew, in a bag, ground however you like.'],
      ['Loyalty rewards', 'Regulars are the whole point — your tenth cup is on us.'],
    ],
    values: [
      ['Carefully sourced beans', 'We know where our coffee comes from and who grew it.'],
      ['Baked fresh daily', 'The pastry case is filled every single morning, not restocked from a freezer.'],
      ['Your neighborhood spot', 'A place to meet, work, or just slow down for twenty minutes.'],
      ['Baristas who care', 'Trained hands behind the machine, not just button-pushers.'],
      ['No pretension', 'Great coffee without the attitude that sometimes comes with it.'],
    ],
  },
  bakery: {
    match: ['bakery', 'pastry', 'confectionery'],
    theme: 'warm',
    heroCta: 'Order Ahead',
    taglines: [
      'Fresh from the oven, every morning.',
      'Baked with patience, served with pride.',
      'Real bread takes time. We take it.',
      'The smell alone is worth the trip.',
      'Flour, butter, and no shortcuts.',
    ],
    services: [
      ['Artisan breads', 'Naturally leavened loaves with real crust and crumb — baked before sunrise, sold the same day.'],
      ['Custom cakes', 'Tell us the occasion and how many you are feeding; we handle the rest, layer by layer.'],
      ['Pastries & sweets', 'Croissants, cookies, and seasonal treats made from scratch in small batches.'],
      ['Wholesale for cafes', 'Reliable morning delivery of breads and pastries for local restaurants and coffee shops.'],
      ['Special-diet bakes', 'Ask about our gluten-conscious and dairy-free options — made with the same care.'],
      ['Holiday pre-orders', 'Reserve pies, rolls, and celebration breads ahead of the rush.'],
    ],
    values: [
      ['Baked before sunrise', 'Everything on the shelf was made this morning, not thawed from last week.'],
      ['Real ingredients', 'Butter, flour, eggs, and patience — read our labels, there is nothing to hide.'],
      ['Custom celebration cakes', 'One conversation and your event has its centerpiece.'],
      ['Small batches, high standards', 'We would rather sell out than bake ahead.'],
      ['A bakery, not a factory', 'Hands shape every loaf that leaves this building.'],
    ],
  },
  salon: {
    match: ['hairdresser', 'beauty', 'barber', 'nail', 'spa', 'tattoo', 'cosmetics'],
    theme: 'elegant',
    heroCta: 'Book an Appointment',
    taglines: [
      'Look sharp. Feel sharper.',
      'Leave looking like the best version of you.',
      'Your chair is waiting.',
      'Details make the difference.',
      'Walk out feeling brand new.',
    ],
    services: [
      ['Cuts & styling', 'A proper consultation first, then a cut that works with your hair — not against it.'],
      ['Color & highlights', 'Dimension, gloss, or a full change — done gradually and done well, without frying your hair.'],
      ['Special occasion styling', 'Weddings, reunions, big interviews: styling that lasts the whole event.'],
      ['Beard & grooming', 'Hot-towel finishes, clean linework, and shape advice you can maintain at home.'],
      ['Treatments & repair', 'Deep conditioning and bond repair for hair that has been through a lot.'],
      ['Consultations', 'Fifteen unhurried minutes to plan a change before you commit to it.'],
    ],
    values: [
      ['Listen first', 'Every appointment starts with what you want — not what is fastest.'],
      ['Skilled, certified stylists', 'A team that keeps training long after licensing day.'],
      ['Relax while you are here', 'Unhurried appointments in a chair you will not want to leave.'],
      ['Honest advice', 'If a look will not work for your hair, we will tell you before, not after.'],
      ['Clean, calm, comfortable', 'A tidy studio where the details are looked after.'],
    ],
  },
  trades: {
    match: ['plumber', 'electrician', 'roofer', 'carpenter', 'painter', 'hvac', 'locksmith', 'cleaning', 'gardener', 'landscap', 'handyman', 'builder'],
    theme: 'bold',
    heroCta: 'Get a Free Quote',
    taglines: [
      'Done right the first time.',
      'The call your neighbors recommend.',
      'Show up. Fix it. Stand behind it.',
      'Quality work, no runaround.',
      'Small enough to care, skilled enough to matter.',
    ],
    services: [
      ['Free estimates', 'A clear written quote before any work starts — what it costs, what it covers, how long it takes.'],
      ['Repairs & maintenance', 'The small jobs other outfits will not return calls for. We show up and fix them.'],
      ['New installations', 'Clean installs done to code, tested before we leave, and warrantied in writing.'],
      ['Emergency call-outs', 'When it cannot wait until Monday, call — we keep slots open for genuine emergencies.'],
      ['Inspections & tune-ups', 'A seasonal once-over that catches the expensive problem while it is still a cheap one.'],
      ['Upgrades & efficiency', 'Modern fixtures and smarter systems that pay for themselves on the utility bill.'],
    ],
    values: [
      ['Licensed & insured', 'Fully certified work that passes inspection the first time.'],
      ['Upfront pricing', 'The quote is the price. Surprises belong in birthdays, not invoices.'],
      ['On time, every time', 'We give you a window and we hit it — your day matters too.'],
      ['Tidy job sites', 'We treat your home like ours: boots wiped, mess cleaned, tools packed.'],
      ['Work we stand behind', 'If something is not right, we come back and make it right.'],
    ],
  },
  auto: {
    match: ['car repair', 'car wash', 'tyres', 'car parts', 'mechanic'],
    theme: 'bold',
    heroCta: 'Schedule Service',
    taglines: [
      'Keeping you safely on the road.',
      'Honest wrenching since day one.',
      'Straight answers. Solid repairs.',
      'The shop your last mechanic warned you about.',
      'Fixed properly, priced fairly.',
    ],
    services: [
      ['Diagnostics & inspection', 'We find the actual fault — and show it to you — before recommending a single repair.'],
      ['Brakes, tires & alignment', 'The safety systems, handled with quality parts and a proper road test after.'],
      ['Oil changes & tune-ups', 'In and out fast, with a genuine once-over instead of a upsell checklist.'],
      ['Engine & transmission', 'The big jobs, quoted honestly — including when a repair is not worth the money.'],
      ['Pre-purchase checks', 'Buying used? An hour on our lift can save you thousands.'],
      ['Fleet & commercial', 'Priority scheduling to keep work vehicles earning, not sitting.'],
    ],
    values: [
      ['Straight answers', 'We show you the worn part before we replace it.'],
      ['Certified technicians', 'Factory-trained hands on every job, from oil changes to engine swaps.'],
      ['Fair, posted pricing', 'Estimates you can hold us to, in writing.'],
      ['No manufactured repairs', 'If it does not need fixing, we tell you so.'],
      ['Warranty on our work', 'Parts and labor guaranteed — keep the receipt, though you will not need it.'],
    ],
  },
  health: {
    match: ['dentist', 'doctor', 'clinic', 'chiropractor', 'veterinary', 'pharmacy', 'physiotherap', 'optician', 'healthcare'],
    theme: 'clean',
    heroCta: 'Request an Appointment',
    taglines: [
      'Care you can feel good about.',
      'Modern care with a personal touch.',
      'You are more than a chart number.',
      'Gentle, thorough, on schedule.',
      'The kind of care we would want ourselves.',
    ],
    services: [
      ['New patient exams', 'A thorough first visit that actually reviews your history instead of skimming it.'],
      ['Preventive care', 'Regular checkups that catch small issues before they become expensive ones.'],
      ['Same-week appointments', 'Urgent concerns get seen quickly — call and we will find you a slot.'],
      ['Insurance & payment plans', 'We work with most insurers and offer clear payment options for everything else.'],
      ['Gentle sedation options', 'Anxious about visits? Ask about our comfort-first options.'],
      ['Family scheduling', 'Book the whole household in one block and make one trip of it.'],
    ],
    values: [
      ['Patients, not numbers', 'Appointments that never feel like a conveyor belt.'],
      ['Modern, gentle care', 'Up-to-date equipment and techniques that make visits easier.'],
      ['Clear communication', 'You will always understand your options and your costs — before treatment.'],
      ['On-time appointments', 'We respect the schedule so your 2 PM is actually at 2 PM.'],
      ['Judgment-free care', 'However long it has been, you are welcome here.'],
    ],
  },
  fitness: {
    match: ['fitness', 'gym', 'yoga', 'sports', 'dance', 'martial'],
    theme: 'bold',
    heroCta: 'Start Your Free Trial',
    taglines: [
      'Stronger starts here.',
      'Show up. We will handle the rest.',
      'Train hard. Belong harder.',
      'Progress over perfection.',
      'The hardest part is the front door.',
    ],
    services: [
      ['Open gym access', 'Full racks, free weights, and cardio — without waiting in line for a bench.'],
      ['Personal training', 'Real programming built around your body and your goals, with form checks every session.'],
      ['Group classes', 'Coached sessions that scale to your level — sweat with people who learn your name.'],
      ['Beginner programs', 'Never trained before? A structured on-ramp so you are confident in four weeks.'],
      ['Nutrition guidance', 'Simple, sustainable eating advice that survives contact with real life.'],
      ['Open early, open late', 'Hours built for shift workers, parents, and 5 AM people alike.'],
    ],
    values: [
      ['All levels welcome', 'From first workout to competition prep — nobody is judged at the door.'],
      ['Coaches who care', 'Real form checks and real progress, not just supervised sweating.'],
      ['A community, not a crowd', 'Train with people who notice when you have been away.'],
      ['Clean, maintained equipment', 'Gear that works, wiped down, racked, and ready.'],
      ['Results you can measure', 'We track your progress so motivation has receipts.'],
    ],
  },
  professional: {
    match: ['lawyer', 'accountant', 'estate agent', 'insurance', 'financial', 'consultant', 'notary', 'office'],
    theme: 'clean',
    heroCta: 'Schedule a Consultation',
    taglines: [
      'Trusted guidance, close to home.',
      'Advice you can act on.',
      'Complex matters, plain language.',
      'On your side of the table.',
      'Local expertise. Real accountability.',
    ],
    services: [
      ['Initial consultation', 'A real conversation about your situation before any commitment — come with questions.'],
      ['Transparent flat fees', 'Clear pricing agreed up front for defined work. No meter running in the background.'],
      ['Responsive communication', 'Calls returned the same business day. You will never wonder where things stand.'],
      ['Document review', 'A second set of trained eyes before you sign anything binding.'],
      ['Ongoing advisory', 'A standing relationship, so advice comes from someone who already knows your file.'],
      ['Local representation', 'Deep familiarity with the local rules, offices, and people that move things along.'],
    ],
    values: [
      ['Experience that matters', 'Years of practice with cases and clients just like yours.'],
      ['Plain-language advice', 'You leave every meeting understanding exactly where you stand.'],
      ['Your advocate', 'We work for your outcome, start to finish — not for the path of least resistance.'],
      ['Discretion, always', 'Your matters stay your matters.'],
      ['No surprise invoices', 'Costs discussed before work begins, every time.'],
    ],
  },
  retail: {
    match: ['books', 'clothes', 'boutique', 'florist', 'furniture', 'hardware', 'jewelry', 'gift', 'pet', 'shop', 'convenience', 'supermarket', 'butcher', 'grooming'],
    theme: 'elegant',
    heroCta: 'Visit the Shop',
    taglines: [
      'Found only here.',
      'Worth the trip downtown.',
      'Curated, not stocked.',
      'Come in for one thing. Leave with a story.',
      'The good stuff, hand-picked.',
    ],
    services: [
      ['Curated selection', 'Every item on our shelves earned its place — chosen by people who use what they sell.'],
      ['Special orders', 'Do not see it? We can usually track it down within the week.'],
      ['Gift wrapping', 'Complimentary wrapping that makes your gift look as good as it is.'],
      ['Local delivery', 'Nearby? We will bring it to your door, often same-day.'],
      ['Expert recommendations', 'Tell us who it is for and what they love — we will find the right thing.'],
      ['Returns without drama', 'If it is not right, bring it back. Simple as that.'],
    ],
    values: [
      ['Hand-picked selection', 'Quality over quantity, on every shelf.'],
      ['Real recommendations', 'Staff who know the stock and love the craft.'],
      ['Shop local, feel it', 'Your purchase stays in the community and keeps the lights on downtown.'],
      ['We stand behind it', 'Everything we sell, we would buy ourselves.'],
      ['Always something new', 'The shelves change with the seasons — regulars know to check back.'],
    ],
  },
  hospitality: {
    match: ['hotel', 'guest house', 'hostel', 'bed and breakfast', 'motel'],
    theme: 'elegant',
    heroCta: 'Check Availability',
    taglines: [
      'Your home base in town.',
      'Stay where the locals would send you.',
      'Arrive a guest. Leave a regular.',
      'Rest easy — we mean it literally.',
      'The good night’s sleep, guaranteed.',
    ],
    services: [
      ['Comfortable rooms', 'Quiet, spotless rooms with genuinely good beds — the thing that actually matters.'],
      ['Local recommendations', 'Ask us anything: where to eat, what to skip, and the shortcut to the good views.'],
      ['Flexible check-in', 'Arriving late or leaving early? Tell us your plans and we will work around them.'],
      ['Group bookings', 'Weddings, reunions, and teams — block rates and one point of contact.'],
      ['Breakfast done properly', 'A real morning meal, not a sad pastry basket.'],
      ['Long-stay rates', 'In town for a week or a month? Ask about extended-stay pricing.'],
    ],
    values: [
      ['Rest easy', 'Quiet rooms, blackout curtains, and beds we obsess over.'],
      ['Local hosts', 'We live here — and it shows in every recommendation.'],
      ['Honest rates', 'No resort fees, no surprise add-ons at checkout.'],
      ['Spotless, every stay', 'Cleanliness is not a feature; it is the baseline.'],
      ['Small enough to care', 'You are a guest with a name, not a room number.'],
    ],
  },
  generic: {
    match: [],
    theme: 'clean',
    heroCta: 'Get in Touch',
    taglines: [
      'Proudly serving our neighbors.',
      'Local, reliable, recommended.',
      'The local name you can trust.',
      'Doing it right since day one.',
      'Your neighbors already know us.',
    ],
    services: [
      ['Personalized service', 'You deal with people who know your name and remember your last visit.'],
      ['Local expertise', 'Years of serving this exact community — we know what works here.'],
      ['Fair pricing', 'Honest rates, quoted clearly before any commitment.'],
      ['Satisfaction guaranteed', 'If something is not right, we make it right — that is the whole policy.'],
      ['Quick response', 'Calls and messages answered by a person, usually the same day.'],
      ['Flexible scheduling', 'We work around your hours, not the other way round.'],
    ],
    values: [
      ['Locally owned', 'Rooted in the community we serve — your money stays in town.'],
      ['Quality first', 'We stand behind every job and every sale.'],
      ['Easy to reach', 'Call, email, or stop by — a real person answers.'],
      ['No runaround', 'Straight answers and clear next steps, every time.'],
      ['Earned trust', 'Most of our business comes from word of mouth. There is a reason.'],
    ],
  },
};

// Section-heading variants — identical headings on every generated site are a
// template tell. Seeded per business.
const HEADINGS = {
  valuesEyebrow: ['Why Choose Us', 'Our Promise', 'How We Work', 'The Difference'],
  valuesTitle: ['What Sets Us Apart', 'Why Neighbors Choose Us', 'Our Standards', 'What You Can Expect'],
  servicesIntro: [
    'Everything we do comes with the same promise: quality work and honest service.',
    'Here is what we do best — and how we can help you.',
    'A few of the things people come to us for.',
    'Whatever brings you in, it gets our full attention.',
  ],
  aboutEyebrow: ['About Us', 'Our Story', 'Who We Are', 'Get to Know Us'],
  contactTitle: ["We'd Love to Hear From You", 'Come Say Hello', "Let's Talk", 'Reach Out Anytime'],
  faqEyebrow: ['Common Questions', 'Good to Know', 'Before You Visit', 'Quick Answers'],
  hoursEyebrow: ['Visit Us', 'When to Find Us', 'Stop By', 'Open Hours'],
};

export function classifyIndustry(category = '') {
  const c = category.toLowerCase();
  for (const [key, def] of Object.entries(INDUSTRIES)) {
    if (def.match.some((m) => c.includes(m))) return key;
  }
  return 'generic';
}

// ---- seeded, deterministic randomness (stable per lead id) ----
function seedHash(seedStr, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

function pick(arr, seedStr, salt = 0) {
  return arr[seedHash(seedStr, salt) % arr.length];
}

// Deterministic sample of n items, order-preserving, seeded shuffle of indices.
function pickN(arr, n, seedStr, salt = 0) {
  const idx = arr.map((_, i) => i);
  let h = seedHash(seedStr, salt);
  for (let i = idx.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).sort((a, b) => a - b).map((i) => arr[i]);
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

// OSM amenity tags → human chips. Real, verifiable, per-business facts are
// the strongest "not a template" signal a generated site can carry.
export function amenityChips(extraTags = {}) {
  const chips = [];
  const yes = (v) => ['yes', 'designated', 'limited'].includes(String(v).toLowerCase());
  if (yes(extraTags.wheelchair)) chips.push('Wheelchair accessible');
  if (yes(extraTags.outdoor_seating)) chips.push('Outdoor seating');
  if (yes(extraTags.takeaway)) chips.push('Takeout available');
  if (yes(extraTags.delivery)) chips.push('Delivery available');
  if (yes(extraTags['payment:cards'])) chips.push('Cards accepted');
  if (yes(extraTags.air_conditioning)) chips.push('Air conditioned');
  if (['wlan', 'yes', 'wired'].includes(String(extraTags.internet_access || '').toLowerCase())) chips.push('Free Wi-Fi');
  if (String(extraTags.smoking).toLowerCase() === 'no') chips.push('Smoke-free');
  return chips;
}

function buildAbout(lead) {
  const place = lead.city ? `${lead.city}${lead.state ? ', ' + lead.state : ''}` : 'the local area';
  const cat = lead.category;
  const cuisineBit = lead.cuisine ? ` known for ${lead.cuisine}` : '';
  const intros = [
    `${lead.name} is a locally owned ${cat}${cuisineBit} proudly serving ${place}.`,
    `Right in the heart of ${place}, ${lead.name} has built its reputation as the ${cat} neighbors recommend${cuisineBit}.`,
    `${lead.name} brings genuine, personal service to ${place} — the kind only a local ${cat}${cuisineBit} can offer.`,
    `Ask around ${place} and ${lead.name} is the ${cat}${cuisineBit} people mention by name.`,
    `For the people of ${place}, ${lead.name} is more than a ${cat}${cuisineBit} — it is a neighbor.`,
  ];
  const closers = [
    'We believe in doing things properly, treating customers like neighbors, and standing behind our work every single day.',
    'From your first visit, you will notice the difference that local ownership and real pride in the craft make.',
    'Stop by or give us a call — we would love to meet you.',
    'No call centers, no corporate scripts — just people who care about doing good work close to home.',
    'We built this business one satisfied customer at a time, and that is still how we grow.',
  ];
  return `${pick(intros, lead.id, 1)} ${pick(closers, lead.id, 2)}`;
}

async function claudeRewrite(profile, lead) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Write website copy for this local business. Respond with ONLY valid JSON: {"tagline": string (max 8 words), "about": string (2-3 sentences), "services": [{"name": string, "desc": string (one concrete sentence)}] (exactly 4), "values": [[title, one-sentence description] x3]}.\n\nBusiness: ${lead.name}\nCategory: ${lead.category}${lead.cuisine ? `\nCuisine: ${lead.cuisine}` : ''}\nLocation: ${lead.city || 'local area'}${lead.state ? ', ' + lead.state : ''}\n\nWrite like a skilled human copywriter: specific, warm, unhyped. Do not invent awards, years in business, reviews, or claims that cannot be verified.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (json.tagline && json.about) return json;
  } catch { /* fall back to template copy */ }
  finally { clearTimeout(timer); }
  return null;
}

export async function enrichLead(lead) {
  const industryKey = classifyIndustry(lead.category);
  const industry = INDUSTRIES[industryKey];

  const profile = {
    industry: industryKey,
    theme: industry.theme,
    tagline: pick(industry.taglines, lead.id, 3),
    about: buildAbout(lead),
    services: pickN(industry.services, 4, lead.id, 4).map(([name, desc]) => ({ name, desc })),
    values: pickN(industry.values, 3, lead.id, 5),
    heroCta: industry.heroCta,
    headings: {
      valuesEyebrow: pick(HEADINGS.valuesEyebrow, lead.id, 6),
      valuesTitle: pick(HEADINGS.valuesTitle, lead.id, 7),
      servicesIntro: pick(HEADINGS.servicesIntro, lead.id, 8),
      aboutEyebrow: pick(HEADINGS.aboutEyebrow, lead.id, 9),
      contactTitle: pick(HEADINGS.contactTitle, lead.id, 10),
      faqEyebrow: pick(HEADINGS.faqEyebrow, lead.id, 11),
      hoursEyebrow: pick(HEADINGS.hoursEyebrow, lead.id, 12),
    },
    layoutSeed: seedHash(lead.id, 13),
    amenities: amenityChips(lead.extraTags),
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
    if (Array.isArray(ai.services) && ai.services.length) {
      profile.services = ai.services.slice(0, 6).map((s) =>
        typeof s === 'string' ? { name: s, desc: '' } : { name: s.name, desc: s.desc || '' });
    }
    if (Array.isArray(ai.values) && ai.values.length) profile.values = ai.values.slice(0, 3);
    profile.copySource = 'claude';
  }

  return profile;
}

// Older profiles (or Claude responses) may carry services as plain strings.
export function serviceName(s) {
  return typeof s === 'string' ? s : s.name;
}
