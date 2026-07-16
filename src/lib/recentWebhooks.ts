/**
 * Recent-webhook store backed by Cloudflare KV.
 *
 * Each accepted webhook is recorded so the homepage can render a live list —
 * an easy visual proof that deliveries are arriving, without digging through
 * the Dashboard runtime logs. We keep the most recent {@link MAX_EVENTS} in a
 * single KV key (`recent`) as a JSON array, newest first.
 *
 * The KV binding is optional: if it isn't configured (e.g. before you've bound
 * a namespace in the Webflow Cloud project), record/read become no-ops and the
 * receivers still return 200 — the page just shows an empty list.
 */

// Import type (Astro's documented Cloudflare pattern) rather than relying on an
// ambient `KVNamespace` global being in scope. Resolves via @astrojs/cloudflare.
type KVNamespace = import('@cloudflare/workers-types').KVNamespace;

const RECENT_KEY = 'recent';
const MAX_EVENTS = 20;
// Self-clean the key if writes ever stop, so a dormant app doesn't retain
// old payloads indefinitely.
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface WebhookEvent {
  /** Random id, used only as a stable render key. */
  id: string;
  /** ISO-8601 receipt time. */
  receivedAt: string;
  /** Which receiver handled it, e.g. `/api/webhook`. */
  endpoint: string;
  /** Webflow trigger type when present in the payload. */
  triggerType: string | null;
  /** Whether the HMAC signature was verified (false = no secret configured). */
  verified: boolean;
  /** The parsed JSON payload, or the raw string if it wasn't JSON. */
  payload: unknown;
}

/**
 * Record an accepted webhook. Read-modify-write on a single key; KV is
 * eventually consistent, so under a burst of concurrent deliveries a record
 * can occasionally be dropped from the list. That's an acceptable trade for a
 * demo/proof surface — the authoritative signal is still the runtime logs.
 */
export async function recordWebhook(
  kv: KVNamespace | undefined,
  event: Omit<WebhookEvent, 'id' | 'receivedAt'>,
): Promise<void> {
  if (!kv) {
    return;
  }

  const entry: WebhookEvent = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    ...event,
  };

  const existing = await getRecentWebhooks(kv);
  const next = [entry, ...existing].slice(0, MAX_EVENTS);
  await kv.put(RECENT_KEY, JSON.stringify(next), {
    expirationTtl: TTL_SECONDS,
  });
}

/** Read the most-recent webhooks (newest first). Returns [] when unset. */
export async function getRecentWebhooks(
  kv: KVNamespace | undefined,
): Promise<WebhookEvent[]> {
  if (!kv) {
    return [];
  }

  const raw = await kv.get(RECENT_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WebhookEvent[]) : [];
  } catch {
    return [];
  }
}
