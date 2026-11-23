# RtDt — JavaScript raytracer for Node.js and the WebApp

![RtDt robot mascots at a floating rendering panel](img/rtdt-robots-readme.jpg)

RtDt is a JavaScript raytracer with a Node.js command-line interface and a static browser WebApp. Both frontends use the same geometric/shading core, the shared `rtdt_job.js` execution API, AetherOre `.phy` animation, and PNG/PPM encoders. Browser display, file access and authentication remain platform adapters. The project is under active development.

Supported capabilities include primitives and OBJ triangle meshes, smooth per-corner normals and UV texture coordinates, a point light, shadows, reflection/refraction, BVH subdivision, declarative scene descriptions, `.rdt` job packs, and frame-by-frame animation.

## Licensing

RtDt Community source and documentation are offered under the [MIT licence](LICENSE), except separately licensed third-party materials. The copyright holder may offer separate source-readable premium integrations or enhancements under independent licences; these do not limit the community MIT grant. Read [LICENSING.md](LICENSING.md). The Lee Perry-Smith head sample carries its own [CC BY 3.0 attribution](samples/lee-perry-smith-head/LICENSE.txt).

## Run the WebApp

[Open the hosted WebApp](https://inventordave2.github.io/RtDt-v3.0/webapp.html), or serve the repository from its root:

~~~sh
python -m http.server 8000
# Open http://localhost:8000/webapp.html
~~~

Select a featured scene and click **Load repository scene**, then **Start render**. For a `.rdt` pack, select **RtDt pack (.rdt)** under Scene collection. Choose the hosted Orbit Studio pack or select a **local pack folder** containing the manifest and dependencies. A local scene can also be loaded separately with associated asset files.

The WebApp renders to a canvas, exports still images, and exports AetherOre frame sequences to ZIP, a user-selected folder (where supported), or an authenticated cloud destination. Cloud logins and native folder permissions need provider/OS-specific verification; automated tests use mocks for those integrations.

## Run Node.js

~~~sh
npm install
node cli.js --help
node cli.js --list-scenes
node cli.js --scene scene1 --width 160 --height 90 --output preview.png
node cli.js --scene-file samples/prism-garden.scene --width 160 --height 90 --output prism.jpg
node cli.js --lint-pack samples/orbit.rdt
node cli.js --job samples/orbit.rdt
~~~

The CLI supports PNG, JPEG, RGB/indexed BMP and P3 PPM still images; `.scene` JSON and the supported declarative YAML subset; `.phy` frame/time selection; batch ZIP/folder output; and `.rdt` pack execution. Use `node cli.js --help` for all options. The `--config` switch is **not** wired into the supported CLI: use `--job pack.rdt` for reproducible jobs.

See [CLI usage](Guide/CLI.md), [scene files](Guide/Scene-files.md), and [the .rdt pack guide](Guide/RDT-pack-format.md).

## Included examples

- [Orbit Studio](samples/orbit.scene), [pack manifest](samples/orbit.rdt), and [animation](samples/orbit/orbit-formula.phy)
- [Rocket to Rainbow Planet](samples/rocket-to-rainbow-planet.scene) with OBJ assets
- [Aurora Orrery](samples/aurora-orrery.scene) and its orbital-ring OBJ meshes
- [Beetle Psychedelia](samples/vw-beetle-psychedelia.scene), [Prism Garden](samples/prism-garden.scene), [Cosmic Orbs](samples/cosmic-orbs.scene), [Neon City](samples/neon-city.scene), and [Reflection Studio](samples/reflection-studio.scene)
- [Lee Perry-Smith scanned head](samples/lee-perry-smith-head.scene): geometry preview without the original photographic skin image

See [sample scenes](Guide/Sample-scenes.md) for links and asset guidance.

## Architecture

| Layer | Primary modules |
| --- | --- |
| CLI adapter | `cli.js`, `rtdt_image_io_node.js`, `rtdt_scene_assets_node.js` |
| Browser adapter | `webapp.html`, `rtdt_ui_browser_20261118.js`, `rtdt_image_io_browser.js` |
| Shared execution | `rtdt_job.js`, `rtdt_render_core.js`, `rtdt_animation_batch.js` |
| Shared scene and pack contracts | `rtdt_scene_format.js`, `rtdt_scene_browser.js`, `rtdt_pack.js`, `rtdt_scene_assets.js` |
| Shared animation/output | `rtdt_aetherore.js`, `rtdt_png.js`, `rtdt_ppm.js`, `rtdt_animation_export.js`, `rtdt_animation_destination.js` |
| Shared shading and geometry | `rtdt_math.js`, `rtdt_world.js`, `rtdt_shade.js`, `raytracer-core.js`, etc. |

Both frontends now use shared still-render sessions and shared animation batch orchestration. **Not every feature is byte-identical across platforms:** JPEG uses different encoders, some browser interactions have no direct CLI command, and runtime-specific asset/authentication adapters remain. The renderer still uses global scene state rather than independent parallel renderer instances. See [architecture](Guide/Architecture.md).

## Testing and benchmarking

~~~sh
npm test                       # Node regression suite, including benchmark smoke test
npm run test:animation:full    # Full 192-frame Orbit Studio ZIP regression
npm run test:browser           # Optional Playwright/Chromium integration
npm run benchmark:quick        # Small end-to-end benchmark pass
npm run benchmark              # Default warmups and repeated runs
node rtdt_benchmark_node.js --list
~~~

Benchmark profiles live in [benchmarks/profiles.json](benchmarks/profiles.json). Results are JSON and CSV under `benchmarks/results/`. These measure **end-to-end CLI job time**, including process startup, scene loading and output encoding; they are not isolated ray/s throughput or independent cross-renderer performance rankings. See [benchmark guide](Guide/Benchmarking.md).

## Present limitations

The current lighting model is a point light, not sampled area or spherical lighting. Normal/bump maps and full physically based path tracing are not implemented. The head-scan's photographic texture is not bundled. Live cloud-provider authorisation and OS credential stores are not certified by mock tests. `rtdt_scene_loader.js` is an additional experimental scene-loader implementation; the supported scene/pack paths use the shared declarative loaders. Treat performance comparisons across engines as workload-specific.

Read the [guide index](Guide/Index.md) for current documentation.
