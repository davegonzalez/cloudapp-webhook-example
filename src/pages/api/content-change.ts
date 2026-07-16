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

/**
 * CMS "collection item changed" receiver — a common Algolia-style use case.
 * Verifies the signature, then simulates re-indexing the changed item into a
 * search index.
 *
 * Register a `collection_item_changed` (v2) webhook pointing at:
 *   https://<slug>.webflow.io/<mount>/api/content-change
 */
export const POST: APIRoute = async ({request, locals}) => {
  const rawBody = await request.text();
  const secret = locals.runtime?.env?.WEBFLOW_WEBHOOK_SECRET;

  if (secret) {
    const result = await verifyWebflowSignature({
      rawBody,
      signature: request.headers.get('x-webflow-signature'),
      timestamp: request.headers.get('x-webflow-timestamp'),
      secret,
    });
    if (!result.valid) {
      console.warn('[content-change] signature failed:', result.reason);
      return json({error: 'invalid signature', reason: result.reason}, 401);
    }
  } else {
    console.warn('[content-change] no secret set — skipping verification');
  }

  let event: {triggerType?: string; payload?: Record<string, unknown>};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({error: 'invalid JSON body'}, 400);
  }

  // v2 webhooks are enveloped: {triggerType, payload}. v1 sends the item directly.
  const item = event.payload ?? (event as Record<string, unknown>);
  const itemId = (item as Record<string, unknown>)['id'] ?? 'unknown';

  console.log('[content-change] indexing item', {
    triggerType: event.triggerType,
    itemId,
  });
  // e.g. await algolia.saveObject({ objectID: itemId, ...fieldData })
  console.log('[content-change] item payload:', JSON.stringify(item, null, 2));

  await recordWebhook(locals.runtime?.env?.WEBHOOK_EVENTS, {
    endpoint: '/api/content-change',
    triggerType: event.triggerType ?? null,
    verified: Boolean(secret),
    payload: item,
  });

  return json({indexed: true, itemId});
};
