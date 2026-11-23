'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');

const ROOT=path.resolve(__dirname,'..');
const types=['brushed-steel','hammered-titanium','copper-patina',
    'anodized-iridescence'];
const metal=require('../rtdt_metal_surfaces');

function test_textures() {

    const hashes=[];
    for(const type of types) {

        const options={type:type,width:32,height:16,seed:7};
        const image=metal.texture(options),repeat=metal.texture(options);
        assert.equal(image.generator,type);
        assert.equal(image.data.length,32*16*3);
        assert.deepEqual(image.data,repeat.data,'Texture must be deterministic');
        assert.ok(new Set(image.data).size>8,type+' should produce a varied texture');
        for(let y=0;y<16;y++) {

            for(let c=0;c<3;c++)
                assert.equal(image.data[(y*32)*3+c],
                    image.data[(y*32+31)*3+c],
                    type+' must wrap seamlessly around a sphere');
        }
        hashes.push(Buffer.from(image.data).toString('hex'));
    }
    assert.equal(new Set(hashes).size,types.length,
        'Each finish must produce a distinct texture');
    assert.throws(()=>metal.texture({type:'unknown'}),/Unsupported/);
    assert.throws(()=>metal.texture({type:types[0],width:1}),/dimensions/);
    assert.throws(()=>metal.texture({type:types[0],seed:-1}),/dimensions/);
    assert.throws(()=>metal.texture({type:types[0],noise:2}),/Unknown/);
}

function test_scene_and_render() {

    const sandbox={console:{log(){},time(){},timeEnd(){}},Math,Number,String,
        Object,JSON,Date,Error,TypeError,Infinity,isFinite,parseInt,parseFloat,
        Uint8Array};
    vm.createContext(sandbox);
    const modules=[
        'rtdt_math.js','rtdt_core.js','rtdt_matrix-transform.js',
        'rtdt_matrix.js','rtdt_ray.js','rtdt_light.js','rtdt_material.js',
        'rtdt_world.js','rtdt_shade.js','rtdt_p+e.js','rtdt_pattern.js',
        'rtdt_colour.js','rtdt_examples.js','raytracer-core.js',
        'rtdt_render_core.js','rtdt_scene_assets.js','rtdt_scene_format.js',
        'rtdt_metal_surfaces.js','rtdt_scene_browser.js'
    ];
    for(const file of modules)
        vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),sandbox,
            {filename:file});

    const source=fs.readFileSync(path.join(ROOT,'samples','metal-finishes.scene'),'utf8');
    sandbox.metalScene=source;
    const model=sandbox.rtdt_scene_browser.parse(source);
    assert.equal(model.objects.length,5);
    assert.deepEqual(Array.from(sandbox.rtdt_metal_surfaces.supported_types),
        types);
    sandbox.rtdt_scene_browser.load(source,48,32,{files:{},entries:[]});
    const scene=sandbox.RtDtState.scene;
    for(let i=0;i<types.length;i++) {

        const material=scene.o.s[i].material;
        assert.ok(material.pattern,'Procedural surface should become a scene texture');
        assert.equal(material.pattern.TextureMap.uv_pattern.c.generator,types[i]);
    }
    const pixels=sandbox.rtdt_render_core.render_pixels(
        sandbox.rtdt_render_core.create_world(scene),scene.c,48,32,1);
    assert.equal(pixels.length,48*32);
    assert.ok(pixels.every(pixel=>pixel &&
        [pixel.r,pixel.g,pixel.b].every(Number.isFinite)));

    const browser=fs.readFileSync(path.join(ROOT,'webapp.html'),'utf8');
    assert.match(browser,/data-scene-path="samples\/metal-finishes\.scene"/);
    assert.match(browser,/<script src="rtdt_metal_surfaces\.js"><\/script>/);

    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-metal-surfaces-'));
    try {

        const output=path.join(temp,'metal-finishes.png');
        const result=cp.spawnSync(process.execPath,[
            path.join(ROOT,'cli.js'),'--scene-file',
            path.join(ROOT,'samples','metal-finishes.scene'),'--width','32',
            '--height','24','--output',output
        ],{cwd:ROOT,encoding:'utf8',timeout:120000});
        assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
        assert.ok(fs.readFileSync(output).subarray(0,8).equals(
            Buffer.from([137,80,78,71,13,10,26,10])));
    } finally {

        fs.rmSync(temp,{recursive:true,force:true});
    }
}

test_textures();
test_scene_and_render();
console.log('Procedural metal textures, scene loading and CLI render passed');
