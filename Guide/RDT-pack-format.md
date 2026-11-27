# RtDt `.rdt` pack files — user guide

A **`.rdt` file is the top-level manifest** for a reproducible RtDt rendering job. It tells
RtDt which scene, AetherOre animation and supporting assets belong together, how
to render them, and where the output should go.

**This is a manifest, not a replacement for `.scene` or `.phy`.** Those files keep
their existing formats and are processed by their existing parsers.

> Current specification: **RtDt Pack v1**, strict UTF-8 JSON. The `.rdt`
> extension is mandatory for pack manifests. JavaScript object literals,
> comments, trailing commas,
> environment variables and executable expressions are not allowed.

## Quick start: create your first pack

Create this folder structure:

```text
my-orbit/
  my-orbit.rdt
  orbit.scene
  orbit/
    orbit-formula.phy
    rocket.obj           (only if your scene needs it)
    rocket-texture.png   (only if your scene needs it)
```

Save the following as `my-orbit.rdt`:

```json
{
  "version": 1,
  "name": "My orbit animation",
  "scene": "orbit.scene",
  "phy": "orbit/orbit-formula.phy",
  "render": {
    "width": 160,
    "height": 90,
    "quality": 1,
    "fps": 24,
    "frames": {
      "start": 0,
      "end": 191
    }
  },
  "output": {
    "destination": "zip",
    "path": "orbit-animation.zip",
    "format": "png"
  }
}
```

Use the [repository sample](../samples/orbit.rdt) as a ready-made template.
Its referenced scene and animation already exist.

At 24 frames per second, frames 0–191 produce **192 frames / 8 seconds**.
The frame range is **inclusive**. Each frame is written as
`frame-0000.png`, `frame-0001.png`, and so on, accompanied by
`manifest.json` with frame metadata.

## Grammar — version 1

RtDt Pack v1 is a **JSON object** with these exact top-level keys:

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `version` | integer | Yes | Exactly `1` |
| `name` | string | No | Human-readable pack label (1–120 characters if supplied) |
| `scene` | relative path | Yes | `.scene`, `.scene.yaml` or `.scene.yml` |
| `phy` | relative path | No | Optional AetherOre `.phy` file |
| `assets` | array | No | Additional dependencies, up to 200 entries |
| `registries` | array | No | Explicit pack-relative asset directories, searched in order |
| `defaultRegistries` | array | No | Fallback pack-relative asset directories, searched after `registries` |
| `render` | object | No | Resolution, quality, FPS and optional frame range |
| `output` | object | No | Image format and file/folder/cloud destination |

Unknown fields and unsupported version numbers are rejected, rather than
silently ignored.

### Asset entries

```json
"assets": [
  {"kind": "mesh", "path": "orbit/rocket.obj", "required": true},
  {"kind": "texture", "path": "orbit/rocket-texture.png"},
  {"kind": "animation", "path": "orbit/alternate.phy", "required": false}
]
```

`kind` is `mesh`, `texture` or `animation`. `required` defaults to
`true`. Accepted formats are OBJ for meshes, PNG/JPEG/BMP/PPM for textures
and `.phy` for animation.

Assets already declared in the `.scene` file do not need to be duplicated
in the `.rdt` manifest. They remain **relative to their containing scene
file**. Pack-level assets are relative to the `.rdt` file itself.

### Default asset registries

Optionally declare directories containing shared scenes, meshes, textures or
animations. These are **relative to the directory containing the .rdt file**.

```json
{
  "version": 1,
  "scene": "studio.scene",
  "registries": ["assets", "shared/materials"],
  "render": {"width": 800, "height": 450},
  "output": {"destination": "file", "path": "render.png"}
}
```

RtDt first tries a reference in its ordinary location (scene-relative for
scene dependencies, pack-relative for pack dependencies). If the file is
missing, it searches each configured registry directory in the declared order.
For example, `studio.scene` can refer to `rocket.obj`; the loader tries
`rocket.obj` beside the scene, then `assets/rocket.obj`, then
`shared/materials/rocket.obj`. Duplicate basenames in different folders are
not a problem when a path resolves exactly.

