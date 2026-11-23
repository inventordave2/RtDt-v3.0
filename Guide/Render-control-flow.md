# RtDt render and animation control flow

Both supported frontends invoke the **shared** `rtdt_job.js` executor and `rtdt_render_core.js` raytracing code.

~~~mermaid
flowchart TD
    A[Node CLI arguments or WebApp controls] --> B[Scene / pack loading and asset resolution]
    B --> C[RtDtState.scene]
    C --> D{Still or animation?}
    D -->|Still CLI| E[rtdt_job.render_still]
    D -->|Still WebApp| F[rtdt_job.create_session]
    F --> G[step 4 rows + draw to canvas]
    E --> H[rtdt_render_core.render_rows]
    G --> H
    D -->|Animation| I[rtdt_job.render_animation]
    I --> J[rtdt_animation_batch + AetherOre poses]
    J --> H
    H --> K[Shared raytracing / colour computation]
    K --> L[PNG / PPM / other image output]
    L --> M[Node filesystem or browser downloads / cloud sink]
~~~

## Still images

Node calls `render_still` synchronously. The WebApp owns **scheduling** and **display** only: it calls `create_session`, then `step(4)` from a timer, and draws completed scanlines. All pixel tracing is performed by `rtdt_render_core.render_rows`. A cancellation flag prevents further browser steps and cancels the shared session.

The scene's camera and render dimensions must match for equivalent results. Browser preview and CLI job rendering can be compared byte-for-byte for PNG.

## Animation

`rtdt_job.render_animation` drives shared pose application, still-frame rendering, PNG encoding and batch output. The CLI supplies local or cloud sinks. The WebApp supplies downloadable ZIP, folder or cloud sinks and updates progress. Interactive preview playback remains a browser UI workflow, but uses the common frame-time helper and shared still render sessions.

## Boundaries

The scene state is still global; it is not designed for multiple concurrent isolated jobs. Browser folder permissions, network fetches, OAuth and Node filesystem/OS keyring access must remain adapters. JPEG codecs are platform-specific; PNG and PPM are shared. See [architecture](Architecture.md) and [tests/benchmarks](Benchmarking.md).
