/**
 * POST /api/quiz-submit
 *
 * Receives a quiz payload from any of Krishna's site quizzes (buyer, tenant,
 * future seller/PM quizzes) and forwards it to the GoHighLevel Inbound Webhook.
 *
 * GHL workflow handles contact create/update, custom field mapping, tags,
 * and downstream notifications. This function is just the bridge so:
 *   - the webhook URL never appears in client-side HTML
 *   - we can validate, rate-limit, or log on the way through later
 *
 * Required Cloudflare environment variable:
 *   GHL_WEBHOOK_URL  (set in Cloudflare Pages → Settings → Environment variables)
 */

const ALLOWED_ORIGIN = 'https://meetkrishna.com';
const MAX_BODY_BYTES = 8_000; // ponytail: simple size guard, upgrade to KV rate-limit if spam occurs

export async function onRequestPost({ request, env }) {
  try {
    // Origin check — reject requests from outside the site
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: 'Forbidden' }, 403);
    }

    // Size guard — prevent large payloads
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413);
    }

    const payload = await request.json();

    // Light validation — email is the contact dedupe key in GHL
    if (!payload?.contact?.email) {
      return json({ error: 'Email required' }, 400);
    }

    if (!env.GHL_WEBHOOK_URL) {
      console.error('GHL_WEBHOOK_URL is not set in Cloudflare environment.');
      return json({ error: 'Webhook not configured' }, 500);
    }

    const ghlRes = await fetch(env.GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text();
      console.error('GHL webhook error', ghlRes.status, errText);
      return json({ error: 'GHL webhook failed' }, 502);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('quiz-submit error:', err && err.message);
    return json({ error: 'Server error' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
