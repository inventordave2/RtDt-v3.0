# RtDt native performance benchmark suite

RtDt bundles deterministic reference workloads in [`benchmarks/profiles.json`](../benchmarks/profiles.json) and a Node harness in [`rtdt_benchmark_node.js`](../rtdt_benchmark_node.js). The suite runs **real `.rdt` rendering jobs through the supported CLI**, checking output checksums and recording wall-clock measurements.

## Commands

~~~sh
npm install
node rtdt_benchmark_node.js --list
npm run benchmark:quick
npm run benchmark
node rtdt_benchmark_node.js --profile primitives --iterations 5 --warmups 1
node rtdt_benchmark_node.js --profile animation --output-dir benchmarks/results
npm run test:benchmark
~~~

The harness supports `--profile ID|all`, `--iterations 1..30`, `--warmups 0..10`, `--output-dir DIR`, `--list` and `--help`. The default is five measured runs after one warm-up per selected workload.

## Bundled workloads

| ID | Workload |
| --- | --- |
| `primitives` | Orbit Studio primitives and point-light shading |
| `reflections` | Prism Garden reflections and recursive material shading |
| `complex-scene` | Neon City multiple object intersections |
| `animation` | Four AetherOre frames exported to PNG ZIP |

These are practical end-to-end workloads, **not** a ray-counted comparison against Blender, POV-Ray or another engine. The collection is intentionally small enough for development usage; it can be expanded with additional reproducible profiles.

## Results and interpretation

JSON and CSV reports are written to `benchmarks/results/` by default. Each report records the Node version, operating system/architecture, CPU model/core count, repository revision when available, sample timings, median, min/max, interquartile values, output size and SHA-256 checksum.

**Timing includes** a fresh Node process, `.rdt` parsing, scene load, render, encoding and output writing. `pixelsPerSecond` divides emitted output pixels by end-to-end median time. It is not **rays per second** because recursive shadow/reflection rays are not counted here. `framesPerSecond` is an end-to-end output metric for animation. Identical output hashes across measured runs are required.

For useful regressions, keep the same machine, Node version, render settings and minimal background workload; compare medians and dispersion. Hardware/algorithm differences make simple rankings against other renderers misleading unless scene and image-quality conditions are controlled.

## Testing and CI

`npm test` runs a lightweight benchmark smoke test through `tests/benchmark.test.js`. The [feature-verification workflow](../.github/workflows/verify-features.yml) runs the test suite on Node 20/22. Its **manual workflow dispatch** includes a full benchmark report job, uploading JSON and CSV as an artifact. Full timing runs are not performance pass/fail gates on shared CI hardware.

For architecture and job semantics, see [Architecture](Architecture.md), [CLI](CLI.md) and [RDT-pack-format.md](RDT-pack-format.md).
