import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildAssistantConfig, renderVoiceConfigPack, provisionVapi, voiceConfigured } from '../lib/voice.js';
import { enrichLead } from '../lib/enrich.js';

const lead = {
  id: 'lead_voice', name: 'Hartley & Sons Plumbing', category: 'plumber',
  city: 'Milltown', state: 'OR', address: '4 Depot Rd, Milltown, OR', phone: '(555) 771-0090',
  email: 'office@hartleyplumbing.co', openingHours: 'Mo-Fr 07:30-17:00', extraTags: {},
};

test('system prompt is built from real lead data with hard no-fabrication rules', async () => {
  const enrichment = await enrichLead(lead);
  const p = buildSystemPrompt(lead, enrichment);
  assert.ok(p.includes('Hartley & Sons Plumbing'));
  assert.ok(/never invent information/i.test(p), 'anti-hallucination rule present');
  assert.ok(/never quote a price/i.test(p), 'no-price-guessing rule present');
  assert.ok(p.includes('(555) 771-0090'));
  assert.ok(/Hours:/i.test(p), 'hours woven in');
  assert.ok(/take a message/i.test(p), 'message-taking fallback');
});

test('booking link changes the booking instruction', async () => {
  const enrichment = await enrichLead(lead);
  const withBooking = { ...lead, cta: { bookingUrl: 'https://calendly.com/hartley' } };
  assert.ok(buildSystemPrompt(withBooking, enrichment).includes('https://calendly.com/hartley'));
  assert.ok(/call back to schedule/i.test(buildSystemPrompt(lead, enrichment)), 'no-booking path takes a message');
});

test('config pack renders the full spec, escaped and noindex', async () => {
  const enrichment = await enrichLead(lead);
  const html = renderVoiceConfigPack(lead, enrichment, { agency: { name: 'Studio X' } });
  assert.ok(html.includes('noindex'));
  assert.ok(html.includes('System prompt'));
  assert.ok(html.includes('Hartley &amp; Sons Plumbing'), 'business name escaped');
  assert.ok(html.includes('Studio X'));
  const evil = { ...lead, name: 'Bad <script>alert(1)</script> Co' };
  assert.ok(!renderVoiceConfigPack(evil, enrichment, {}).includes('<script>alert(1)'));
});

test('provisionVapi requires a key and refuses demo leads', async () => {
  delete process.env.VAPI_API_KEY;
  assert.equal(voiceConfigured(), false);
  await assert.rejects(() => provisionVapi(lead, {}), /VAPI_API_KEY/);
});

test('provisionVapi POSTs the assistant spec and returns the id (mocked)', async () => {
  process.env.VAPI_API_KEY = 'test-key';
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url: String(url), body: JSON.parse(opts.body), auth: opts.headers.Authorization };
    return { ok: true, status: 201, json: async () => ({ id: 'asst_123' }) };
  };
  try {
    const enrichment = await enrichLead(lead);
    const out = await provisionVapi(lead, enrichment);
    assert.equal(captured.url, 'https://api.vapi.ai/assistant');
    assert.equal(captured.auth, 'Bearer test-key');
    assert.ok(captured.body.model.messages[0].content.includes('Hartley'), 'system prompt sent');
    assert.equal(out.assistantId, 'asst_123');
    assert.ok(out.dashboardUrl.includes('asst_123'));
  } finally {
    globalThis.fetch = original;
    delete process.env.VAPI_API_KEY;
  }
});

test('provisionVapi surfaces API errors', async () => {
  process.env.VAPI_API_KEY = 'test-key';
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });
  try {
    await assert.rejects(() => provisionVapi(lead, {}), /Vapi error \(HTTP 401\).*Unauthorized/);
  } finally {
    globalThis.fetch = original;
    delete process.env.VAPI_API_KEY;
  }
});
