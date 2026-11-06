import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join, extname, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist');
const evidence = join(root, 'test/scratch/validation');
await mkdir(evidence, { recursive: true });
const results = [];
const failures = [];
const engineVersions = {};
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!path.startsWith('/preview/game/')) { response.writeHead(404).end(); return; }
    const file = resolve(output, path.slice('/preview/game/'.length) || 'index.html');
    if (!file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/preview/game/`;

async function check(name, action) {
  const start = performance.now();
  try {
    await action();
    results.push({ name, passed: true, durationMs: Math.round(performance.now() - start) });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error.message;
    results.push({ name, passed: false, error: message });
    failures.push(name);
    console.error(`FAIL ${name}: ${message}`);
  }
}

async function runGame(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const errors = [];
  const requests = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install();
  await page.goto(url);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const balance = async () => Number((await page.locator('#balance').textContent()).replaceAll(',', ''));
  const tap = page.locator('#tap-button');
  const text = selector => page.locator(selector).textContent();
  const tapMany = count => page.evaluate(n => {
    const button = document.getElementById('tap-button');
    for (let i = 0; i < n; i++) button.click();
  }, count);
  try {
    await check(`${engine}: zero state, prices, progress, and unavailable upgrades`, async () => {
      assert.equal(await balance(), 0);
      assert.equal(await text('#per-tap'), '1');
      assert.equal(await text('#per-second'), '0');
      assert.equal(await text('#power'), '1x');
      for (const [kind, price] of [['stake', 15], ['mining', 30], ['power', 60]]) {
        assert.equal(await text(`#${kind}-level`), 'Level 0');
        assert.equal(await text(`#${kind}-price`), String(price));
        assert.equal(await page.locator(`#buy-${kind}`).isDisabled(), true);
        assert.equal(await page.locator(`#${kind}-progress`).evaluate(el => el.value), 0);
      }
    });

    await check(`${engine}: keyboard help, exact instructions, Escape and focus return`, async () => {
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#help-toggle').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#help-toggle').getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await page.locator('#help-panel li').allTextContents(), [
        'Tap to earn Squeeks.', 'Stake to build account power.', 'Mine to earn while you wait.'
      ]);
      await page.screenshot({ path: join(evidence, `${engine}-help-focus.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#help-panel').isHidden(), true);
      assert.equal(await page.locator('#help-toggle').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#help-toggle').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    });

    await check(`${engine}: Space, Enter and touch earn Squeeks with honest tap feedback`, async () => {
      await page.keyboard.press('Tab');
      assert.equal(await tap.evaluate(el => el === document.activeElement), true);
      await page.screenshot({ path: join(evidence, `${engine}-tap-focus.png`) });
      await page.keyboard.press('Space');
      assert.equal(await balance(), 1);
      assert.equal(await text('.tap-gain'), '+1');
      await page.keyboard.press('Enter');
      assert.equal(await balance(), 2);
      await tap.tap();
      assert.equal(await balance(), 3);
      await page.locator('#help-toggle').tap();
      assert.equal(await page.locator('#help-panel').isVisible(), true);
      await tap.tap();
      assert.equal(await balance(), 4);
      assert.equal(await page.locator('#help-panel').isHidden(), true);
      await tapMany(11);
      assert.equal(await balance(), 15);
      assert.equal(await page.locator('#stake-progress').evaluate(el => el.value), 15);
      assert.equal(await page.locator('#mining-progress').evaluate(el => el.value), 15);
    });

    await check(`${engine}: stake purchase deducts once, raises tap earnings and price`, async () => {
      assert.equal(await page.locator('#buy-stake').isEnabled(), true);
      await page.locator('#buy-stake').focus();
      await page.keyboard.press('Enter');
      assert.equal(await balance(), 0);
      assert.equal(await text('#stake-level'), 'Level 1');
      assert.equal(await text('#stake-price'), '24');
      assert.equal(await text('#per-tap'), '2');
      assert.equal(await tap.evaluate(el => el === document.activeElement), true);
      await page.locator('#buy-stake').evaluate(el => el.click());
      assert.equal(await balance(), 0);
      assert.equal(await text('#stake-level'), 'Level 1');
      assert.match(await text('#shop-status'), /Stake a Squeek upgraded to level 1/);
    });

    await check(`${engine}: mining starts at purchase and pays by elapsed time`, async () => {
      await tapMany(15);
      assert.equal(await balance(), 30);
      await page.locator('#buy-mining').click();
      assert.equal(await balance(), 0);
      assert.equal(await text('#mining-level'), 'Level 1');
      assert.equal(await text('#mining-price'), '48');
      assert.equal(await text('#per-second'), '1');
      await page.clock.fastForward(1000);
      assert.equal(await balance(), 1);
    });

    await check(`${engine}: power multiplies both earnings and preserves fractional Squeeks`, async () => {
      await tapMany(30);
      assert.equal(await balance(), 61);
      await page.locator('#buy-power').click();
      assert.equal(await balance(), 1);
      assert.equal(await text('#power'), '1.5x');
      assert.equal(await text('#power-price'), '96');
      assert.equal(await text('#per-tap'), '3');
      assert.equal(await text('#per-second'), '1.5');
      await page.clock.fastForward(1000);
      assert.equal(await balance(), 2.5);
      await page.clock.fastForward(1000);
      assert.equal(await balance(), 4);
      await tapMany(1);
      assert.equal(await balance(), 7);
      assert.equal(await text('.tap-gain'), '+3');
    });

    await check(`${engine}: repeat purchases, price growth, and delayed timer settlement`, async () => {
      await tapMany(14);
      assert.equal(await balance(), 49);
      await page.locator('#buy-mining').click();
      assert.equal(await balance(), 1);
      assert.equal(await text('#mining-level'), 'Level 2');
      assert.equal(await text('#mining-price'), '77');
      assert.equal(await text('#per-second'), '3');
      await page.clock.fastForward(1000);
      assert.equal(await balance(), 4);
      // fastForward emits each missed interval once, simulating a throttled tab.
      await page.clock.fastForward(60000);
      assert.equal(await balance(), 184);
      await page.locator('#buy-power').click();
      assert.equal(await balance(), 88);
      assert.equal(await text('#power-level'), 'Level 2');
      assert.equal(await text('#power-price'), '154');
      assert.equal(await text('#power'), '2x');
      assert.equal(await text('#per-second'), '4');
      await page.clock.fastForward(1000);
      assert.equal(await balance(), 92);
      await page.locator('#buy-stake').click();
      assert.equal(await balance(), 68);
      assert.equal(await text('#stake-price'), '39');
      assert.equal(await text('#per-tap'), '6');
      await page.locator('#buy-stake').click();
      assert.equal(await balance(), 29);
      assert.equal(await text('#stake-price'), '62');
      assert.equal(await text('#per-tap'), '8');
      assert.equal(await text('#stake-level'), 'Level 3');
    });

    await check(`${engine}: offline taps and mining, no external requests or saved state`, async () => {
      await context.setOffline(true);
      await tapMany(1);
      assert.equal(await balance(), 37);
      await page.clock.fastForward(2000);
      assert.equal(await balance(), 45);
      assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie })), { local: 0, session: 0, cookies: '' });
      assert.equal(requests.some(request => !request.startsWith(origin)), false);
      await context.setOffline(false);
      await page.reload();
      assert.equal(await balance(), 0);
      assert.equal(await text('#stake-level'), 'Level 0');
      assert.equal(await text('#mining-level'), 'Level 0');
      assert.equal(await text('#power-level'), 'Level 0');
    });

    await check(`${engine}: reduced motion has static feedback and bounded effects`, async () => {
      await tapMany(100);
      assert.equal(await balance(), 100);
      assert.equal(await page.locator('.tap-gain').count(), 1);
      assert.equal(await tap.evaluate(el => getComputedStyle(el).transform), 'none');
      assert.equal(await page.locator('.tap-gain').evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.clock.fastForward(701);
      assert.equal(await page.locator('.tap-gain').count(), 0);
      assert.equal(await text('#earn-status'), 'Balance: 100 Squeeks.');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // Let rendering commit the changed preference before testing its new state.
      await page.clock.runFor(50);
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
      await tapMany(100);
      assert.equal(await page.locator('.tap-gain').count(), 16);
      assert.equal(await page.locator('.tap-gain').last().evaluate(el => getComputedStyle(el).animationName), 'gain-float');
      await page.clock.fastForward(701);
      assert.equal(await page.locator('.tap-gain').count(), 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.runFor(50);
      await tapMany(1);
      assert.equal(await page.locator('.tap-gain').count(), 1);
      assert.equal(await page.locator('.tap-gain').evaluate(el => getComputedStyle(el).animationName), 'none');
    });

    await check(`${engine}: no script, console, or resource errors`, async () => { assert.deepEqual(errors, []); });
  } finally { await context.close(); }
}

async function inspectLayout(browser, engine) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [928, 900], [1440, 900]]) {
      await check(`${engine}: ${width}px reflow and responsive layout`, async () => {
        await page.setViewportSize({ width, height });
        await page.goto(url);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const bounds = await page.locator('#tap-button').boundingBox();
        if (width === 390) {
          assert.ok(bounds.y > 0 && bounds.y + bounds.height <= height, `Main action ends at ${bounds.y + bounds.height}px, beyond ${height}px.`);
          assert.equal(await page.getByRole('heading', { name: 'Squeekchain Tap', exact: true }).isVisible(), true);
        }
        const columns = await page.locator('main').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        assert.equal(columns, width >= 928 ? 2 : 1);
        await page.screenshot({ path: join(evidence, `${engine}-${width}.png`), fullPage: true });
        if (width === 390) await page.screenshot({ path: join(evidence, `${engine}-390-first-screen.png`) });
      });
    }
    await check(`${engine}: purchase feedback keeps the shop in place`, async () => {
      await page.setViewportSize({ width: 928, height: 900 });
      await page.goto(url);
      const before = await page.locator('.upgrades').boundingBox();
      await page.evaluate(() => { for (let i = 0; i < 15; i++) document.getElementById('tap-button').click(); });
      await page.locator('#buy-stake').click();
      const after = await page.locator('.upgrades').boundingBox();
      assert.equal(after.y, before.y);
    });
    await check(`${engine}: metadata assets resolve at a nested static hosting path`, async () => {
      await page.goto(url);
      const metadata = await page.evaluate(() => ({ title: document.title, description: document.querySelector('meta[name="description"]').content, ogTitle: document.querySelector('meta[property="og:title"]').content, image: document.querySelector('meta[property="og:image"]').content, icon: document.querySelector('link[rel="icon"]').getAttribute('href') }));
      assert.ok(metadata.title.includes('Squeekchain Tap'));
      assert.ok(metadata.description && metadata.ogTitle);
      for (const asset of [metadata.image, metadata.icon]) {
        assert.ok(asset.startsWith('./assets/'));
        const response = await page.request.get(new URL(asset, url).href);
        assert.equal(response.status(), 200);
        assert.ok((await response.body()).length > 0);
      }
    });
    await check(`${engine}: 200% text enlargement reflows without horizontal scroll`, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(evidence, `${engine}-text-200.png`), fullPage: true });
    });
    await check(`${engine}: RTL mirror remains usable`, async () => {
      await page.goto(url);
      await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#help-toggle').click();
      const panel = await page.locator('#help-panel').boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
      await page.screenshot({ path: join(evidence, `${engine}-rtl.png`), fullPage: true });
    });
    await check(`${engine}: automated accessibility of initial and affordable states`, async () => {
      await page.goto(url);
      const initial = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      await page.evaluate(() => { for (let i = 0; i < 60; i++) document.getElementById('tap-button').click(); });
      await page.locator('#help-toggle').click();
      const affordable = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      await writeFile(join(evidence, `${engine}-axe.json`), JSON.stringify({ initial, affordable }, null, 2));
      assert.deepEqual(initial.violations.map(x => ({ id: x.id, nodes: x.nodes.map(n => n.target) })), []);
      assert.deepEqual(affordable.violations.map(x => ({ id: x.id, nodes: x.nodes.map(n => n.target) })), []);
    });
    if (engine === 'chromium') await check('chromium: forced colors retain visible keyboard focus', async () => {
      await page.goto(url);
      await page.emulateMedia({ forcedColors: 'active' });
      await page.locator('#tap-button').focus();
      const focus = await page.locator('#tap-button').evaluate(el => ({ color: getComputedStyle(el).outlineColor, width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
      assert.equal(focus.style, 'solid');
      assert.equal(focus.width, '3px');
      await page.screenshot({ path: join(evidence, 'chromium-forced-colors.png') });
    });
  } finally { await context.close(); }
}

try {
  const engines = process.argv.includes('--chromium-only') ? [['chromium', chromium]] : [['chromium', chromium], ['webkit', webkit]];
  for (const [name, engine] of engines) {
    let browser;
    try { browser = await engine.launch({ headless: true }); }
    catch (error) { failures.push(`${name}: browser launch`); results.push({ name: `${name}: browser launch`, passed: false, error: error.message }); console.error(`${name} could not launch: ${error.message}`); continue; }
    engineVersions[name] = browser.version();
    try { await runGame(browser, name); await inspectLayout(browser, name); }
    catch (error) { failures.push(`${name}: browser runtime`); results.push({ name: `${name}: browser runtime`, passed: false, error: error.message }); console.error(`${name} could not finish: ${error.message}`); }
    finally { await browser.close(); }
  }
} finally {
  await new Promise(done => server.close(done));
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ engineVersions, passed: results.filter(result => result.passed).length, failed: failures.length, results }, null, 2));
}
console.log(`${results.filter(result => result.passed).length} checks passed; ${failures.length} failed. Evidence: test/scratch/validation/.`);
if (failures.length) process.exitCode = 1;
