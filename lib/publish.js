// One-click publishing to Vercel via the REST API (zero-dep: plain fetch).
// Needs VERCEL_TOKEN (create at https://vercel.com/account/tokens); optional
// VERCEL_TEAM_ID to deploy into a team scope. Each business gets its own
// Vercel project (slug name), so the pitch email carries a real live URL.
import { robotsTxt, sitemapXml } from './seo.js';

const API = 'https://api.vercel.com';

export function isPublishConfigured() {
  return Boolean(process.env.VERCEL_TOKEN);
}

export function siteSlug(businessName, siteId) {
  const slug = String(businessName).toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    .slice(0, 80);
  return slug || siteId.replace(/_/g, '-');
}

// Pure payload builder (unit-tested; the fetch wrapper below stays thin).
export function buildDeploymentPayload(site, html) {
  return {
    name: siteSlug(site.businessName, site.id),
    target: 'production',
    projectSettings: { framework: null },
    files: [
      { file: 'index.html', data: html, encoding: 'utf-8' },
      { file: 'robots.txt', data: robotsTxt(), encoding: 'utf-8' },
      { file: 'sitemap.xml', data: sitemapXml(), encoding: 'utf-8' },
      { file: 'llms.txt', data: site.llms || '', encoding: 'utf-8' },
    ],
  };
}

async function vercelFetch(path, options = {}) {
  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(API + path);
  if (teamId) url.searchParams.set('teamId', teamId);
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Vercel API error (HTTP ${res.status})`);
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function publishSite(site, html) {
  if (!isPublishConfigured()) {
    throw new Error('Publishing is not configured. Set VERCEL_TOKEN (and optionally VERCEL_TEAM_ID) and restart.');
  }

  const payload = buildDeploymentPayload(site, html);
  let deployment = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Static deploys are fast; poll briefly until READY.
  const deadline = Date.now() + 90_000;
  while (!['READY', 'ERROR', 'CANCELED'].includes(deployment.readyState) && Date.now() < deadline) {
    await sleep(2500);
    deployment = await vercelFetch(`/v13/deployments/${deployment.id}`);
  }
  if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
    throw new Error(`Deployment ${deployment.readyState.toLowerCase()} on Vercel — check the Vercel dashboard.`);
  }

  // Prefer the stable project alias (slug.vercel.app) over the per-deploy URL.
  const alias = Array.isArray(deployment.alias) && deployment.alias.length
    ? deployment.alias.find((a) => a === `${payload.name}.vercel.app`) || deployment.alias[0]
    : deployment.url;

  return {
    url: 'https://' + alias,
    deploymentId: deployment.id,
    project: payload.name,
    readyState: deployment.readyState,
    publishedAt: new Date().toISOString(),
  };
}
