import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '..');
const html = await readFile(join(root, 'index.html'), 'utf8');
const art = /<svg id="hamster-art"[\s\S]*?<\/svg>/.exec(html)?.[0];
if (!art) throw new Error('The hamster artwork is missing.');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="UTF-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#101319;color:#f6f3ec;font-family:system-ui,sans-serif}
    main{width:1200px;height:630px;padding:66px 72px;display:grid;grid-template-columns:1.25fr 1fr;align-items:center;gap:30px}
    h1{font-size:76px;line-height:1.08;letter-spacing:-3px;margin:0 0 28px;font-weight:700}h1 span{color:#ffd477}
    p{font-size:26px;line-height:1.5;color:#a8b2c3;margin:0;max-width:500px}.note{font-size:19px;margin-top:38px;color:#a3caff}
    svg{width:440px;height:440px;display:block}
  </style><main><div><h1>Squeekchain<br><span>Tap</span></h1><p>Hamster-powered<br>internet economy.</p><p class="note">Tap. Stake. Mine. All for fun.</p></div>${art}</main></html>`);
  await mkdir(join(root, 'assets'), { recursive: true });
  await page.screenshot({ path: join(root, 'assets/og-image.png') });
  console.log('Created assets/og-image.png: 1200 × 630, using the inline hamster artwork and system fonts.');
} finally {
  await browser.close();
}
