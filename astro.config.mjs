import {defineConfig} from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Webflow Cloud serves each app under a mount path (set in the WF Cloud
// dashboard environment settings). Set MOUNT_PATH at build time so page and
// asset URLs resolve under that prefix. Locally (no MOUNT_PATH) it serves from
// the root.
const mountPath = process.env.MOUNT_PATH || '/';

// https://astro.build/config
export default defineConfig({
  base: mountPath,
  build: {
    assetsPrefix: mountPath,
  },
  output: 'server',
  adapter: cloudflare({
    platformProxy: {enabled: true},
  }),
});
