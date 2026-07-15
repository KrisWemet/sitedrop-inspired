// Lead verification: before you pitch "you have no website", check.
// - Leads WITH a listed website: probe it. Dead sites and social-media-only
//   "websites" (Facebook/Instagram pages) are still hot prospects.
// - Leads WITHOUT a website: guess likely domains from the business name and
//   probe them, so you don't pitch someone whose site just isn't in OSM.
import dns from 'node:dns/promises';

const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com',
  'linktr.ee', 'yelp.com', 'tiktok.com', 'wa.me', 'whatsapp.com', 'm.me',
  'youtube.com', 'pinterest.com', 'linkedin.com', 'google.com', 'goo.gl',
];

const STOPWORDS = new Set(['the', 'and', 'of', 'a', 'an', 'inc', 'llc', 'ltd', 'co', 'company']);

export function isSocialUrl(url) {
  try {
    const host = new URL(url.startsWith('http') ? url : 'https://' + url).hostname
      .toLowerCase().replace(/^www\./, '');
    return SOCIAL_HOSTS.some((s) => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

export function slugCandidates(name, city = '') {
  const tokens = String(name).toLowerCase()
    .replace(/&/g, ' and ').replace(/[''’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
  if (!tokens.length) return [];

  const joined = tokens.join('');
  const dashed = tokens.join('-');
  const citySlug = String(city).toLowerCase().replace(/[^a-z0-9]/g, '');
  const bases = [...new Set([joined, dashed, citySlug ? joined + citySlug : null].filter(Boolean))]
    .filter((b) => b.length >= 4 && b.length <= 40);

  const domains = [];
  for (const base of bases) {
    domains.push(`${base}.com`);
    if (base === joined) domains.push(`${base}.net`, `${base}.co`);
  }
  return [...new Set(domains)].slice(0, 6);
}

async function resolves(host) {
  try {
    await dns.lookup(host);
    return true;
  } catch {
    return false;
  }
}

async function probeUrl(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sitespark-verifier/1.0)' },
    });
    const type = res.headers.get('content-type') || '';
    let body = '';
    if (res.ok && type.includes('html')) {
      const reader = res.body?.getReader();
      if (reader) {
        // Read at most ~64KB — enough for <title> and header content.
        let received = 0;
        const chunks = [];
        while (received < 65536) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
        }
        reader.cancel().catch(() => {});
        body = Buffer.concat(chunks).toString('utf8');
      }
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url, body };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, finalUrl: url, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

// Does the fetched page look like it belongs to this business?
export function pageMatchesBusiness(body, name) {
  if (!body) return false;
  const text = body.toLowerCase();
  const tokens = String(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

const PARKED_MARKERS = ['domain is for sale', 'buy this domain', 'parked domain', 'godaddy.com/domainsearch', 'sedoparking', 'this domain may be for sale'];

export async function verifyLead(lead) {
  const result = {
    verifiedAt: new Date().toISOString(),
    checked: [],
    outcome: null,   // confirmed-live | dead-site | social-only | possible-site-found | verified-no-website | demo-simulated
    stillHot: null,
    detail: '',
    foundUrl: null,
  };

  // Demo leads are fictional — never probe real domains for them.
  if (lead.source === 'demo') {
    result.outcome = lead.hasWebsite ? 'confirmed-live' : 'verified-no-website';
    result.stillHot = !lead.hasWebsite;
    result.detail = 'Demo lead — verification simulated (no network probes for fictional businesses).';
    return result;
  }

  if (lead.website) {
    if (isSocialUrl(lead.website)) {
      result.outcome = 'social-only';
      result.stillHot = true;
      result.detail = `Listed "website" is a social/profile page (${lead.website}). No real website — still a hot prospect.`;
      result.checked.push(lead.website);
      return result;
    }
    const url = lead.website.startsWith('http') ? lead.website : 'https://' + lead.website;
    const probe = await probeUrl(url);
    result.checked.push(url);
    if (!probe.ok) {
      result.outcome = 'dead-site';
      result.stillHot = true;
      result.detail = `Listed website did not respond (${probe.error || 'HTTP ' + probe.status}). A dead site is a hot prospect.`;
    } else if (PARKED_MARKERS.some((m) => probe.body.toLowerCase().includes(m))) {
      result.outcome = 'dead-site';
      result.stillHot = true;
      result.detail = 'Listed domain appears parked/for sale. Effectively no website — hot prospect.';
    } else if (isSocialUrl(probe.finalUrl)) {
      result.outcome = 'social-only';
      result.stillHot = true;
      result.detail = `Website redirects to a social page (${probe.finalUrl}). Still a hot prospect.`;
    } else {
      result.outcome = 'confirmed-live';
      result.stillHot = false;
      result.detail = `Website is live (HTTP ${probe.status}). Not a no-website prospect.`;
      result.foundUrl = probe.finalUrl;
    }
    return result;
  }

  // No website listed: probe likely domains before trusting the flag.
  const candidates = slugCandidates(lead.name, lead.city);
  for (const domain of candidates) {
    result.checked.push(domain);
    if (!(await resolves(domain))) continue;
    const probe = await probeUrl('https://' + domain);
    if (probe.ok && pageMatchesBusiness(probe.body, lead.name) &&
        !PARKED_MARKERS.some((m) => probe.body.toLowerCase().includes(m))) {
      result.outcome = 'possible-site-found';
      result.stillHot = false;
      result.foundUrl = probe.finalUrl;
      result.detail = `Found a likely existing website at ${probe.finalUrl} — verify manually before pitching.`;
      return result;
    }
  }

  result.outcome = 'verified-no-website';
  result.stillHot = true;
  result.detail = candidates.length
    ? `No website in map data and none of ${candidates.length} likely domains (${candidates.join(', ')}) belong to this business. Strong no-website prospect.`
    : 'No website in map data. Strong no-website prospect.';
  return result;
}
