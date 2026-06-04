// Generates raster icons from the brand mark: a 180x180 apple-touch-icon and a
// 32x32 favicon PNG (for contexts that don't take SVG). Re-run after editing the
// mark: `node scripts/gen-icons.mjs`. Uses sharp (a transitive Astro dep).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLUE = '#2f5bff', INK = '#111111', PAPER = '#f7f4ec';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

// Full-bleed tile (iOS rounds the corners itself); large ".md" for legibility.
const tile = (size, fontPct, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BLUE}"/>
  ${stroke ? `<rect x="${stroke / 2}" y="${stroke / 2}" width="${size - stroke}" height="${size - stroke}" fill="none" stroke="${INK}" stroke-width="${stroke}"/>` : ''}
  <text x="${size / 2}" y="${size * 0.685}" text-anchor="middle" font-family="${MONO}" font-size="${size * fontPct}" font-weight="700" fill="${PAPER}">.md</text>
</svg>`;

await sharp(Buffer.from(tile(180, 0.46, 0))).png().toFile(join(root, 'public/apple-touch-icon.png'));
await sharp(Buffer.from(tile(32, 0.47, 3))).png().toFile(join(root, 'public/favicon-32.png'));
console.log('✓ wrote public/apple-touch-icon.png (180×180) and public/favicon-32.png (32×32)');
