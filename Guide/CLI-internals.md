# RtDt Node CLI internals

The supported Node entrypoint is [root cli.js](../cli.js). The root CLI loads shared JavaScript modules in dependency order, including `rtdt_render_core.js`, `rtdt_job.js`, the pack grammar and AetherOre engine.

The CLI parses options or validates a `.rdt` job, loads a built-in or declarative scene, resolves local assets, applies a `.phy` pose if supplied, and calls `rtdt_job.render_still` or `rtdt_job.render_animation`. Still-image file writing is delegated to `rtdt_image_io_node.js`; ZIP/folder/cloud batch destinations use destination adapters.

The CLI is synchronous for still rendering. It does not own a separate pixel-tracing algorithm. Node-specific responsibilities include filesystem resolution, native image file writing and optional keyring/cloud authentication.

The renderer still operates on global `RtDtState.scene`; parallel independent jobs in one process need additional state-isolation work. JPEG encoding differs between Node and browser; PNG/PPM are shared.

See [CLI usage](CLI.md), [architecture](Architecture.md) and [render control flow](Render-control-flow.md).
