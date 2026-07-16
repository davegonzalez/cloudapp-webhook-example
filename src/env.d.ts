/// <reference types="astro/client" />

interface Env {
  /** Webflow webhook signing secret. Set in .dev.vars locally and as a
   *  Webflow Cloud project variable/secret in deployed environments. */
  WEBFLOW_WEBHOOK_SECRET?: string;
  /** KV namespace holding the most-recent received webhooks, rendered on the
   *  homepage. Optional — when unbound, recording is a no-op. Bind it in
   *  wrangler.jsonc (local) and in the Webflow Cloud project (deployed). */
  WEBHOOK_EVENTS?: import("@cloudflare/workers-types").KVNamespace;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
