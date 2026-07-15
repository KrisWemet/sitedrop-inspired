// Outreach: a personalized pitch email per lead, built from the gathered
// profile and the generated site. Template-based; if ANTHROPIC_API_KEY is
// set, Claude writes a bespoke version instead.

function templatePitch(lead, profile, previewUrl) {
  const first = lead.name.split(/\s+/)[0];
  const city = lead.city || 'your area';
  const cat = lead.category.toLowerCase();
  const searchPhrase = `${cat} in ${city}`;

  const subject = `I built ${lead.name} a website — take a look`;

  const body = `Hi there,

I came across ${lead.name} while looking at local businesses in ${city}, and I noticed something surprising: when people search for "${searchPhrase}", you don't show up — because ${lead.name} doesn't have a website.

These days that's where most new customers start. It's also where AI assistants like ChatGPT and Claude look when someone asks them to recommend a ${cat} nearby — no website means you're invisible there too.

So instead of just telling you that, I went ahead and built you one:

${previewUrl}

It's a complete, professional site with your services, hours, and contact details — and under the hood it's fully optimized for both Google and AI search (structured data, local keywords, the works), so ${lead.name} can start showing up where people are actually looking.

If you like it, it's yours — I'll put it live on your own domain and you'll own everything. If you'd like anything changed (photos, wording, colors), that's quick to do.

Worth a 10-minute call this week?

Best regards,
[Your name]
[Your phone]

P.S. No pressure either way — the preview link above costs you nothing to look at.`;

  return { subject, body, source: 'template' };
}

async function claudePitch(lead, profile, previewUrl) {
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
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Write a short, warm, non-pushy cold outreach email to a local business owner. I already built them a free preview website and want them to look at it.

Business: ${lead.name} (${lead.category}) in ${lead.city || 'their town'}${lead.state ? ', ' + lead.state : ''}
They currently have NO website. Preview link to include: ${previewUrl}
Sign-off placeholders: [Your name], [Your phone]

Respond with ONLY valid JSON: {"subject": string, "body": string}. Keep the body under 200 words, plain text, honest (no fake claims or fake urgency).`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (json.subject && json.body) return { ...json, source: 'claude' };
  } catch { /* fall back to template */ }
  finally { clearTimeout(timer); }
  return null;
}

export async function buildOutreach(lead, profile, previewUrl) {
  const ai = await claudePitch(lead, profile, previewUrl);
  const pitch = ai || templatePitch(lead, profile, previewUrl);
  return { ...pitch, generatedAt: new Date().toISOString() };
}
