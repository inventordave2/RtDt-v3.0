# RtDt architecture

RtDt uses **one JavaScript raytracing core and shared job API** in Node.js and the browser. Platform adapters acquire inputs, display progress, and save files.

~~~text
Node CLI (cli.js)                 WebApp (webapp.html + browser UI)
          |                                   |
          +---------------+-------------------+
                          |
                   rtdt_job.js
            render_still / create_session
                render_animation
                          |
             rtdt_render_core.js
             camera / raytracing core
                          |
           rtdt_animation_batch.js
           AetherOre and image encoders
                          |
               Node/browser output sinks
~~~

## Implemented responsibilities

| Concern | Shared module | Node adapter | Browser adapter |
| --- | --- | --- | --- |
| Declarative scenes | `rtdt_scene_format.js`, `rtdt_scene_browser.js` | `rtdt_scene_assets_node.js` | `rtdt_scene_assets.js` + File API/fetch |
| `.rdt` grammar | `rtdt_pack.js` | `rtdt_pack_lint_node.js` | `rtdt_pack_browser.js` |
| Raytracing and world | `rtdt_render_core.js` and geometry/shading modules | `cli.js` | `rtdt_ui_browser_20261118.js` |
| Still execution | `rtdt_job.render_still`, `create_session` | synchronous job | chunked UI session |
| Animation | `rtdt_job.render_animation`, `rtdt_animation_batch.js`, `rtdt_aetherore.js` | ZIP/folder/cloud adapters | ZIP/folder/cloud adapters |
| PNG/PPM | `rtdt_png.js`, `rtdt_ppm.js` | file writes | browser downloads |
| Other still formats | colour/BMP helpers; separate JPEG codecs | `rtdt_image_io_node.js` | `rtdt_image_io_browser.js` |
| Cloud upload | `rtdt_cloud_storage.js` | Node auth/storage | browser OAuth/storage |

Node loads the shared JavaScript modules using an ordered bootstrap in `cli.js`; the WebApp uses ordered script tags in `webapp.html`. Both operate on `RtDtState.scene`, a process-global active scene, so the design **does not yet provide independent parallel renderer instances**. Browser UI controls and live playback orchestration are still browser-specific.

## Shared execution

`rtdt_job.create_session({sceneState,width,height,quality})` returns a cancellable render session. `step(rowCount)` traces rows using `rtdt_render_core.render_rows` and can update the browser canvas between calls. `render_still(...)` finishes the same session synchronously in Node.

`rtdt_job.render_animation(...)` applies AetherOre poses, renders frames with the shared still executor, and sends encoded frames plus a manifest through the shared animation batch API. Destination adapters supply the output sink. The shared PNG and PPM encoders yield identical bytes for identical pixels; JPEG remains provider-specific.

For the user-facing job contract, see [.rdt manifests](RDT-pack-format.md). For entry and scheduling details, see [render control flow](Render-control-flow.md).

## Scene and asset isolation

Pack references are relative to the `.rdt` directory; scene-local assets are relative to the `.scene` directory. File permissions and acquisition differ in Node and browsers. The Node preflight checks local dependencies, while browser loader preflight uses fetch or user-selected folders. Both apply the same versioned pack grammar; full validation-adapter consolidation remains possible future work.

## Verified scope and limitations

The CI suite covers Node 20/22, CLI job execution, PNG parity, AetherOre batches and headless Chromium WebApp pack loading. Real cloud OAuth/provider uploads and native OS credential stores require external testing. Feature parity is not equivalent to identical UI controls. Sampled area/spherical lights, bump/normal-map shading and fully independent renderer instances are not implemented.

See [CLI guide](CLI.md), [scene files](Scene-files.md), [benchmarking](Benchmarking.md) and [coding conventions](Coding-style.md).
