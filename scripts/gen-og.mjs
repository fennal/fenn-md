// Generates the social share card (Open Graph image) at public/og.png.
// Neo-brutalist 1200x630 card built as SVG, rasterized with sharp (a transitive
// Astro dep — no new packages). Content is pulled from src/data/home.md, so it
// stays in sync: re-run `node scripts/gen-og.mjs` after editing name/role/tagline.
//
// Note: the brand fonts (Space Grotesk / JetBrains Mono) aren't installed on most
// machines and libvips can't read base64 @font-face, so we render with a heavy
// system grotesque — the same fallback the live site uses if the webfont fails.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- pull content from the single source of truth -------------------------
const md = readFileSync(join(root, 'src/data/home.md'), 'utf8');
const fm = md.split('---')[1] || '';
const field = (k) => {
  const m = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const name = field('name') || 'Alex Fenn, MD';
const role = field('role') || 'Emergency Medicine · Clinical Informatics';
const tagline = field('tagline') || 'Building safer healthcare AI at the point of care.';

// split "Alex Fenn, MD" -> first="ALEX", last="FENN", cred="MD"
const [namePart, ...credParts] = name.split(',');
const cred = credParts.join(',').trim();
const words = namePart.trim().split(/\s+/);
const first = (words[0] || '').toUpperCase();
const last = words.slice(1).join(' ').toUpperCase();

// --- palette / fonts ------------------------------------------------------
const PAPER = '#f7f4ec', INK = '#111111', BLUE = '#2f5bff', PINK = '#ff5470', YELLOW = '#ffd23f';
const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'Menlo, ui-monospace, monospace';
const W = 1200, H = 630;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(17,17,17,0.16)"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>

  <!-- brutalist frame -->
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${INK}" stroke-width="6"/>

  <!-- role chip -->
  <rect x="62" y="74" width="700" height="46" fill="${INK}"/>
  <text x="84" y="105" font-family="${MONO}" font-size="20" letter-spacing="1.5" fill="${PAPER}">${esc(role.toUpperCase())}</text>

  <!-- headline -->
  <text x="58" y="288" font-family="${SANS}" font-size="156" font-weight="700" letter-spacing="-5" fill="${INK}">${esc(first)}</text>
  <text x="58" y="430" font-family="${SANS}" font-size="156" font-weight="700" letter-spacing="-5"><tspan fill="${INK}">${esc(last)}</tspan>${cred ? `<tspan fill="${BLUE}">, ${esc(cred)}</tspan>` : ''}</text>

  <!-- tagline -->
  <text x="62" y="516" font-family="${SANS}" font-size="35" font-weight="500" fill="${INK}">${esc(tagline)}</text>

  <!-- footer url on a highlighter swipe -->
  <rect x="60" y="558" width="156" height="28" fill="${YELLOW}"/>
  <text x="64" y="582" font-family="${MONO}" font-size="27" font-weight="500" fill="${INK}">fenn.md</text>

  <!-- .md sticker -->
  <g transform="translate(1052,158) rotate(10)">
    <circle r="80" fill="${PINK}" stroke="${INK}" stroke-width="6"/>
    <text x="0" y="16" text-anchor="middle" font-family="${MONO}" font-size="48" font-weight="700" fill="${INK}">.md</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(root, 'public/og.png'));
console.log('✓ wrote public/og.png  (' + W + '×' + H + ')  —', name);
