# Squeekchain Tap

**Hamster-powered internet economy.** A one-page tapping game with original inline SVG artwork, a Squeeks balance, three upgrades, and passive mining. Game only, no real tokens or rewards.

The complete game is in [`index.html`](index.html): plain HTML, CSS, and JavaScript. No framework, runtime dependencies, external fonts, external images, APIs, wallet, login, backend, or browser storage. Progress lives in the current page's memory. Refreshing or closing the page resets it.

## Install, build, and preview

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/preview/`. The preview stays in the foreground; stop it with Ctrl+C. An alternative port is available with `npm run preview -- --port 8080`.

The build uses Node's standard library to copy the page and its two metadata assets into **`dist/`**. The finished export is included in the delivery and needs no build server. Serve that directory on any static host, including a nested gateway path. Asset links are relative. You can also open `dist/index.html` directly: its game artwork, CSS, and JavaScript are inline.

The loaded game keeps working when the network is disconnected. Reloading while offline is not guaranteed by HTTP caching; there is intentionally no service worker. Mining accrues while this page remains open, including elapsed time between delayed timer callbacks. There is no reward after the page is closed.

## Play and economy

- Tap the large hamster button, or focus it and press Space or Enter. Initial earnings are 1 Squeeks per tap.
- **Stake a Squeek**, starting at 15 Squeeks: +1 to base Squeeks per tap per level.
- **Mining rig**, starting at 30 Squeeks: +1 to base Squeeks per second per level.
- **Account power**, starting at 60 Squeeks: +0.5x to the multiplier per level. It applies to both tap and mining earnings.
- Every upgrade's next price is `ceil(starting price × 1.6 ^ current level)`. The bar shows the current balance toward that next purchase. Prices, levels, balances, and affordability update together.
- Use the blue `?` for the three short instructions. Escape, an outside press, or moving focus outside closes the panel.

Base prices and the price formula are in `upgrades` and `priceOf()` in `index.html`. These ordinary game-economy choices were inferred from the brief. Tap rewards and spending use integer half-Squeek units; mining carries fractional time forward before settling those units, including before an upgrade changes the rate.

## Check the delivered game

Development dependencies are only for validation and share-image generation; they are absent from `dist/`.

```sh
npm run typecheck
npx playwright install chromium webkit
npm test
```

On a supported Linux development host that lacks browser libraries, Playwright offers `npx playwright install --with-deps chromium webkit`. Chromium-only validation is available with `npm test -- --chromium-only`; it explicitly excludes Safari's engine.

`typecheck` extracts the **actual inline game script**, then runs TypeScript 5.9's strict `checkJs` with DOM types and no emit. It does not convert the page to TypeScript. `test` serves the actual production export at `/preview/game/`, exercises it with Playwright, runs axe accessibility checks, and closes its own browsers and preview. It uses a virtual clock to validate passive earnings without long waits. Transient test results and screenshots go in `test/scratch/`.

The optional share card is already included. To regenerate it from the inline hamster SVG:

```sh
npm run share-card
npm run build
```

## Actual validation

The production build and strict inline-JavaScript typecheck passed. **41/41 browser checks passed** across Chromium and WebKit, including two accessibility scans per engine with zero violations. The pinned `taste@1` design probe passed **16/16** after correcting a glow that caused horizontal overflow at 320px. See [`artifacts/validation.md`](artifacts/validation.md) for exact coverage, fixes, evidence, and tooling limitations. This is worker-side validation, not independent certification.

The six-domain design review and the final implementation are documented in [`DESIGN.md`](DESIGN.md). Checks include keyboard and touch play, spending, escalating prices, fractional multipliers, delayed mining settlement, offline operation after load, reset on reload, reduced motion, 200% text enlargement, RTL reflow, metadata assets at a nested path, and zero browser script/resource errors. Native screen-reader sessions, physical devices, and browser-native zoom are not claimed.

## Files and submission budget

| Path | Purpose |
| --- | --- |
| `index.html` | Complete editable game, styles, and inline art |
| `assets/` | Local favicon and 1200 × 630 PNG share image |
| `dist/` | Finished static export, including its assets |
| `scripts/` | Build, preview, strict typecheck, interaction validation, share-image generation |
| `package.json`, `package-lock.json` | Reproducible development-tool versions |
| `DESIGN.md` | Implemented tokens, typography, components, responsive rules |
| `artifacts/` | Final review, measurements, and selected actual screenshots |
| `docs/` | Design-guidance attribution and licenses |

The submission cap is **8,388,608 bytes**. `.gitignore` has this explicit path budget: `node_modules/` at every depth: **0 submitted bytes**; `.cache/` at every depth: **0 submitted bytes**; `.npm/` at every depth: **0 submitted bytes**; `/test/scratch/`: **0 submitted bytes**. These are generated tools, caches, downloaded test browsers, or disposable check evidence. `/artifacts/` is explicitly included over inherited ignore rules, with a **2,097,152-byte budget** for review receipts and selected screenshots; dependency/cache exclusions still apply inside it. No source or export is ignored. `dist/`, `assets/`, the lockfile, documentation, and selected evidence remain included. No dependency archives or vendored registry are needed for offline gameplay.

## Design guidance attribution

The implementation and review used the pinned Better Interface guidance by Jakub Krehel (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and the documentation method adapted from Paul Bakaus's Impeccable (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Attribution and both license texts are retained in [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md) and [`docs/design-guidance-LICENSE.txt`](docs/design-guidance-LICENSE.txt).
