# RtDt video match-move and reusable flightpath implementation plan

**Status:** camera-motion recovery selected for v1; implementation and provider/licence evaluation still pending. No match-move, video decoder or optional CV package is installed by this plan.  
**Location:** `DEV/` contains implementation plans; `Guide/` contains current user-facing functionality.  
**Related:** [WebGPU pipeline](WebGPU-pipeline-plan.md).

## Goal and architecture

Produce a **dimensionless, reusable camera flightpath from video**, reusing the shared `rtdt_flightpath.js` data model and `rtdt_aetherore.js` animation evaluator. Mandelbrot, imported keyframes and video match-moving are different **providers of trajectories**, not alternative flightpath engines.

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

**V1 feature decision confirmed:** support **camera-motion recovery only** for a mostly static scene filmed with a moving camera. Tracking individual independently moving objects is out of scope; moving foreground objects are rejected as tracking outliers where possible. Output is an **open normalized 6DoF camera path** where orientation is recoverable; annotate missing scale, uncertainty and confidence. No claim of metric distance, guaranteed recovery, rolling-shutter compensation or physically correct entropy inference.

## Non-negotiable efficiency budget

RtDt prioritises small dependency and computational footprints. Implement the simplest reliable sparse visual-odometry pipeline before adding expensive reconstruction features.

- **Streaming, bounded memory:** read and discard video frames incrementally; keep the current/previous grayscale image plus a bounded keyframe window. Never buffer the entire video or build an unbounded image pyramid. Retain sparse 2D feature tracks and compact camera poses, not original frames.
- **Sparse tracking first:** begin with downscaled grayscale frames, a feature budget (proposed default 400–800 tracked features), a small multiscale Lucas–Kanade tracker and periodic replenishment. Use robust outlier rejection before essential-matrix recovery.
- **Adaptive sampling:** cap processed frame rate and image resolution (proposed initial defaults 10–15 fps and <= 960 px long edge), adjust keyframes for parallax/confidence, and skip redundant frames. Make caps user-configurable without compromising predictable limits.
- **Avoid unnecessary work:** reuse image buffers, typed arrays, detector state and calibration; keep algebra on the CPU and the core code independent of heavy native bindings. Do not calculate dense optical flow, photogrammetric meshes or global bundle adjustments for v1.
- **Algorithmic budget:** per frame, tracking and geometry should scale approximately with a fixed feature budget and RANSAC iteration cap, rather than with the length of the entire video history. Pose output storage is O(number of retained poses). Frame storage should be O(frame pixels × bounded frame window), independent of clip duration. Total execution necessarily grows with processed frame count.
- **Explicit resource caps:** bound feature count, frame dimensions, keyframes, RANSAC iterations, pose samples, temporary disk use and wall time; show the selected limits in diagnostics. Stop or degrade gracefully on insufficient parallax, poor inlier ratio or exhausted budgets.
- **Zero-cost default install:** standard rendering has no optional match-move dependency, no native build step, no video-codec package and no CV imports on the hot render path. Only load an explicitly selected provider when the user invokes match-moving.
- **Measure the budget:** benchmark peak resident memory, allocations, throughput and tracking quality against processed frames, feature counts and input resolutions. Reject an additional dependency unless it demonstrably improves accuracy or latency enough to justify its installed size and operational complexity.
- **Accuracy over false savings:** do not treat cheaper optical flow as 6DoF recovery, or normalization as scale-drift correction. Confidence checks and failure reporting are mandatory even in a minimal implementation.

Proposed numerical defaults are **starting targets for profiling**, not fixed limits or verified performance claims.

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
- Keep frame acquisition independent of tracking; feature-detect optional packages lazily. Enforce feature count, sampled-frame rate and bounded frame-window limits in the provider contract.
- Provide small fake-data providers for CI and failure-injection tests.

**Exit:** complete pipeline exercisable with synthetic pose data and no optional packages installed.

### 3. Add optional video frame decoding

- Prefer image sequences and a user-provided FFmpeg executable first; only add an installer for codec binaries after licence/legal review.
- Stream frames; bound sampled frame rate, input size, retained frame window, temporary disk use and file access. Never keep decoded footage in memory.
- Extract timestamps and orientation metadata; ignore audio.

**Exit:** video and image-sequence ingestion produce equivalent timestamped frames on supported systems.

### 4. Add optical-flow and feature-matching adapters

- Trial a sparse pure-JS feature tracker such as `jsfeat` first, but require essential-matrix and pose recovery from a verified provider. Use OpenCV bindings if the smaller tracking option cannot produce reliable camera poses.
- Detect inlier quality, parallax, tracking loss and dynamic foreground; do not treat optical flow magnitude as camera translation. Bound feature tracking and RANSAC iterations per processed frame.
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

- Add synthetic and small licensed sample clips to test profiles or download-on-demand test fixtures with checksums. Include stress tests proving memory remains bounded as clip length grows.
- Report tracking accuracy, scale-drift warnings, pose orientation error, frame coverage, CPU/time/memory, and failure reasons.
- Test optional provider absent/present; CI must not require native CV dependencies or real camera footage for ordinary render tests.
- Record exact dependency versions, their licence trees, OpenCV build notices and any FFmpeg binary's legal configuration. Keep GPL/LGPL components outside the MIT core unless distribution requirements are met.

**Exit:** reproducible path/pose quality tests, clean install behaviour, optional capability discovery and clear user-facing diagnostics.

## Confirmed decisions and remaining choices

**Confirmed:** v1 recovers **camera motion only**; independently moving object tracking is excluded. The common flightpath API owns normalized geometry, timing, orientation and transforms. Video processing is an optional Node capability. Memory/CPU efficiency and minimal install size are first-class acceptance criteria; no heavyweight default dependencies.

**Remaining product choices:** whether v1 accepts image sequences plus an external FFmpeg executable; whether unreliable position with reliable orientation should be exportable as rotation-only; the first proven 6DoF provider after benchmarks and licence audit; and whether the initial WebApp only imports/plays back a trajectory rather than processing video itself.

**Recommended baseline:** image sequences first, optional external FFmpeg for compressed video, and an optional CV provider chosen by accuracy/memory measurements rather than package popularity. Allow rotation-only results with clear capability flags; never disguise them as a recovered 3D camera translation. Keep browser-based video tracking out of v1.

No candidate package is approved or installed until provider capability, licence tree and resource budgets have been checked.
