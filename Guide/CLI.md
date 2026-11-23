# RtDt Node.js CLI

From the repository root, install dependencies with `npm install`. The supported entrypoint is `cli.js` (also exposed as the npm `rtdt` bin). Use `node cli.js --help` for the authoritative option inventory.

## Single images

~~~sh
node cli.js --scene scene1 --width 160 --height 90 --output preview.png
node cli.js --scene-file samples/prism-garden.scene --width 160 --height 90 --output prism.jpg --jpeg-quality 90
node cli.js --scene-file samples/orbit-yaml.scene.yaml --output orbit.bmp
node cli.js --scene scene1 --output preview.ppm
node cli.js --scene scene1 --output c64.bmp --bmp-palette c64
node cli.js --scene scene1 --format png --output-dir renders
~~~

Output format is inferred from `--output` (PNG, JPEG, BMP, PPM) or selected with a matching `--format`. Indexed BMP palettes include `c64`, `ansi16`, `ansi256` and `html`. `--jpeg-quality` changes JPEG encoding; `--quality` controls renderer recursion depth. `--height` and `-H` both set height; `-h` shows help.

## Scene animation and batches

~~~sh
node cli.js --scene-file samples/orbit.scene --phy samples/orbit/orbit-formula.phy --frame 12 --width 160 --height 90 --output orbit-frame.png
node cli.js --scene-file samples/orbit.scene --phy samples/orbit/orbit-formula.phy --batch --start-frame 0 --end-frame 7 --width 160 --height 90 --destination zip --zip-file renders/orbit.zip
node cli.js --scene-file samples/orbit.scene --phy samples/orbit/orbit-formula.phy --batch --start-frame 0 --end-frame 7 --destination folder --output-dir renders/orbit
~~~

AetherOre uses `.phy` timeline data and applies a selected pose via `--frame` or `--time`. A batch produces numbered PNGs and `manifest.json`. The CLI can also upload to Google Drive, Dropbox or OneDrive, provided the provider is configured and authenticated. See [cloud credentials](Cloud-credentials.md).

## Reproducible .rdt packs

~~~sh
node cli.js --lint-pack samples/orbit.rdt
node cli.js --job samples/orbit.rdt
~~~

An `.rdt` file specifies its scene, optional animation, render settings and output destination. Paths resolve relative to the pack location. `--job` cannot be mixed with separate rendering switches; edit the manifest instead. See the [pack format guide](RDT-pack-format.md).

The standalone `rtdt_cli_config.js` parser does **not** make `--config` a supported CLI option. Use `--job` for configuration-driven rendering.

## Verification and benchmarks

~~~sh
npm test
npm run test:cli
npm run test:pack
npm run test:animation:full
npm run benchmark:quick
~~~

See [benchmark methods](Benchmarking.md) and [CLI internals](CLI-internals.md).
