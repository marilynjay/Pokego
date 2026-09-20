// Rasterises assets/icon.svg into the PNG sizes iOS and Android want.
// iOS ignores SVG for apple-touch-icon, so real bitmaps are required.
//
//   node tools/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, existsSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']];

const found = process.env.CHROME_PATH
  ?? globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome').find(existsSync);
const browser = await chromium.launch(found ? { executablePath: found } : {});
const svg = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8');

for (const [size, name] of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.locator('svg').screenshot({ path: join(ROOT, 'assets', name), omitBackground: false });
  await page.close();
  console.log(`  assets/${name}`);
}
await browser.close();
