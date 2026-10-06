import {defineConfig} from 'drizzle-kit';

// Drizzle Kit reads the schema below and writes SQL migrations to `./drizzle`.
// Webflow Cloud applies everything in that directory on deploy (see the
// `migrations_dir` on the D1 binding in wrangler.jsonc).
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
});
