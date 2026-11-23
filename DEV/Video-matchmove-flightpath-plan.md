# RtDt video match-move and reusable flightpath implementation plan

**Status:** proposed feature set for review; no match-move, video decoder or optional CV package is installed by this plan.  
**Location:** `DEV/` contains implementation plans; `Guide/` contains current user-facing functionality.  
**Related:** [WebGPU pipeline](WebGPU-pipeline-plan.md).

## Goal and architecture

Produce a **dimensionless, reusable camera/vehicle flightpath from video**, reusing the shared `rtdt_flightpath.js` data model and `rtdt_aetherore.js` animation evaluator. Mandelbrot, imported keyframes and video match-moving are different **providers of trajectories**, not alternative flightpath engines.

```text
Video / image sequence              Mandelbrot orbit             Manual curves
         |                                  |                           |
Optional video decoder                rtdt_mandelbrot.js            Keyframe input
         |                                  |                           |
Optional feature detector/matcher     [x,y] samples                 3D samples
         |
Optional geometric VO/SfM estimator
         |
Raw camera poses + timestamps + confidence + diagnostics
         |                                  |                           |
         +-----------------------+----------+---------------------------+
                                 |
                         rtdt_flightpath.js
                 validate / normalize / resample
               smooth / orientation / time / transforms
                                 |
                         AetherOre .phy tracks
                                 |
                           rtdt_job.js
                      CLI and thin browser UI
```

No computer-vision implementation should depend on DOM or require a Node native module in the common `rtdt_flightpath.js` or core raytracer. **A dependency must not be installed by default simply to render scenes.**

## Current state and precise gaps

- `rtdt_flightpath.create(points,options)` already accepts finite 3D samples with FPS, cycles, scale, entropy and AetherOre expansion expressions. `sample_at`, `to_keyframes` and `to_phy` are implemented. It presently treats paths as cyclic, samples position only, and has **no normalization**, smoothing, orientation, timestamps per source sample or confidence.
- `rtdt_mandelbrot.flight_source` produces orbit-derived sample geometry; its procedural surface/texture generator is a separate use of the same fractal calculations.
- `rtdt_aetherore` supports position, rotation, scale and shear channels, with evaluated formulas and keyframes. A flightpath importer must preserve compatibility with that v1 document model.
- There is currently **no video ingestion, optical flow, camera-pose recovery, VO drift correction, camera animation binding, or command-line match-move feature** in the verified implementation.
- **Monocular scale is unobservable in absolute units.** Global normalization suffices for dimensionless path reuse but does **not** automatically repair relative scale drift, weak geometry or false camera motion estimates.
- The current flightpath periodic closure should **not** be imposed on ordinary video paths; open and closed modes must be explicit.

## Proposed public data contract (not implemented)

A normalized flightpath is **geometry-first**, independent of the source algorithm:

```js
{
  version: 1,
  coordinateSystem: "rtdt-y-up",
  closed: false,
  geometry: {
    points: [[0, 0, 0], [0.1, 0, 0.2], [0.4, 0.1, 0.3]],
    units: "normalized",
    normalizer: "centroid-max-radius"
  },
  samples: [
    {time: 0, position: [0,0,0], rotation: [0,0,0,1], confidence: 0.93}
  ],
  metadata: {
    source: "video",
    trackingModel: "monocular",
    scaleObservable: false,
    warnings: []
  }
}
```

- **Position** is dimensionless normalized geometry; `rotation` is a quaternion (order `[x,y,z,w]`), independent of scale. Store sample timestamp, tracking confidence and tracking diagnostics, not just FPS.
- Transform is separate: `scale`, `origin`, `orientation`, AetherOre `expansion`. The raw and normalized path can be retained for traceability without embedding real-world distances.
- Normalize using `(p - centroid) / maxRadius` (centroid of finite points). For degenerate stationary trajectories, return all-zero positions with an explicit stationary indicator, rather than divide by zero. Rotations and timestamps are unchanged by normalization.
- A monotonic **arc-length** parameter is optional and changes traversal timing, not geometry. Preserve source timestamps by default.
- Ordinary video is `closed:false`; `closed:true` is an explicit geometric constraint. Cyclical Mandelbrot paths and their expansion envelopes are a separate opt-in.
- Invalid/low-confidence frames should be represented as gaps with flags, **not silently fabricated high-confidence poses**.
- Define handedness, camera forward axis, intrinsics, lens distortion and camera/world transformation conventions in tests.

