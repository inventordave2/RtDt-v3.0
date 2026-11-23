'use strict';
/* Generic flightpath semantics, Mandelbrot adapter and AetherOre compatibility. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const sandbox={console:console,Uint8Array:Uint8Array};
vm.createContext(sandbox);
for(const name of ['rtdt_aetherore.js','rtdt_flightpath.js','rtdt_mandelbrot.js']) {

    vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),sandbox,
        {filename:name});
}
const flight=sandbox.rtdt_flightpath;
const fractal=sandbox.rtdt_mandelbrot;

function near(actual,expected,tolerance) {

    assert.ok(Math.abs(actual-expected)<tolerance,
        'Expected '+actual+' near '+expected);
}

function test_generic_path() {

    const pathModel=flight.create([[0,0,0],[2,0,0],[2,0,2],[0,0,2]],{
        fps:24,cycles:3,scale:1,entropy:0.2
    });
    assert.equal(pathModel.duration,0.5);
    assert.deepEqual(Array.from(flight.sample_at(pathModel,0)),[0,0,0]);
    near(flight.sample_at(pathModel,1/48)[0],1*Math.exp(0.025),1e-12);
    assert.deepEqual(Array.from(flight.sample_at(pathModel,4/24)),[0,0,0]);
    near(flight.sample_at(pathModel,5/24)[0],2*Math.exp(0.25),1e-12);
    assert.deepEqual(Array.from(flight.sample_at(pathModel,pathModel.duration)),[0,0,0]);
    for(let i=1;i<=3;i++) {

        const time=i*4/24;
        const before=flight.sample_at(pathModel,time-1e-7);
        const after=flight.sample_at(pathModel,time);
        assert.ok(Math.hypot(...before.map((v,k)=>v-after[k]))<0.0001,
            'Flightpath must be continuous at cycle boundary');
    }
    const custom=flight.create([[1,0,0],[0,1,0]],{
        cycles:2,expansion:'scale+entropy*t',entropy:0.5,scale:2
    });
    near(flight.sample_at(custom,1/24)[1],2+0.5/24,1e-12);
    const phy=flight.to_phy(pathModel,'craft');
    assert.equal(phy.objects[0].id,'craft');
    assert.equal(phy.objects[0].motion.position.length,13);
    assert.equal(phy.timeline.duration,pathModel.duration);
    const parsed=sandbox.rtdt_aetherore.parse_phy(phy);
    const pose=sandbox.rtdt_aetherore.evaluate(parsed,5/24);
    near(pose.craft.position[0],2*Math.exp(0.25),1e-12);
    assert.throws(function () {

        flight.create([[0,0,0],[Infinity,0,0]],{});
    },/finite/);
    assert.throws(function () {

        flight.create([[0,0,0],[1,0,0]],{expansion:'process.exit(1)'});
    },/expression|Invalid|Unexpected|Syntax/);
    assert.throws(function () {

        flight.create([[0,0,0],[1,0,0]],{cycles:10000});
    },/Invalid/);
}

function test_mandelbrot_source() {

    const source=fractal.flight_source({
        cx:-0.75,cy:0.1,steps:24,cycles:2,fps:12,scale:2,entropy:0.1
    });
    assert.ok(source.points.length>=3);
    assert.equal(source.cycles,2);
    const positions=fractal.flight_path({
        cx:-0.75,cy:0.1,steps:24,cycles:2,fps:12
    });
    assert.deepEqual(Array.from(positions[0].value),[0,0,0]);
    assert.deepEqual(Array.from(positions[positions.length-1].value),[0,0,0]);
    const document=fractal.flight_phy({steps:24,cycles:2,fps:12},'rocket');
    assert.equal(document.objects[0].id,'rocket');
    const evaluated=sandbox.rtdt_aetherore.evaluate(document,0);
    assert.deepEqual(Array.from(evaluated.rocket.position),[0,0,0]);
    const image=fractal.texture({width:12,height:8,iterations:25,
        palette:'3*log10(i)/log10(iterations-1)'});
    assert.equal(image.data.length,12*8*3);
    assert.equal(image.generator,'mandelbrot');
}

function test_cli_material() {

    const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-flight-'));
    try {

        const output=path.join(outDir,'mandelbrot.png');
        const child=cp.spawnSync(process.execPath,[
            path.join(ROOT,'cli.js'),'--scene-file',
            path.join(ROOT,'samples','mandelbrot-studio.scene'),
            '--width','16','--height','10','--output',output],{
            cwd:ROOT,encoding:'utf8',timeout:120000
        });
        assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
        assert.ok(fs.readFileSync(output).subarray(0,8).equals(
            Buffer.from([137,80,78,71,13,10,26,10])));
    } finally {

        fs.rmSync(outDir,{recursive:true,force:true});
    }
}

test_generic_path();
test_mandelbrot_source();
test_cli_material();
console.log('Generic periodic flightpaths, AetherOre, Mandelbrot and CLI texture passed');
