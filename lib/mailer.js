// Mailer — plain fetch to the Resend API, zero-dep. By design, the ONLY
// email this system sends automatically is the daily digest to the operator
// (DIGEST_TO). Pitch emails to prospects are never auto-sent: cold email to
// scraped addresses violates most ESP acceptable-use policies and several
// jurisdictions' law — drafts are queued for one-click manual sending instead.

export function mailerStatus() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY && process.env.OUTREACH_FROM),
    from: process.env.OUTREACH_FROM || null,
    digestTo: process.env.DIGEST_TO || null,
    hint: process.env.RESEND_API_KEY
      ? (process.env.OUTREACH_FROM ? null : 'Set OUTREACH_FROM (a verified sender on your Resend domain).')
      : 'Set RESEND_API_KEY and OUTREACH_FROM to enable the daily digest email.',
  };
}

export async function sendMail({ to, subject, text }) {
  if (!to) throw new Error('No recipient');
  const status = mailerStatus();
  if (!status.configured) {
    // Dry-run: callers treat this as success but it is clearly labeled.
    return { dryRun: true, to, subject };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.OUTREACH_FROM, to: [to], subject, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Resend error (HTTP ${res.status})`);
    return { dryRun: false, id: data.id, to, subject };
  } finally {
    clearTimeout(timer);
  }
}