## Core feature boundaries for approval

| Capability | Core (always available) | Optional provider |
| --- | --- | --- |
| Accept explicit 3D flightpaths and poses | Yes | — |
| Normalize, transform and resample paths | Yes | — |
| Open/closed curves, phase, spline and arc-length pacing | Yes | — |
| Attach timestamps, rotations, confidence and diagnostics | Yes | — |
| AetherOre import/export and `.rdt` playback | Yes | — |
| Mandelbrot orbit sample generation | Existing shared helper | — |
| Read MP4/MOV and decode frames | Interface only | Video decoder |
| Track video features (ORB/LK) | Interface only | CV provider |
| Estimate monocular camera 6DoF poses | Interface only | VO/SfM provider |
| Scale-drift, loop closure and robust bundle adjustment | Diagnostics/extension hooks | Advanced provider |
| Camera lens calibration/intrinsics | Generic contract | Calibration/provider |
| WebApp video processing | Feature detection + supported adapter | Browser-compatible WASM/JS adapter |

**V1 feature decision proposed:** support camera-motion extraction from a **stationary scene with a moving camera**, not object tracking in a moving scene. Output is an **open normalized 6DoF path** where orientation is available; annotate missing scale and confidence. No claim of metric distance, guaranteed successful extraction, rolling-shutter compensation or physically correct entropy inference.

## Optional npm dependency architecture and licence gates

RtDt Community is MIT. Compatible third-party **wrappers** can be offered as user-installed optional capabilities, but binary transitive dependencies and codecs require a separate review. Do not convert the root package's normal `npm install` into a computer-vision toolchain.

Candidate packages (verify package version, transitive dependencies, supplied native binaries and redistribution rights **before release**):

