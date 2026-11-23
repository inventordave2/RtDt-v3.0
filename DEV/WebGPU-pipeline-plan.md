# RtDt WebGPU integration — seven-stage development plan

**Status:** design approved for implementation sequencing; **WebGPU renderer not implemented**.  
**Current reference:** `rtdt_job.js` (shared executor) + `rtdt_render_core.js` (CPU) + existing Node/WebApp parity tests.  
**Documentation home:** development plans belong in `DEV/`; end-user instructions remain in `Guide/`.

## Non-negotiable invariants

- Preserve the CPU raytracer as the definitive correctness reference and fallback.
- Keep one scene/pack grammar, one AetherOre evaluator, one job orchestration API, one animation scheduler and shared output codecs. The browser and CLI stay adapters.
- Do not translate arbitrary JS by runtime evaluation or duplicate scene semantics inside shaders. GPU kernels **must** implement equivalent mathematical operations using WGSL and a documented scene data contract.
- Treat WebGPU as an optional backend. `auto` uses a GPU only when a complete scene feature set is supported; `cpu` always selects CPU; explicit `webgpu` reports unsupported features/device limitations without silent fallback.
- Device probing requires a secure context, `navigator.gpu`, successful `requestAdapter()` and `requestDevice()`, validated features/limits, and device-loss handling. Browser presence alone is insufficient.
- Keep deterministic output for CPU. Compare GPU numerical results with defined per-pixel tolerances, not unachievable bitwise identity.
- Follow RtDt coding standards: snake_case functions, PascalCase constructors only, camelCase variables, UPPER_SNAKE_CASE constants, `rtdt_snake_case.js` filenames, and a blank line immediately after every source line ending in `{`.

## 1. Backend selection and capability contract

**Modules:** `rtdt_render_backend.js`, `rtdt_render_cpu.js`; keep `rtdt_render_core.js` for CPU operations. Introduce async backend preparation/execution under `rtdt_job.js` without breaking the synchronous CLI path.

- Define a shared contract for `probe()`, `supports(sceneFeatures)`, `prepare(scene)`, `render_frame(job)`, `cancel()`, `dispose()`.
- Expose `auto | cpu | webgpu` in jobs and WebApp, default `auto` for WebApp, CPU in the Node CLI until a native GPU adapter exists.
- Probe feature support and device limits; handle rejection, lost devices, failed shader compilation, and cancellation.
- Selection/fallback must happen **before** output is published; no mixing partial GPU and CPU frames.

**Exit criteria:** existing CPU tests stay green; mocked feature-detection, refusal and fallback tests pass; GPU-only mode never incorrectly renders on CPU.

## 2. Common render-scene intermediate representation

**Modules:** `rtdt_scene_ir.js`, `rtdt_scene_gpu_buffers.js` (proposed).

- Convert existing loaded `RtDtState.scene` to immutable, versioned camera/light/geometry/material/texture/instance descriptors.
- Reuse existing OBJ parsing, triangulation, UV/normals, material attributes, object transforms, and BVH construction. Reuse typed arrays for host-side computation.
- Define explicit coordinate conventions, matrix layout, colour space, shadow-ray epsilon and numerical precision.
- Deduplicate textures/materials in GPU buffers; maintain coherent transforms under AetherOre animation.

**Exit criteria:** snapshot/roundtrip tests for primitive, textured-OBJ and animated instances; CPU IR validation agrees with the canonical scene; safe allocation limits.

## 3. Minimal WGSL backend

**Modules:** `rtdt_render_webgpu.js` and WGSL shader assets under `gpu/`.

- Start with pixel/camera primary rays, sphere/plane/cube intersections, flat materials and the existing point light.
- Implement compute output with bounded workgroups, buffer alignment, error reporting and loss handling.
- Preserve a common linear RGB pixel interface so existing PNG/PPM/BMP/ZIP outputs continue unchanged. Prefer CPU readback for saved frames; optional direct canvas for interactive preview only.

**Exit criteria:** primitive CPU/GPU images within stated tolerance; safe device-loss recovery; unchanged CLI rendering.

## 4. Feature-complete rendering parity

- Add triangle meshes, BVH traversal, shadows, specular/diffuse illumination, reflections/refraction, procedural and image UV colour maps.
- **Mandelbrot procedural material:** initially reuse `rtdt_mandelbrot.texture()` on CPU and upload its RGB data. Do **not** translate AetherOre expression parsing to WGSL. A dedicated GPU fractal kernel is a later optional optimisation.
- For each feature, maintain an explicit capability matrix; unsupported features force CPU in `auto` mode.

**Exit criteria:** established scene and pack corpus passes bounded RGB error/reference tests, including material and mesh cases.

## 5. Shared animation, exports and failure semantics

- AetherOre `.phy` remains the single source for transforms and timing, including generated cyclic Mandelbrot flight paths with expansion envelopes.
- Reuse `rtdt_job.render_animation`, `rtdt_animation_batch.js`, filenames, manifests, PNG/PPM codec and existing destinations, with async GPU frames supported under the shared job API.
- Upload only changed transforms; distinguish GPU compute vs readback time. Cancellation, device loss and fallback must leave valid artifacts only.

**Exit criteria:** CPU/GPU 192-frame reference manifests agree; no frame-order, FPS, or export-path differences; device-loss tests pass.

## 6. Real-world feature detection and WebApp integration

- Add `auto / cpu / webgpu` preference and transparent diagnostic status to the thin WebApp.
- Do not assume universal WebGPU support; test secure context, adapter/device acquisition, supported feature set and per-device limits. Handle lost devices and capability changes.
- Keep the CPU path available on every platform. Native Node WebGPU requires a **separate** optional adapter, not browser globals imported into Node.

**Exit criteria:** browser E2E tests for supported/unsupported/no-device/loss cases; feature detection never blocks CPU rendering.

## 7. Cross-backend benchmarks and release gate

- Extend `benchmarks/profiles.json` and the existing test commands rather than creating an unrelated benchmark format.
- Record backend, GPU feature support, device information (where permitted), scene hash, warmup count, image-error bounds, preparation, dispatch, readback, encoding and total wall time.
- Compare CPU/GPU using the same scene, frame range, resolution, quality parameters and source files; report median, dispersion and unsupported features.
- Protect CPU regressions in CI; GPU tests need a configured GPU runner with reliable drivers. Never represent emulated/software GPU CI as hardware performance evidence.

**Exit criteria:** documented per-feature parity, automatically selected fallback, benchmark reports and repeatable browser/Node tests before enabling WebGPU by default.

## Relevant platform references

- [MDN Navigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu)
- [MDN GPU.requestAdapter](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
- [MDN GPUDevice.lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)
- [W3C WebGPU living specification](https://www.w3.org/TR/webgpu/)

## Implementation checkpoint

The present change introduces **the reusable Mandelbrot procedural source and AetherOre path generator, not WebGPU hardware rendering**. This plan is the implementation checklist. Each stage needs passing tests and review before the next stage is declared complete.
