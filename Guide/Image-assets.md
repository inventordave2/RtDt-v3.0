# Image and texture resources

Bundled standalone images are in [`img/`](../img), including the Earth JPEG/PPM samples and README illustration. Scene-private textures should sit beside their scene in a directory under [`samples/`](../samples); use scene-relative references such as `portrait/skin.jpg`. Shared sample assets may live in `samples/shared/`.

The declarative scene loader accepts PNG/JPEG/BMP/PPM textures through its image adapters. A texture must be assigned to the relevant scene object; mentioning a texture in an `.rdt` inventory alone does not apply it. Third-party files retain their own licences.

See [Scene files](Scene-files.md), [scene pack creation](Scene-pack-creation.md) and [user assets](User-assets.md).
