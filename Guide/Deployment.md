# Deploy and verify the RtDt WebApp

RtDt's browser interface is a static HTML/JavaScript site. The repository's published entry point is [RtDt on GitHub Pages](https://inventordave2.github.io/RtDt-v3.0/webapp.html). No Node server is needed to host it.

## Local serving

From the repository root:

~~~sh
python -m http.server 8000
# Open http://localhost:8000/webapp.html
~~~

Use HTTP(S), not `file://`: repository scene/pack dependencies use fetch. Select the **RtDt repository · featured scenes** collection to load hosted examples, or **RtDt pack (.rdt)** for the hosted pack or a user-selected local pack folder.

## Publish checklist

- [ ] Confirm the site's source or deployment workflow publishes `webapp.html`, all referenced `rtdt_*.js` files, the sample scene files and assets.
- [ ] Check the deployed GitHub Pages path, JavaScript requests, content types and browser console for 404/CORS errors.
- [ ] Load a built-in scene and render a still image.
- [ ] Load a repository scene with OBJ dependencies; check required asset status and render.
- [ ] Load the featured Orbit Studio `.rdt` pack; check resolution, animation frame range and ZIP filename.
- [ ] Select a local pack folder; verify the browser requests only files the user selected and reports missing required dependencies.
- [ ] Apply an AetherOre `.phy` pose; play and stop an animation; export a short ZIP with `manifest.json`.
- [ ] Export PNG, JPEG, BMP and PPM stills; inspect dimensions. PNG/PPM use common codecs; browser JPEG is platform-specific.
- [ ] Check desktop and mobile viewport layout, error messages, export cancellation and UI recovery.
- [ ] Only when configured, verify OAuth and cloud upload in a test account and the native folder picker on supported browsers.

## Automated verification

~~~sh
npm install
npm test
npm run test:browser
npm run test:animation:full
~~~

`npm test` covers core/CLI/pack/animation/cloud mock tests, browser adapters and the benchmark smoke target. `test:browser` is a separate headless Chromium/Playwright test that needs its optional browser dependency installed. The GitHub Actions [feature-verification workflow](../.github/workflows/verify-features.yml) runs Node 20/22, the full 192-frame batch and Chromium smoke tests.

The mock cloud tests are **not** a substitute for live provider sign-in or filesystem permission verification. A successful CI run also does not establish that GitHub Pages has already deployed the same commit.

## Current boundaries

RtDt renders against point lights; sampled area/spherical lighting and normal/bump-map shading are not implemented. The browser is a UI adapter for the shared job renderer, not an independent GPU renderer. The global scene state does not yet support isolated parallel jobs.

For the execution model, see [Architecture](Architecture.md), [render flow](Render-control-flow.md) and the [.rdt pack format](RDT-pack-format.md).