`registries` is an array of at most 16 unique directory names.
Directories must be relative, use forward slashes, and must not contain
`..`, absolute paths or URLs. Absent `registries` means no fallback.
A registry is a path-search configuration, **not** an executable plugin list.
Only referenced files are read; registry directories are not recursively
loaded or executed. Node uses the same fallback search during CLI execution
and pack linting.

In the WebApp, selecting a local folder automatically indexes its files,
retaining in-memory `File` references and relative names. Selecting a
folder does not upload its contents. Hosted packs search the same directory
paths on their static host; those files must actually be deployed there.

### Default asset registries

A pack can define directories searched when a referenced scene, mesh, texture or animation is not found at its normal relative location:

```json
{
  "version": 1,
  "scene": "orbit.scene",
  "registries": ["project-assets"],
  "defaultRegistries": ["assets/shared", "assets/bundled"],
  "output": {"destination": "file", "path": "orbit.png", "format": "png"}
}
```

Resolution checks the original scene-relative (or pack-relative) reference first, then the roots in `registries` in order, then the roots in `defaultRegistries` in order. The first existing file is used. Duplicate roots across the two arrays are searched only once. All registry roots must be safe relative directories **inside the selected pack folder**; absolute paths, `..` traversal and URL roots are not accepted. The browser can only use files explicitly provided by the folder selector or hosted with the pack. There is no implicit access to arbitrary local folders or remote sites.

`defaultRegistries` is optional, so existing .rdt packs keep their previous behaviour. This is a fallback search facility, not a mechanism for replacing asset declarations in `.scene` files.

### Render block

```json
"render": {
  "width": 800,
  "height": 450,
  "quality": 2,
  "fps": 24,
  "frames": {"start": 0, "end": 191}
}
```

- `width`, `height`: positive integers, up to 4096 each, and up to
  4 million pixels total; defaults 500 × 281.
- `quality`: renderer recursion/quality depth, integer 1–20; default 1.
- `fps`: positive number not exceeding 240; optional. When absent, the
  animation timeline supplies the frame rate.
- `frames`: both `start` and `end` are required when the block is used;
  nonnegative integers, **inclusive**, up to 100,000 frames per job.
- Omit `frames` to produce a **single image**. Include it for a batch
  animation; the job should reference a `.phy` file either directly or
  through the scene's animation assets.

### Output block

For an animation:

```json
"output": {
  "destination": "zip",
  "path": "renders/my-orbit.zip",
  "format": "png"
}
```

| Destination | Path denotes | Login |
| --- | --- | --- |
| `file` | Single output file, e.g. `render.png` | No |
| `zip` | ZIP archive holding numbered PNGs and manifest | No |
| `folder` | Folder to receive numbered files | No |
| `google-drive` | Folder under the account's Drive | Yes |
| `dropbox` | Folder in the account's Dropbox | Yes |
| `onedrive` | Folder in the account's OneDrive | Yes |

A single-image job uses `destination: "file"`, with
`format: "png"`, `"jpg"`, `"jpeg"`, `"bmp"` or `"ppm"`.
The filename extension must match the image format.

Batch jobs use `zip`, `folder` or one of the cloud destinations, and
currently require `format: "png"` to guarantee identical image encoding
between the Node CLI and WebApp. A destination never changes the image
bytes produced by the shared renderer.

## Paths and portability

Every `.rdt` input path is **relative to the directory containing that
manifest**, not the current terminal directory or the website root.

- Use forward slashes: `models/car.obj`, `textures/paint.png`.
- Keep all input references inside the pack directory.
- Do not use `../`, absolute paths, Windows drive letters or URL schemes.
- Hosted packs work when their files are served together at the same website
  origin. The browser must be able to fetch them.
- For local files, the browser needs the user to select or grant access to
  the pack's dependencies. Opening a manifest alone does not grant permission
  to read an arbitrary local folder.
- ZIP **render output** and a portable ZIP **input bundle** are different
  concepts: the manifest describes the latter's contents but is not itself
  a compressed archive.

`.scene` files can separately declare OBJ, textures and `.phy` entries.
Those paths resolve against the **scene's directory**, not the pack's
directory. A pack's own `assets` list is an inventory/preflight contract;
it does not implicitly insert a mesh or texture into a scene.

