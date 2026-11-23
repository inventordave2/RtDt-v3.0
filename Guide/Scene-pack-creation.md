# Create and publish a RtDt scene pack

A reusable pack consists of a `.scene` document, its scene-relative dependencies and, optionally, a top-level `.rdt` manifest describing a rendering job.

## Layout

~~~text
samples/
  portrait.rdt
  portrait.scene
  portrait/
    head.obj
    skin.jpg
    motion.phy
    LICENSE.txt
  shared/
    reusable.obj
~~~

For `samples/portrait.scene`, write `portrait/head.obj` and `portrait/skin.jpg` in scene asset references. Do not prepend `samples/` or use `../`. The `.rdt` file references `portrait.scene`, optional `portrait/motion.phy`, additional assets and output settings, with paths relative to its own directory.

## Example scene

~~~json
{
  "version": 1,
  "name": "Portrait studio",
  "camera": {
    "from": [0, 1.5, -6],
    "to": [0, 0.5, 0],
    "up": [0, 1, 0],
    "fov": 45
  },
  "light": {"position": [-5, 8, -7], "intensity": [1, 1, 1]},
  "objects": [
    {
      "type": "mesh",
      "name": "Head",
      "mesh": "portrait/head.obj",
      "texture": "portrait/skin.jpg",
      "material": {"ambient": 0.15, "diffuse": 0.8, "specular": 0.25}
    }
  ],
  "assets": {
    "mesh": [{"path": "portrait/head.obj", "required": true}],
    "texture": [{"path": "portrait/skin.jpg", "required": true}]
  }
}
~~~

If the OBJ has `vt` UVs, they can be used for texture colour mapping; `vn` enables smooth normals. Include proper licence and attribution information for any third-party asset.

## Example job

~~~json
{
  "version": 1,
  "name": "Portrait preview",
  "scene": "portrait.scene",
  "render": {"width": 160, "height": 90, "quality": 1},
  "output": {"destination": "file", "path": "portrait.png", "format": "png"}
}
~~~

Save as `portrait.rdt`. Full grammar and constraints are in [RDT-pack-format.md](RDT-pack-format.md).

## Verify and publish

~~~sh
node cli.js --lint-pack samples/portrait.rdt
node cli.js --job samples/portrait.rdt
npm test
~~~

Serve the repository over HTTP and open `webapp.html`; select **RtDt pack (.rdt)** and either a hosted pack or a local folder. To list a new hosted scene in the WebApp, add its entry to the `sceneRepoSelect` list in `webapp.html`, with a valid `data-scene-path`.

A public GitHub repository is **not** private user storage. Do not commit tokens, private scans or assets without redistribution rights.

See [scene files](Scene-files.md) and [asset guidance](User-assets.md).
