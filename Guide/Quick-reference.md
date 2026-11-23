# RtDt quick reference

**WebApp:** https://inventordave2.github.io/RtDt-v3.0/webapp.html

**Command line:**

~~~sh
npm install
node cli.js --help
node cli.js --list-scenes
node cli.js --scene scene1 --width 160 --height 90 --output preview.png
node cli.js --scene-file samples/orbit.scene --output orbit.png
node cli.js --lint-pack samples/orbit.rdt
node cli.js --job samples/orbit.rdt
~~~

**Tests and benchmark:**

~~~sh
npm test
npm run test:animation:full
npm run test:browser
npm run benchmark:quick
npm run benchmark
~~~

**Formats:** `.rdt` is a job/pack manifest; `.scene` is a declarative scene; `.phy` is an AetherOre animation; `.obj` is mesh geometry. The WebApp can open the featured or a local-folder `.rdt` pack.

**Further reading:** [CLI](CLI.md), [.rdt guide](RDT-pack-format.md), [scene files](Scene-files.md), [benchmarking](Benchmarking.md), [deployment](Deployment.md).