## File roles

| Extension | Role |
| --- | --- |
| `.rdt` | Pack manifest, references, render job and output |
| `.scene` / `.scene.yaml` | Scene geometry, materials, camera, lights and scene-local assets |
| `.phy` | AetherOre animation timeline and pose expressions |
| `.obj` | 3D mesh geometry |
| `.png` / `.jpg` / `.bmp` / `.ppm` | Texture/images |
| `.zip` | Archive for export or distribution |

## Validate before rendering

The **same v1 structural grammar** is implemented in
[`rtdt_pack.js`](../rtdt_pack.js) for both Node and browser runtimes.
A Node pack linter can additionally check that referenced files exist
and that the scene and animation documents are readable.

Run either of these commands from the repository root:

```sh
node cli.js --lint-pack samples/orbit.rdt
node rtdt_pack_lint_node.js samples/orbit.rdt
```

A successful preflight exits with code `0`; missing required files or
invalid syntax return a nonzero exit code. Optional files generate
warnings, and the report lists checked dependencies.

The linter validates pack structure and local dependency paths, **not**
the visual correctness of a finished raytrace or the availability of
a cloud account.

## Execute an .rdt job

The Node CLI validates a pack and its dependencies, then applies the
manifest's scene, optional animation, resolution, quality, frame range,
FPS and destination to the **existing shared rendering pipeline**:

```sh
node cli.js --job samples/orbit.rdt
```

The example writes `samples/orbit-animation.zip`. Output paths are
resolved relative to the `.rdt` manifest's directory, not the shell's
current directory. Single-image packs write the requested still-image
format; batch packs write numbered PNG frames and `manifest.json` to
a ZIP, local directory or an authenticated cloud directory.

The `--job` command does not accept additional rendering flags: edit
the manifest to change the settings, or use the ordinary CLI flags without
`--job`. Run `--lint-pack` to preflight a pack without generating images.

## Open an .rdt pack in the WebApp

In `webapp.html`, choose **Scene collection → RtDt pack (.rdt)**.
Choose either **Featured .rdt pack** (the included Orbit Studio example)
or **My local pack folder**. For a local pack, select the whole directory
containing the root `.rdt` manifest and all referenced dependencies.

The WebApp preflights the declared dependencies using the shared v1
manifest grammar, loads the scene through the existing scene loader, imports
the `.phy` pose and fills in resolution, quality, frame range, destination
and ZIP filename. For a batch, expand **Export animation frames** and
select **Export animation frames** to start the job. For a still image,
use the normal render and image-export controls.

Local folder selection uses the browser's directory input and does not
upload your files. A selected folder must contain exactly one root-level
`.rdt` file; missing required dependencies block loading. Files named by
`.scene` are resolved relative to that scene; explicit pack asset paths
are resolved relative to the `.rdt` file.

Cloud output destinations continue to require an explicit OAuth login.
For large exports, choose a folder or a cloud target rather than the
memory-limited browser ZIP writer.

## Security and advanced features

Pack files are **declarative JSON**, never JavaScript. They contain no
credentials. Google Drive, Dropbox and OneDrive use RtDt's separate
authentication adapters; never put access tokens, passwords or refresh
tokens in an `.rdt` file. A bad destination, missing required file,
unsupported version or invalid field should fail before expensive
rendering begins.

Version 1 intentionally describes **one render job per manifest**.
Multiple jobs, remote URL references and richer packaged archives can be
added in a future protocol version without changing the meaning of v1.

## Troubleshooting

- **Invalid .rdt JSON:** remove comments/trailing commas and quote all
  property names and string values.
- **Unsupported version:** use `"version": 1`.
- **Missing required dependency:** check filename, letter case and relative
  path starting from the correct manifest or scene directory.
- **Frames require batch output:** choose `zip`, `folder` or cloud.
- **Cloud login failure:** connect the account separately; the manifest
  never supplies authentication tokens.
- **Missing texture:** ensure the scene actually declares/uses that
  texture; listing it under `assets` alone will not assign it to a shape.

See [Scene files](Scene-files.md),
[CLI guide](CLI.md), and the
[cloud-credentials guide](Cloud-credentials.md).
