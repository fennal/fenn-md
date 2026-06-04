import { defineConfig } from 'astro/config';

// Concept-phase config. `site` is the eventual custom domain so canonical URLs
// and sitemap are correct once we deploy to GitHub Pages.
export default defineConfig({
  site: 'https://fenn.md',
  // Static output is the default; nothing else needed for GitHub Pages.
});
