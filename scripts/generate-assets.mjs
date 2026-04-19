/**
 * Generates PWA icons and og:image PNG files from SVG sources.
 * Run once: node scripts/generate-assets.mjs
 * Requires: npm install --save-dev sharp
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const assets = join(__dir, '../src/assets');

const iconSvg = readFileSync(join(assets, 'icon.svg'));
const ogSvg = readFileSync(join(assets, 'og-image.svg'));

await sharp(iconSvg).resize(192, 192).png().toFile(join(assets, 'icon-192.png'));
console.log('✓ icon-192.png');

await sharp(iconSvg).resize(512, 512).png().toFile(join(assets, 'icon-512.png'));
console.log('✓ icon-512.png');

await sharp(ogSvg).resize(1200, 630).png().toFile(join(assets, 'og-image.png'));
console.log('✓ og-image.png');

console.log('\nDone. Commit src/assets/*.png to the repository.');
