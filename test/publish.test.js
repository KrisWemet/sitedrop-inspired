import test from 'node:test';
import assert from 'node:assert/strict';
import { siteSlug, buildDeploymentPayload, isPublishConfigured } from '../lib/publish.js';

test('siteSlug produces valid Vercel project names', () => {
  assert.equal(siteSlug('Baker & Rye', 'site_x9k2'), 'baker-and-rye-x9k2');
  assert.equal(siteSlug("Rosetti's Trattoria!", 'site_x9k2', 'Milltown, OR'), 'rosetti-s-trattoria-milltown-or-x9k2');
  assert.equal(siteSlug('***', 'site_abc123'), 'site-abc1');
  assert.ok(siteSlug('x'.repeat(200), 'site_x', 'y'.repeat(60)).length <= 90);
});

test('buildDeploymentPayload includes all deploy-pack files', () => {
  const site = { id: 'site_1', businessName: 'Baker & Rye', llms: '# Baker & Rye' };
  const payload = buildDeploymentPayload(site, '<!DOCTYPE html><html></html>');
  assert.ok(payload.name.startsWith('baker-and-rye'));
  assert.equal(payload.target, 'production');
  const names = payload.files.map((f) => f.file);
  assert.deepEqual(names, ['index.html', 'robots.txt', 'sitemap.xml', 'llms.txt']);
  assert.ok(payload.files[0].data.startsWith('<!DOCTYPE html>'));
  assert.equal(payload.files[3].data, '# Baker & Rye');
});

test('isPublishConfigured reflects VERCEL_TOKEN', () => {
  const prev = process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_TOKEN;
  assert.equal(isPublishConfigured(), false);
  process.env.VERCEL_TOKEN = 'tok_test';
  assert.equal(isPublishConfigured(), true);
  if (prev === undefined) delete process.env.VERCEL_TOKEN;
  else process.env.VERCEL_TOKEN = prev;
});
