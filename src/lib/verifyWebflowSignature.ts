/**
 * Verify a Webflow outbound-webhook HMAC signature.
 *
 * Webflow signs each webhook with the app/webhook secret and sends:
 *   - `X-Webflow-Signature`  hex HMAC-SHA256
 *   - `X-Webflow-Timestamp`  signing time in epoch milliseconds
 *
 * The signed content is `` `${timestamp}:${rawRequestBody}` `` — where
 * `rawRequestBody` is the exact JSON string Webflow POSTed (so verify against
 * the raw body text, never a re-serialized object).
 *
 * Uses Web Crypto so it runs unchanged on Cloudflare Workers (Webflow Cloud)
 * and in Node.
 */
export interface VerifyWebflowSignatureArgs {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  /** Reject timestamps older than this (replay protection). Default 5 min. */
  maxAgeMs?: number;
}

export interface VerifyWebflowSignatureResult {
  valid: boolean;
  reason?: string;
}

export async function verifyWebflowSignature({
  rawBody,
  signature,
  timestamp,
  secret,
  maxAgeMs = 5 * 60 * 1000,
}: VerifyWebflowSignatureArgs): Promise<VerifyWebflowSignatureResult> {
  if (!signature) {
    return { valid: false, reason: "missing X-Webflow-Signature header" };
  }
  if (!timestamp) {
    return { valid: false, reason: "missing X-Webflow-Timestamp header" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "X-Webflow-Timestamp is not a number" };
  }
  const age = Date.now() - ts;
  if (age > maxAgeMs) {
    return { valid: false, reason: `stale timestamp (${age}ms old)` };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}:${rawBody}`),
  );
  const expected = bufferToHex(macBuffer);

  if (!timingSafeEqualHex(expected, signature)) {
    return { valid: false, reason: "signature mismatch" };
  }

  return { valid: true };
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
