# User asset storage

A public repository cannot provide private account storage. If users commit assets to GitHub, those files and their content are public.

For uncommitted local projects, use the WebApp's **My computer** scene selection with associated files or select a complete **local pack folder** containing one root-level `.rdt` manifest. The browser cannot silently traverse arbitrary local directories.

When organising assets for publication, keep each `.scene` with its own dependency folder, and use safe relative paths. Never commit OAuth tokens or provider credentials. Review licence and attribution requirements before distributing meshes, textures or scans.

See [scene pack creation](Scene-pack-creation.md), [`.rdt` format](RDT-pack-format.md) and [cloud security](Cloud-credentials.md).
