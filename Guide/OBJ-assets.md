# OBJ mesh resources

Standalone meshes are stored in [`obj/`](../obj), including pyramid, teapot, teddy and cat geometry. Scene-private OBJ assets typically reside in a matching folder under [`samples/`](../samples).

The declarative scene loader expects scene-relative paths, such as `rocket-to-rainbow-planet/rocket_hull.obj` from `samples/rocket-to-rainbow-planet.scene`. Meshes support triangulation, `vt` UV coordinates and `vn` smooth normals. High-poly scenes can benefit from BVH subdivision. Normal/bump maps are not implemented.

See [Scene files](Scene-files.md) and [pack creation](Scene-pack-creation.md).
