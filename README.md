# Webflow Cloud webhook sample

A minimal [Astro](https://astro.build) + Cloudflare app that runs on
[Webflow Cloud](https://developers.webflow.com/webflow-cloud/bring-your-own-app),
receives Webflow webhooks, and verifies their HMAC signature. It demonstrates
pointing a Webflow webhook at a Webflow Cloud app served on the published-site
domain (`<slug>.webflow.io`).

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/webhook` | Generic receiver — verifies signature, logs the payload. |
| `POST /api/content-change` | CMS `collection_item_changed` receiver (Algolia-style re-index). |

Signature verification lives in `src/lib/verifyWebflowSignature.ts` (Web Crypto,
runs unchanged on Cloudflare Workers). It checks `X-Webflow-Signature` /
`X-Webflow-Timestamp` against `HMAC-SHA256(secret, "<timestamp>:<rawBody>")` and
rejects stale timestamps.

## Webflow Cloud config (already wired up)

Per the [Bring Your Own App](https://developers.webflow.com/webflow-cloud/bring-your-own-app)
guide, this repo is set up for the **Astro** framework path:

- **`webflow.json`** — declares the framework: `{ "cloud": { "framework": "astro" } }`.
- **`@astrojs/cloudflare`** adapter with `output: "server"` in `astro.config.mjs`.
  > Note: **OpenNext is only for the Next.js framework path.** Astro uses the
  > `@astrojs/cloudflare` adapter instead, so this app does not need `@opennextjs/cloudflare`.
- **`base` + `build.assetsPrefix`** are read from `MOUNT_PATH` at build time so URLs
  resolve under the app's mount path.
- Each API route exports `config = { runtime: "edge" }`, required by Webflow Cloud.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # set WEBFLOW_WEBHOOK_SECRET
npm run dev                       # http://localhost:4321
```

Send a signed test request (matches Webflow's signing scheme):

```bash
SECRET="your-secret"
TS=$(node -e 'console.log(Date.now())')
BODY='{"triggerType":"collection_item_changed","payload":{"id":"abc123"}}'
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.SECRET).update(process.env.TS+':'+process.env.BODY).digest('hex'))" SECRET="$SECRET" TS="$TS" BODY="$BODY")

curl -sS -X POST http://localhost:4321/api/content-change \
  -H 'content-type: application/json' \
  -H "x-webflow-signature: $SIG" \
  -H "x-webflow-timestamp: $TS" \
  -d "$BODY"
```

Omit the secret (leave `.dev.vars` unset) to skip verification while smoke-testing.

## Deploy to Webflow Cloud

```bash
npm install
webflow auth login
MOUNT_PATH=/<your-mount> npm run build   # e.g. MOUNT_PATH=/webhook-sample
webflow cloud deploy                      # pick your site on first run
```

Then, in the Webflow Cloud dashboard, set the app's **mount path** (matching
`MOUNT_PATH`) and add `WEBFLOW_WEBHOOK_SECRET` under the environment's variables.

Deployed webhook URLs become:

```
https://<slug>.webflow.io/<mount>/api/webhook
https://<slug>.webflow.io/<mount>/api/content-change
```

## Register the webhook

Create a webhook via the Data API v2 pointing at the deployed app URL:

```bash
curl -sS -X POST "https://api.webflow.com/v2/sites/<siteId>/webhooks" \
  -H "authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{
    "triggerType": "collection_item_changed",
    "url": "https://<slug>.webflow.io/<mount>/api/content-change"
  }'
```

Then trigger the event (edit a CMS item / publish) and confirm receipt two ways:

- **Dashboard → Runtime logs** for the environment show `[content-change] indexing item` (and the full payload) — the app `console.log`s every delivery.
- **The app homepage** (`https://<slug>.webflow.io/<mount>/`) renders a **Recent webhooks** list — a live visual proof, no log-diving required. This requires the KV binding below.

## Viewing received webhooks on the page

The homepage lists the most recent deliveries (newest first, up to 20), each expandable to show the payload. This is backed by a Cloudflare **KV** namespace bound as `WEBHOOK_EVENTS`, declared in `wrangler.jsonc`:

```jsonc
"kv_namespaces": [{ "binding": "WEBHOOK_EVENTS", "id": "webhook_events_local" }]
```

- **Webflow Cloud**: no manual provisioning needed. Declaring the binding above is enough — Webflow Cloud **auto-provisions the namespace and assigns the real `id` on `webflow cloud deploy`** ([KV store docs](https://developers.webflow.com/webflow-cloud/storing-data/key-value-store)). You can view/manage namespaces in the Webflow Cloud dashboard after deploy.
- **Local** (`npm run preview`): the `id` is just a label — Miniflare simulates the namespace, no setup needed.
- After changing bindings, regenerate types with `npx wrangler types`.

The binding is **optional by design**: if it's ever missing, the receivers still return 200 and log to runtime logs — the page just shows a "not bound" notice, and recording is a no-op. Each accepted webhook is stored as `{ receivedAt, endpoint, triggerType, verified, payload }`.

## SQLite database (D1)

The app also ships a minimal **D1 (SQLite)** database with a `users_table`
(`id`, `name`, `email`), defined with [Drizzle ORM](https://orm.drizzle.team)
and wired up per the [Add a SQLite database](https://developers.webflow.com/webflow-cloud/add-sqlite)
guide.

- **Schema**: `src/db/schema/index.ts` — the `usersTable` definition.
- **Config**: `drizzle.config.ts` — points Drizzle Kit at the schema and writes
  migrations to `./drizzle`.
- **Binding**: `DB` in `wrangler.jsonc`, with `"migrations_dir": "drizzle"` so
  Webflow Cloud applies the migrations on deploy. Webflow Cloud provisions the
  real database and assigns `database_id` on `webflow cloud deploy`; locally,
  Wrangler simulates it.

### Local setup

```bash
npm install
npm run db:generate      # regenerate migrations after editing the schema
npm run db:apply:local   # apply migrations to the local D1 database
npm run db:seed:local    # seed 100 fake users (local only)
```

`db:seed:local` runs `scripts/generate-seed.mjs` to write `scripts/seed.sql`
(gitignored) and applies it with `wrangler d1 execute`. Emails embed the row
index, so all 100 are unique. To seed a deployed database instead, run the
generator and then `wrangler d1 execute DB --remote --file=./scripts/seed.sql`.

Inspect the local data directly:

```bash
npx wrangler d1 execute DB --local --command "SELECT * FROM users_table LIMIT 10;"
```

On deploy, Webflow Cloud applies anything in `drizzle/` automatically; you can
browse the table under the environment's **Storage** tab in the Webflow Cloud
dashboard.
