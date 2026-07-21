// Voice-agent upsell: an AI phone receptionist for the business, built from
// the same enriched lead data the website uses. Two honest tiers:
//
//   1. Config pack (KEYLESS, always available): buildAssistantConfig() turns
//      the lead into a complete assistant spec — system prompt, greeting, and
//      a structured knowledge base (services, hours, location, booking rules,
//      message-taking). renderVoiceConfigPack() renders it as a deliverable
//      the operator can paste into Vapi, Retell, Bland, or any provider. The
//      valuable, hard part is 100% built here with no external call.
//
//   2. One-click provisioning (needs the operator's VAPI_API_KEY): provisionVapi()
//      POSTs that spec to api.vapi.ai to create a live assistant. Buying a
//      phone number and per-minute usage bill the operator's own Vapi account,
//      so we create the assistant and hand back its id + the dashboard link;
//      we never silently incur telephony charges.
//
// Zero runtime deps (plain fetch). Nothing here sends anything to a prospect.
import crypto from 'node:crypto';

export function voiceConfigured() {
  return Boolean(process.env.VAPI_API_KEY);
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// The receptionist's operating instructions, assembled from real lead data.
// Hard rules up top: never invent facts, never quote prices we don't have,
// always offer to take a message. This is what keeps the agent trustworthy.
export function buildSystemPrompt(lead, enrichment = {}) {
  const name = clean(lead.name);
  const cat = clean(lead.category);
  const city = [lead.city, lead.state].filter(Boolean).join(', ');
  const services = (enrichment.services || []).map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
  const hours = (enrichment.hoursHuman || []).join('; ');
  const booking = lead.cta?.bookingUrl;
  const takeMessageTo = lead.email || (lead.cta?.formEndpoint ? 'the business inbox' : null);

  const lines = [
    `You are the friendly phone receptionist for ${name}, a ${cat}${city ? ` in ${city}` : ''}.`,
    `Answer calls warmly and concisely, the way a great small-business receptionist would. Keep replies short and natural for speech.`,
    ``,
    `HARD RULES:`,
    `- Never invent information. If you don't know something, say you'll take a message and have someone follow up.`,
    `- Never quote a price, availability, or promise a specific time unless it is stated in your knowledge below.`,
    `- Always offer to take a message (caller's name, number, and reason) when you can't fully help.`,
    `- Do not collect payment details or sensitive information over the phone.`,
    ``,
    `WHAT THE BUSINESS DOES:`,
    enrichment.about ? `- ${clean(enrichment.about)}` : `- A local ${cat}.`,
    services.length ? `- Services: ${services.join(', ')}.` : null,
    ``,
    `LOCATION & HOURS:`,
    lead.address ? `- Address: ${clean(lead.address)}.` : (city ? `- Serving ${city}.` : null),
    hours ? `- Hours: ${hours}. If a caller asks about a time outside these hours, tell them the correct hours and offer to take a message.` : `- If asked about hours, say you're not certain and offer to take a message.`,
    lead.phone ? `- Main phone: ${clean(lead.phone)}.` : null,
    ``,
    `HANDLING COMMON CALLS:`,
    booking
      ? `- Booking/appointments: let them know they can book online at ${booking}, and offer to text or note that link. If they'd rather, take their details as a message.`
      : `- Booking/appointments: take the caller's name, number, and what they need, and tell them the team will call back to schedule.`,
    takeMessageTo
      ? `- Messages: collect the caller's name, phone number, and reason, confirm the number back to them, and assure them it will be passed to the team right away.`
      : `- Messages: collect the caller's name, phone number, and reason, and confirm you'll pass it along.`,
    `- Directions, hours, services: answer from your knowledge above. Anything you're unsure of becomes a message.`,
    ``,
    `Close every call politely and thank them for calling ${name}.`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function buildFirstMessage(lead) {
  const name = clean(lead.name);
  return `Thanks for calling ${name}! How can I help you today?`;
}

// The provider-agnostic spec. Model/voice defaults are sensible and overridable
// by env; everything else is derived from the lead.
export function buildAssistantConfig(lead, enrichment = {}) {
  return {
    name: `${clean(lead.name)} — Reception`,
    firstMessage: buildFirstMessage(lead),
    systemPrompt: buildSystemPrompt(lead, enrichment),
    model: {
      provider: process.env.VAPI_MODEL_PROVIDER || 'openai',
      model: process.env.VAPI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
    },
    voice: {
      provider: process.env.VAPI_VOICE_PROVIDER || 'vapi',
      voiceId: process.env.VAPI_VOICE_ID || 'Elliot',
    },
    metadata: { businessName: clean(lead.name), leadId: lead.id, source: 'sitespark' },
  };
}

// Shape the config into Vapi's /assistant request body.
function toVapiBody(config) {
  return {
    name: config.name,
    firstMessage: config.firstMessage,
    model: {
      provider: config.model.provider,
      model: config.model.model,
      temperature: config.model.temperature,
      messages: [{ role: 'system', content: config.systemPrompt }],
    },
    voice: { provider: config.voice.provider, voiceId: config.voice.voiceId },
    metadata: config.metadata,
  };
}

// One-click: create the live assistant in the operator's Vapi account.
// Returns { assistantId, dashboardUrl }. Phone-number purchase is intentionally
// NOT done here (it bills the operator); we surface the next step instead.
export async function provisionVapi(lead, enrichment, { timeoutMs = 20000 } = {}) {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error('Set VAPI_API_KEY (from your Vapi dashboard) to provision a live voice agent. Without it, use the Config Pack.');
  if (lead.source === 'demo') throw new Error('Demo leads are fictional — provision a voice agent only for a real business.');

  const config = buildAssistantConfig(lead, enrichment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toVapiBody(config)),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Vapi error (HTTP ${res.status})${data?.message ? ': ' + (Array.isArray(data.message) ? data.message.join('; ') : data.message) : ''}`);
    return {
      assistantId: data.id,
      dashboardUrl: data.id ? `https://dashboard.vapi.ai/assistants/${data.id}` : 'https://dashboard.vapi.ai',
      provider: 'vapi',
      provisionedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// The keyless deliverable: a self-contained page the operator can hand to a
// client or paste into any voice provider. Contains the full spec.
export function renderVoiceConfigPack(lead, enrichment, { agency } = {}) {
  const config = buildAssistantConfig(lead, enrichment);
  const kv = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Voice agent config — ${esc(lead.name)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#141821;background:#f2f4f7;line-height:1.6;padding:32px 16px}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden}
  .band{background:linear-gradient(135deg,#0b1120,#3730a3 80%);color:#eef2ff;padding:36px 48px}
  .band h1{font-size:1.5rem;margin-bottom:4px}
  .band p{opacity:.9;font-size:.95rem}
  main{padding:36px 48px}
  section{margin-bottom:30px}
  h2{font-size:1.1rem;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:.92rem}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef1f5;vertical-align:top}
  th{width:150px;color:#5c6472;font-weight:600}
  pre{background:#0b1120;color:#e6ecff;padding:18px;border-radius:8px;font-size:.83rem;white-space:pre-wrap;line-height:1.5;overflow-x:auto}
  .steps{list-style:decimal;padding-left:20px;font-size:.92rem;color:#374151}
  .steps li{margin:6px 0}
  footer{padding:22px 48px;border-top:1px solid #e6e9ee;color:#5c6472;font-size:.85rem}
  @media print{body{background:#fff;padding:0}.sheet{border:none}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="band">
      <h1>AI phone receptionist — ${esc(lead.name)}</h1>
      <p>Ready-to-deploy configuration${agency?.name ? ` · prepared by ${esc(agency.name)}` : ''}</p>
    </div>
    <main>
      <section>
        <h2>Assistant settings</h2>
        <table>
          ${kv('Name', config.name)}
          ${kv('Greeting', config.firstMessage)}
          ${kv('Model', `${config.model.provider} / ${config.model.model}`)}
          ${kv('Voice', `${config.voice.provider} / ${config.voice.voiceId}`)}
        </table>
      </section>
      <section>
        <h2>System prompt</h2>
        <pre>${esc(config.systemPrompt)}</pre>
      </section>
      <section>
        <h2>Deploy it</h2>
        <ol class="steps">
          <li>Create an assistant in <strong>Vapi</strong>, Retell, or Bland (any voice-AI provider).</li>
          <li>Paste the system prompt and greeting above; set the model and voice.</li>
          <li>Attach a phone number in that provider and forward the business line to it (or publish the number).</li>
          <li>Test-call it, then hand the number to the client. In SiteSpark, one click provisions the Vapi assistant automatically when your VAPI_API_KEY is set.</li>
        </ol>
      </section>
    </main>
    <footer>
      Configuration generated from ${esc(lead.name)}'s own details. Review before going live; the assistant only knows what's above.
    </footer>
  </div>
</body>
</html>`;
}
