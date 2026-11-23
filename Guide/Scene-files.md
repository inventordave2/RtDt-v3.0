# RtDt .scene files and dependencies

`.scene` is the declarative scene description loaded by both the root Node CLI and browser WebApp. The supported v1 contract is constructed by `rtdt_scene_format.js` and `rtdt_scene_browser.js`. JSON `.scene` files and the project's supported declarative `.scene.yaml` subset share this scene model.

An additional `rtdt_scene_loader.js` module contains experimental YAML/procedural features; do **not** assume all of its language features are supported by the CLI/WebApp declarative scene path.

## Minimal scene

Save this as `example.scene`:

~~~json
{
  "version": 1,
  "name": "Three objects",
  "camera": {
    "from": [0, 3, -12],
    "to": [0, 0, 0],
    "up": [0, 1, 0],
    "fov": 45
  },
  "light": {
    "position": [-8, 12, -8],
    "intensity": [1, 1, 1]
  },
  "background": [0.02, 0.03, 0.10],
  "objects": [
    {"type": "sphere", "name": "ball", "position": [-1.5, 0, 0], "color": [0.2, 0.6, 0.9]},
    {"type": "cube", "name": "box", "position": [1.5, 0, 0], "color": [0.9, 0.3, 0.1]},
    {"type": "plane", "name": "ground", "position": [0, -1.5, 0], "color": [0.6, 0.6, 0.6]}
  ]
}
~~~

The scene format supports camera position/target/up/FOV (FOV in degrees), a point light, the ray-miss background colour and an object array. Typical object types are `sphere`, `cube`, `plane` and `mesh`. Position, scale, colour and material fields control construction; material parameters include ambient/diffuse/specular, shininess, reflection, transparency and refractive index. Colours and light intensities are normalized RGB.

## Meshes, textures and animation

A scene may declare required or optional dependencies and refer to them from objects:

~~~json
{
  "version": 1,
  "camera": {"from": [0, 2, -8], "to": [0, 0, 0], "up": [0, 1, 0]},
  "objects": [
    {"type": "mesh", "name": "portrait", "mesh": "portrait/head.obj",
     "texture": "portrait/skin.jpg"}
  ],
  "assets": {
    "mesh": [{"path": "portrait/head.obj", "required": true}],
    "texture": [{"path": "portrait/skin.jpg", "required": true}],
    "animation": [{"path": "portrait/motion.phy", "required": false}]
  }
}
~~~

Scene asset paths are relative to **the scene file's directory**, not the repository root. For `samples/portrait.scene`, `portrait/head.obj` refers to `samples/portrait/head.obj`. Parent-directory traversal and arbitrary remote URL references are not valid scene asset paths. The OBJ loader supports polygons/triangles, `vt` UV coordinates and `vn` smooth normals; the UV colour map is sampled during raytracing. Missing required dependencies prevent a successful load/render. Asset declarations are not a replacement for an object's explicit material/mesh reference.

For local browser scenes, select the `.scene` file and any associated dependencies. For local `.rdt` packs, select the **entire containing folder** so the browser receives access to all referenced files. Hosted samples are fetched under the same site.

## Animation

AetherOre `.phy` v1 documents contain a timeline (FPS/duration) and motion tracks for scene objects by ID/index. The shared engine applies poses at selected times, and the shared job batch pipeline produces frame PNGs plus `manifest.json`. Use a top-level [`.rdt` manifest](RDT-pack-format.md) to package `.scene`, `.phy`, output settings and additional assets.

## Run and validate

~~~sh
node cli.js --scene-file samples/orbit.scene --output orbit.png
node cli.js --scene-file samples/orbit-yaml.scene.yaml --output orbit-yaml.png
node cli.js --lint-pack samples/orbit.rdt
node cli.js --job samples/orbit.rdt
npm run test:scene-assets
npm run test:cli
~~~

See [pack creation](Scene-pack-creation.md), [sample scenes](Sample-scenes.md), and the [execution architecture](Architecture.md).

## Limits

Supported lighting is a point light; sampled soft area/sphere lights and normal/bump-map shading are not implemented. The provided Lee Perry-Smith sample is a geometry preview without the original photographic texture. This format is not a general-purpose executable script or full DCC/glTF interchange standard.
