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

export async function onRequestPost({ request, env }) {
  try {
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

// Optional: friendly response for OPTIONS preflight (only if calling cross-origin)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
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
