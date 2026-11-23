'use strict';
/* Shared executor regression: chunked WebApp, synchronous CLI and batch paths. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const imageIO = require('../rtdt_image_io_node');

const ROOT = path.resolve(__dirname,'..');
const scripts = [
    'rtdt_math.js','rtdt_core.js','rtdt_matrix-transform.js','rtdt_matrix.js',
    'rtdt_ray.js','rtdt_light.js','rtdt_material.js','rtdt_world.js',
    'rtdt_shade.js','rtdt_p+e.js','rtdt_pattern.js','rtdt_colour.js',
    'rtdt_examples.js','raytracer-core.js','rtdt_render_core.js',
    'rtdt_png.js','rtdt_ppm.js','rtdt_animation_export.js',
    'rtdt_animation_destination.js','rtdt_animation_batch.js',
    'rtdt_job.js','rtdt_scene_assets.js','rtdt_scene_format.js',
    'rtdt_scene_browser.js'
];
const sandbox = {console:{log(){},time(){},timeEnd(){}},
    TextEncoder:TextEncoder,Uint8Array:Uint8Array};
sandbox.prepCanvas = function () {};
sandbox.renderImage = function () {};
vm.createContext(sandbox);
for (const name of scripts) {

    vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),sandbox,{
        filename:name
    });
}

function setup_scene() {

    const model = sandbox.rtdt_scene_browser.parse(
        fs.readFileSync(path.join(ROOT,'samples','prism-garden.scene'),'utf8'));
    sandbox.rtdt_scene_browser.load(model,24,16,{files:{},entries:[]});
    return sandbox.RtDtState.scene;
}

function check_stills() {

    const sceneState = setup_scene();
    const width=24,height=16,quality=2;
    const world = sandbox.rtdt_render_core.create_world(sceneState);
    const direct = sandbox.rtdt_render_core.render_pixels(world,sceneState.c,
        width,height,quality);
    const sync = sandbox.rtdt_job.render_still({
        sceneState:sceneState,width:width,height:height,quality:quality
    });
    const stepped = sandbox.rtdt_job.create_session({
        sceneState:sceneState,width:width,height:height,quality:quality
    });
    let current;
    do {

        current = stepped.step(3);
    } while (!current.done);
    assert.equal(current.row,height);
    assert.deepEqual(JSON.parse(JSON.stringify(stepped.pixels)),
        JSON.parse(JSON.stringify(direct)));
    assert.deepEqual(JSON.parse(JSON.stringify(sync)),
        JSON.parse(JSON.stringify(direct)));
    const sharedPPM = Buffer.from(sandbox.rtdt_ppm.encode(sync,width,height));
    assert.deepEqual(sharedPPM,imageIO.encodePPM(sync,width,height),
        'Browser and Node PPM bytes must be identical');
    const doomed = sandbox.rtdt_job.create_session({
        sceneState:sceneState,width:width,height:height,quality:quality
    });
    doomed.step(1);
    doomed.cancel();
    assert.throws(function () {

        doomed.step(1);
    },/cancelled/);
    assert.throws(function () {

        sandbox.rtdt_job.create_session({
            sceneState:sceneState,width:0,height:height,quality:quality
        });
    },/Invalid render/);
    const bindings = sandbox.rtdt_job.animation_bindings(sceneState);
    assert.ok(bindings['0']);
    assert.equal(sandbox.rtdt_job.frame_time(12,24),0.5);
    console.log('Shared still sessions, cancellation, validation and PPM parity passed');
}

async function check_animation() {

    const sceneState = setup_scene();
    const times = [], files = new Map();
    const result = await sandbox.rtdt_job.render_animation({
        sceneState:sceneState,width:8,height:8,quality:1,
        fps:24,startFrame:2,endFrame:3,
        animator:{at:function (time) {

            times.push(time);
        }},
        sink:{add:async function (name,bytes) {

            files.set(name,Buffer.from(bytes));
        },finish:async function () {

            return true;
        }}
    });
    assert.deepEqual(times,[2/24,3/24]);
    assert.equal(result.manifest.frames.length,2);
    assert.ok(files.has('frame-0002.png'));
    assert.ok(files.has('frame-0003.png'));
    assert.ok(files.has('manifest.json'));
    const png = files.get('frame-0002.png');
    assert.deepEqual(Array.from(png.subarray(0,8)),
        [137,80,78,71,13,10,26,10]);
    console.log('Shared AetherOre frame scheduling, PNG output and manifest passed');
}

check_stills();
check_animation().catch(function (error) {

    console.error(error);
    process.exitCode=1;
});
