// Fictional sample businesses used when live OpenStreetMap APIs are
// unreachable (offline, firewalled, or rate-limited). Names and details are
// invented; the UI labels results as demo data.
import { scoreLead } from './osm.js';

const RAW = [
  { name: "Rosetti's Trattoria", category: 'restaurant', cuisine: 'italian', phone: '(555) 201-4482', email: null, website: null, address: '412 Harbor St, Milltown, OR 97401', openingHours: 'Tu-Su 11:30-22:00' },
  { name: 'Golden Wok Kitchen', category: 'restaurant', cuisine: 'chinese', phone: '(555) 201-8890', email: 'goldenwok@example.com', website: null, address: '88 Center Ave, Milltown, OR 97401', openingHours: 'Mo-Su 11:00-21:30' },
  { name: 'The Copper Kettle Cafe', category: 'cafe', cuisine: 'coffee shop', phone: '(555) 202-3311', email: null, website: 'https://copperkettle.example.com', address: '15 Main St, Milltown, OR 97401', openingHours: 'Mo-Fr 06:30-16:00; Sa-Su 07:00-15:00' },
  { name: 'Baker & Rye', category: 'bakery', cuisine: null, phone: '(555) 202-7748', email: 'hello@bakerandrye.example.com', website: null, address: '203 Main St, Milltown, OR 97401', openingHours: 'Tu-Sa 07:00-14:00' },
  { name: 'Shear Bliss Salon', category: 'hairdresser', cuisine: null, phone: '(555) 203-1120', email: null, website: null, address: '77 Birch Ln, Milltown, OR 97401', openingHours: 'Tu-Sa 09:00-18:00' },
  { name: 'Fade Factory Barbershop', category: 'hairdresser', cuisine: null, phone: '(555) 203-9034', email: null, website: null, address: '310 Center Ave, Milltown, OR 97401', openingHours: 'Mo-Sa 10:00-19:00' },
  { name: 'Luna Nails & Spa', category: 'beauty', cuisine: null, phone: '(555) 203-5561', email: null, website: null, address: '92 Harbor St, Milltown, OR 97401', openingHours: 'Mo-Sa 09:30-19:30' },
  { name: 'Hartley Plumbing & Drain', category: 'plumber', cuisine: null, phone: '(555) 204-2200', email: 'dispatch@hartleyplumbing.example.com', website: null, address: '1420 Industrial Way, Milltown, OR 97402', openingHours: 'Mo-Fr 07:00-17:00' },
  { name: 'Bright Spark Electric', category: 'electrician', cuisine: null, phone: '(555) 204-8181', email: null, website: null, address: '1509 Industrial Way, Milltown, OR 97402', openingHours: 'Mo-Fr 07:30-16:30' },
  { name: 'Evergreen Landscape Co.', category: 'gardener', cuisine: null, phone: '(555) 205-6642', email: null, website: null, address: '68 Ridgeline Rd, Milltown, OR 97402', openingHours: 'Mo-Fr 08:00-17:00' },
  { name: 'Milltown Auto Care', category: 'car repair', cuisine: null, phone: '(555) 205-3377', email: 'service@milltownauto.example.com', website: 'https://milltownauto.example.com', address: '2201 Route 9, Milltown, OR 97402', openingHours: 'Mo-Fr 08:00-18:00; Sa 09:00-14:00' },
  { name: 'Petal & Stem Florist', category: 'florist', cuisine: null, phone: '(555) 206-1418', email: null, website: null, address: '54 Main St, Milltown, OR 97401', openingHours: 'Mo-Sa 09:00-17:30' },
  { name: 'Ironworks Strength Gym', category: 'fitness centre', cuisine: null, phone: '(555) 206-9925', email: 'frontdesk@ironworksgym.example.com', website: null, address: '840 Depot Rd, Milltown, OR 97402', openingHours: 'Mo-Fr 05:00-22:00; Sa-Su 07:00-20:00' },
  { name: 'Riverbend Family Dental', category: 'dentist', cuisine: null, phone: '(555) 207-4040', email: null, website: 'https://riverbenddental.example.com', address: '300 Medical Plaza Dr, Milltown, OR 97401', openingHours: 'Mo-Th 08:00-17:00; Fr 08:00-13:00' },
  { name: 'Whisker & Paw Pet Grooming', category: 'pet grooming', cuisine: null, phone: '(555) 207-7789', email: null, website: null, address: '119 Birch Ln, Milltown, OR 97401', openingHours: 'Tu-Sa 09:00-17:00' },
  { name: 'Cornerstone Books', category: 'books', cuisine: null, phone: '(555) 208-2233', email: 'staff@cornerstonebooks.example.com', website: null, address: '31 Main St, Milltown, OR 97401', openingHours: 'Mo-Su 10:00-19:00' },
  { name: 'Tidy Nest Cleaning Services', category: 'cleaning', cuisine: null, phone: '(555) 208-6470', email: null, website: null, address: 'Milltown, OR 97401', openingHours: 'Mo-Fr 08:00-18:00' },
  { name: 'Summit Roofing Brothers', category: 'roofer', cuisine: null, phone: '(555) 209-1100', email: 'quotes@summitroofing.example.com', website: null, address: '77 Ridgeline Rd, Milltown, OR 97402', openingHours: 'Mo-Fr 07:00-16:00' },
];

export function demoLeads(query = '') {
  const q = query.trim().toLowerCase();
  const leads = RAW.map((b, i) => {
    const lead = {
      id: `lead_demo${String(i + 1).padStart(3, '0')}`,
      source: 'demo',
      osmRef: null,
      name: b.name,
      category: b.category,
      address: b.address,
      city: 'Milltown',
      state: 'OR',
      phone: b.phone,
      email: b.email,
      website: b.website,
      hasWebsite: Boolean(b.website),
      openingHours: b.openingHours,
      cuisine: b.cuisine,
      lat: null,
      lon: null,
      extraTags: {},
      foundAt: new Date().toISOString(),
      enrichment: null,
      siteId: null,
      status: 'new',
      notes: null,
      verification: null,
      outreach: null,
    };
    lead.score = scoreLead(lead);
    return lead;
  });

  const filtered = q
    ? leads.filter((l) =>
        l.category.includes(q) || l.name.toLowerCase().includes(q) ||
        (l.cuisine || '').includes(q) ||
        // Loose synonyms so common searches hit something.
        (q.includes('restaurant') && ['restaurant', 'cafe', 'bakery'].includes(l.category)) ||
        (q.includes('salon') && ['hairdresser', 'beauty'].includes(l.category)) ||
        (q.includes('barber') && l.category === 'hairdresser') ||
        (q.includes('gym') && l.category === 'fitness centre'))
    : leads;

  const results = filtered.length ? filtered : leads;
  results.sort((a, b) => b.score - a.score);
  return results;
}