| Candidate | Reported upstream licence | Plausible role | Integration gate |
| --- | --- | --- | --- |
| [jsfeat](https://github.com/inspirit/jsfeat) | MIT | JS FAST/ORB-like feature processing and Lucas–Kanade optical flow | Confirm current APIs, maintenance, tests and cross-platform performance; feature tracking alone is **not** 6DoF camera recovery |
| [@opencvjs/node](https://www.npmjs.com/package/@opencvjs/node) | Apache-2.0 | Node-hosted OpenCV.js/WASM feature detection and epipolar geometry | Confirm functions (especially `findEssentialMat`/`recoverPose`) exported by chosen build, Node version compatibility and WASM asset licensing |
| [@u4/opencv4nodejs](https://www.npmjs.com/package/@u4/opencv4nodejs) | Licence review required per installed version | Optional native OpenCV bindings, if reliably buildable | Native OpenCV installation/build may be heavy; inspect bindings and C++/OpenCV binary licences |
| [sharp](https://www.npmjs.com/package/sharp) | Apache-2.0 | Decode/resize extracted images | Current versions may require Node 20.9+; check libvips and optional binary notices |
| [FFmpeg](https://ffmpeg.org/legal.html) via user-supplied executable | Build-dependent LGPL/GPL | Decode MP4/MOV frames to images | **Do not equate an npm wrapper licence with codec/binary redistribution rights**; user-supplied executable is safer initially |

Prefer a **separate optional adapter package or installation target**, with explicit provider selection, version pinning and a `capabilities` check. No unconditional `require('opencv...')` in `cli.js`, `rtdt_job.js` or browser scripts.

Proposed future CLI design (commands below are **not implemented**):

```sh
node cli.js capabilities
node cli.js matchmove --input footage.mp4 --output trajectory.flightpath.json \
    --provider opencv --normalize --sample-fps 12
node cli.js flightpath export-phy trajectory.flightpath.json --target camera
```

The default CLI and WebApp continue to render without packages for video analysis. If an optional provider is not available, return a precise install/capability message, never silently pretend a 6DoF path was recovered.

## Implementation stages

### 1. Extract a general versioned flightpath model

- Preserve the existing `create`, `sample_at`, `to_keyframes`, `to_phy` API or wrap it with compatibility functions.
- Add non-cyclic paths, normalization, independent transforms, timestamps and confidence.
- Store orientation as quaternion, document camera forward conventions and deterministic serialization.

**Exit:** old Mandelbrot and AetherOre test results remain valid; new unit tests cover normalization, stationary trajectories, open paths and 6DoF.

### 2. Define an extensible source/provider protocol

- `rtdt_matchmove_provider.js` (proposed) accepts decoded grayscale frame samples and camera intrinsics, returns relative/absolute poses, quality scores and failure annotations.
- Keep frame acquisition independent of tracking; feature-detect optional packages lazily.
- Provide small fake-data providers for CI and failure-injection tests.

**Exit:** complete pipeline exercisable with synthetic pose data and no optional packages installed.

### 3. Add optional video frame decoding

- Prefer image sequences and a user-provided FFmpeg executable first; only add an installer for codec binaries after licence/legal review.
- Bound video duration/frame count, image size, memory usage and file access.
- Extract timestamps and orientation metadata; ignore audio.

**Exit:** video and image-sequence ingestion produce equivalent timestamped frames on supported systems.

### 4. Add optical-flow and feature-matching adapters

- Trial pure JS `jsfeat` for a lightweight path, or OpenCV bindings where a complete supported algorithm is available.
- Detect inlier quality, parallax, tracking loss and dynamic foreground; do not treat optical flow magnitude as camera translation.
- Expose provider availability and diagnostics to CLI.

**Exit:** repeatable synthetic and real clips produce tracked correspondences with quality metrics.

### 5. Solve and normalize camera poses

- Use calibrated essential-matrix geometry and robust inlier estimation for monocular rotation/translation direction. Handle insufficient parallax and degeneracies.
- Accumulate relative transforms with a consistent coordinate convention; detect relative scale drift and offer optional correction when evidence exists.
- Normalize **after** pose recovery; normalization cannot recover lost relative depth scale.
- Preserve orientation/time/confidence; offer smoothing, interpolation and optional arc-length traversal as independent transformations.

**Exit:** known synthetic camera paths match within angular and normalized-shape tolerances; low-information clips fail honestly.

### 6. Integrate AetherOre, CLI and WebApp adapters

- Convert normalized paths to AetherOre `.phy` position and rotation tracks using shared converters. The existing `create_animator` currently binds scene shapes; camera-target bindings and a safe camera transform lifecycle must be added and tested separately.
- Add CLI entrypoint and optional browser adapter only when an appropriate browser JS/WASM provider is present.
- Keep all scene loading, job execution, frame export and format writing shared.

**Exit:** import path → `.phy` → CLI/WebApp scene render produces equivalent poses and output frames.

### 7. Benchmark, quality gate, distribution

- Add synthetic and small licensed sample clips to test profiles or download-on-demand test fixtures with checksums.
- Report tracking accuracy, scale-drift warnings, pose orientation error, frame coverage, CPU/time/memory, and failure reasons.
- Test optional provider absent/present; CI must not require native CV dependencies or real camera footage for ordinary render tests.
- Record exact dependency versions, their licence trees, OpenCV build notices and any FFmpeg binary's legal configuration. Keep GPL/LGPL components outside the MIT core unless distribution requirements are met.

**Exit:** reproducible path/pose quality tests, clean install behaviour, optional capability discovery and clear user-facing diagnostics.

## Unresolved product decisions

1. **First release input:** image sequence only, or MP4/MOV via external FFmpeg as well?
2. **Minimum output:** position-only trajectory where possible, or always require reliable full 6DoF position+orientation?
3. **Provider strategy:** lightweight JS tracking first, or OpenCV-backed 6DoF first with JS as an optional preview?
4. **Browser:** full video match-moving in the browser, or import paths and preview initially?
5. **Normalization:** default centroid/max-radius to unit ball, preserving timestamps and rotation? The plan assumes yes.
6. **Licensing:** MIT core with selectively optional Apache-2.0/MIT npm adapters and an externally installed FFmpeg executable? The plan assumes yes.

No candidate package is approved or automatically installed until these choices and the licence/dependency review are completed.
