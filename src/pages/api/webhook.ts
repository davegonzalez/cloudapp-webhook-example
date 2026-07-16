import type {APIRoute} from 'astro';
import {verifyWebflowSignature} from '../../lib/verifyWebflowSignature';
import {recordWebhook} from '../../lib/recentWebhooks';

export const prerender = false;

// Webflow Cloud requires Astro API routes to run on the Cloudflare edge runtime.
export const config = {
  runtime: 'edge',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function getSecret(locals: App.Locals): string | undefined {
  return locals.runtime?.env?.WEBFLOW_WEBHOOK_SECRET;
}

/**
 * Generic Webflow webhook receiver.
 *
 * Verifies the HMAC signature (when a secret is configured), logs the payload,
 * and returns 200. Point any Webflow webhook trigger at:
 *   https://<slug>.webflow.io/<mount>/api/webhook
 */
export const POST: APIRoute = async ({request, locals}) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-webflow-signature');
  const timestamp = request.headers.get('x-webflow-timestamp');
  const secret = getSecret(locals);

  if (secret) {
    const result = await verifyWebflowSignature({
      rawBody,
      signature,
      timestamp,
      secret,
    });
    if (!result.valid) {
      console.warn('[webhook] signature verification failed:', result.reason);
      return json({error: 'invalid signature', reason: result.reason}, 401);
    }
  } else {
    console.warn(
      '[webhook] WEBFLOW_WEBHOOK_SECRET not set — skipping signature verification'
    );
  }

  let payload: Record<string, unknown> | string;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    payload = rawBody;
  }

  const triggerType =
    typeof payload === 'object' ? payload['triggerType'] : undefined;

  console.log('[webhook] received', {triggerType, verified: Boolean(secret)});
  console.log('[webhook] payload:', JSON.stringify(payload, null, 2));

  await recordWebhook(locals.runtime?.env?.WEBHOOK_EVENTS, {
    endpoint: '/api/webhook',
    triggerType: typeof triggerType === 'string' ? triggerType : null,
    verified: Boolean(secret),
    payload,
  });

  return json({received: true, verified: Boolean(secret), triggerType});
};

export const GET: APIRoute = () =>
  json({ok: true, hint: 'POST a Webflow webhook payload to this URL.'});
