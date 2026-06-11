import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the custom domain so canonical URLs and the sitemap are correct
// on GitHub Pages. Static output is the default.
export default defineConfig({
  site: 'https://fenn.md',
  integrations: [sitemap()],
});
