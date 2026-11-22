'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const WIDTH = 8;
const HEIGHT = 8;
const scripts = [
    'rtdt_math.js','rtdt_core.js','rtdt_matrix-transform.js','rtdt_matrix.js',
    'rtdt_ray.js','rtdt_light.js','rtdt_material.js','rtdt_world.js',
    'rtdt_shade.js','rtdt_p+e.js','rtdt_pattern.js','rtdt_colour.js',
    'rtdt_examples.js','raytracer-core.js','rtdt_render_core.js',
    'rtdt_scene_assets.js','rtdt_scene_format.js','rtdt_scene_browser.js','rtdt_image_io_browser.js'
];
const sandbox = {console:{log(){},time(){},timeEnd(){}},Math,Date,Number,String,
    Object,JSON,Error,TypeError,Infinity,isFinite,parseInt,parseFloat,Uint8Array};
sandbox.prepCanvas = function () {};
sandbox.renderImage = function () {};
vm.createContext(sandbox);
for (const file of scripts) {

    vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),sandbox,{filename:file});
}

const assetNode = require('../rtdt_scene_assets_node');
const imageIO = require('../rtdt_image_io_node');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-parity-'));
try {

    for (const name of ['orbit','orbit-yaml','rocket-to-rainbow-planet','vw-beetle-psychedelia']) {

        const sceneFile = path.join(ROOT,'samples',name === 'orbit-yaml' ? 'orbit-yaml.scene.yaml' : name+'.scene');
        const model = sandbox.rtdt_scene_format.parse(fs.readFileSync(sceneFile,'utf8'));
        const resolved = assetNode.resolve(model,sceneFile,ROOT,
            sandbox.rtdt_scene_assets,sandbox.rtdt_image_io_browser);
        assert.ok(resolved.records.every(record => record.status==='loaded' ||
            record.required===false),'Required assets must resolve');
        sandbox.rtdt_scene_browser.load(model,WIDTH,HEIGHT,resolved);
        const renderWorld = sandbox.rtdt_render_core.create_world(sandbox.RtDtState.scene);
        const pixels = sandbox.rtdt_render_core.render_pixels(
            renderWorld,sandbox.RtDtState.scene.c,WIDTH,HEIGHT,1);
        const expected = imageIO.encodePPM(pixels,WIDTH,HEIGHT).toString('utf8');
        const outfile = path.join(temp,name+'.ppm');
        const child = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--scene-file',sceneFile,'--width',String(WIDTH),
                '--height',String(HEIGHT),'--output',outfile],{
                cwd:temp,encoding:'utf8',timeout:60000
            });
        assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
        assert.equal(fs.readFileSync(outfile,'utf8'),expected,
            'CLI output must match the shared scene + renderer path: '+name);
    }
    assert.throws(() => sandbox.rtdt_scene_assets.check_path('../escape.obj'));
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.rtdt_scene_format.parse(
        fs.readFileSync(path.join(ROOT,'samples','orbit-yaml.scene.yaml'),'utf8')))),
        JSON.parse(fs.readFileSync(path.join(ROOT,'samples','orbit.scene'),'utf8')));
    console.log('Node CLI and shared scene/render outcomes match for JSON/YAML scene packs');
} finally {

    fs.rmSync(temp,{recursive:true,force:true});
}
