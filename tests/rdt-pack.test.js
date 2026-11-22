'use strict';
/* Contract and preflight coverage for the RtDt .rdt v1 grammar. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const rtdt_pack = require('../rtdt_pack');
const rtdt_pack_lint_node = require('../rtdt_pack_lint_node');

const ROOT = path.resolve(__dirname,'..');
const SAMPLE = path.join(ROOT,'samples','orbit.rdt');

function expect_invalid(model,pattern) {

    assert.throws(function () {

        rtdt_pack.parse(JSON.stringify(model));
    },pattern);
}

function write_json(filename,object) {

    fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,JSON.stringify(object,null,2)+'\n');
}

function check_parser() {

    const sample = rtdt_pack.parse(fs.readFileSync(SAMPLE,'utf8'));
    assert.equal(sample.version,1);
    assert.equal(sample.scene,'orbit.scene');
    assert.equal(sample.phy,'orbit/orbit-formula.phy');
    assert.deepEqual(sample.render.frames,{start:0,end:191});
    assert.equal(sample.output.destination,'zip');
    assert.deepEqual(rtdt_pack.validate(sample),sample,
        'Normalized manifests must remain valid when validated a second time');
    assert.deepEqual(rtdt_pack.references(sample).map(function (file) {

        return file.kind+':'+file.path;
    }),['scene:orbit.scene','animation:orbit/orbit-formula.phy']);
    assert.equal(rtdt_pack.relative_location('samples/orbit.rdt','orbit.scene'),
        'samples/orbit.scene');
    const minimal = rtdt_pack.parse('{"version":1,"scene":"main.scene"}');
    assert.equal(minimal.output.destination,'file');
    assert.equal(minimal.render.width,500);
    assert.equal(minimal.render.height,281);
    assert.equal(minimal.render.quality,1);

    assert.throws(function () {

        rtdt_pack.parse('{version:1}');
    },/Invalid .rdt JSON/);
    assert.throws(function () {

        rtdt_pack.parse('a'.repeat(262145));
    },/maximum 256 KiB/);
    expect_invalid({version:2,scene:'main.scene'},/version/);
    expect_invalid({version:1,scene:'main.json'},/extension/);
    expect_invalid({version:1,scene:'../outside.scene'},/Unsafe/);
    expect_invalid({version:1,scene:'/absolute.scene'},/Invalid relative/);
    expect_invalid({version:1,scene:'C:/drive.scene'},/Invalid relative/);
    expect_invalid({version:1,scene:'https://site/a.scene'},/Invalid relative/);
    expect_invalid({version:1,scene:'a.scene',unexpected:true},/Unknown pack field/);
    expect_invalid({version:1,scene:'a.scene',render:{width:0}},/render.width/);
    expect_invalid({version:1,scene:'a.scene',render:{quality:21}},/render.quality/);
    expect_invalid({version:1,scene:'a.scene',render:{width:4096,height:4096}},
        /4 million pixels/);
    expect_invalid({version:1,scene:'a.scene',render:{fps:0}},/render.fps/);
    expect_invalid({version:1,scene:'a.scene',render:{frames:{start:4,end:2}}},
        /Frame range/);
    expect_invalid({version:1,scene:'a.scene',render:{frames:{start:0,end:100000}}},
        /Frame range/);
    expect_invalid({version:1,scene:'a.scene',render:{frames:{start:0,end:2}},
        output:{destination:'file'}},/frame range/i);
    expect_invalid({version:1,scene:'a.scene',output:{destination:'dropbox'}},
        /Batch destinations/);
    expect_invalid({version:1,scene:'a.scene',render:{frames:{start:0,end:1}},
        output:{destination:'zip',format:'jpg'}},/shared PNG/);
    expect_invalid({version:1,scene:'a.scene',output:{path:'render.jpg'}},
        /must match/);
    expect_invalid({version:1,scene:'a.scene',assets:[
        {kind:'mesh',path:'obj/mesh.obj'},
        {kind:'mesh',path:'obj/mesh.obj'}
    ]},/Duplicate/);
    expect_invalid({version:1,scene:'a.scene',assets:[
        {kind:'mesh',path:'obj/mesh.js'}
    ]},/extension/);
    expect_invalid({version:1,scene:'a.scene',assets:[
        {kind:'texture',path:'textures/m.jpg',required:'no'}
    ]},/boolean/);
    assert.throws(function () {

        rtdt_pack.relative_location('samples/../bad.rdt','a.scene');
    },/Invalid pack location/);
}

function check_linter() {

    const sample = rtdt_pack_lint_node.lint_file(SAMPLE);
    assert.equal(sample.valid,true,JSON.stringify(sample.errors));
    assert.ok(sample.checked.includes('orbit.scene'));
    assert.ok(sample.checked.includes('orbit/orbit-formula.phy'));

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-pack-test-'));
    try {

        const packFile = path.join(workDir,'project.rdt');
        const sceneFile = path.join(workDir,'scene.scene');
        const phyFile = path.join(workDir,'motion.phy');
        const meshFile = path.join(workDir,'models','simple.obj');
        fs.mkdirSync(path.dirname(meshFile),{recursive:true});
        fs.writeFileSync(meshFile,'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
        write_json(phyFile,{version:1,timeline:{fps:24,duration:1},objects:[]});
        write_json(sceneFile,{version:1,objects:[
            {type:'mesh',mesh:'models/simple.obj'}
        ]});
        const manifest = {version:1,scene:'scene.scene',phy:'motion.phy',
            assets:[{kind:'texture',path:'optional.png',required:false}]};
        write_json(packFile,manifest);
        let report = rtdt_pack_lint_node.lint_file(packFile);
        assert.equal(report.valid,true,JSON.stringify(report.errors));
        assert.ok(report.warnings.some(function (message) {

            return /Optional.*optional.png/.test(message);
        }));
        assert.ok(report.checked.includes('models/simple.obj'));

        manifest.assets[0].required = true;
        write_json(packFile,manifest);
        report = rtdt_pack_lint_node.lint_file(packFile);
        assert.equal(report.valid,false,'Missing required texture must fail');
        assert.ok(report.errors.some(function (message) {

            return /optional.png/.test(message);
        }));

        manifest.assets = [];
        write_json(packFile,manifest);
        fs.writeFileSync(phyFile,'this: [is not valid');
        report = rtdt_pack_lint_node.lint_file(packFile);
        assert.equal(report.valid,false,'Invalid AetherOre document must fail');

        write_json(phyFile,{version:1,objects:[]});
        write_json(sceneFile,{version:1,objects:[
            {type:'mesh',mesh:'../escape.obj'}
        ]});
        report = rtdt_pack_lint_node.lint_file(packFile);
        assert.equal(report.valid,false,'Scene dependency traversal must fail');

        write_json(sceneFile,{version:1,objects:[]});
        write_json(packFile,{version:1,scene:'missing.scene'});
        report = rtdt_pack_lint_node.lint_file(packFile);
        assert.equal(report.valid,false,'Missing scene must fail');
        assert.ok(report.errors.some(function (message) {

            return /missing.scene/.test(message);
        }));

        if (process.platform !== 'win32') {

            const escapedFile = path.join(os.tmpdir(),
                'rtdt-escape-'+process.pid+'.scene');
            fs.writeFileSync(escapedFile,'{"version":1,"objects":[]}');
            try {

                fs.symlinkSync(escapedFile,path.join(workDir,'linked.scene'));
                write_json(packFile,{version:1,scene:'linked.scene'});
                report = rtdt_pack_lint_node.lint_file(packFile);
                assert.equal(report.valid,false,
                    'A symlink outside the pack directory must fail');
                assert.match(report.errors.join(' '),/symlink escapes/);
            } finally {

                fs.rmSync(escapedFile,{force:true});
            }
        }
    } finally {

        fs.rmSync(workDir,{recursive:true,force:true});
    }
}

function check_cli() {

    function invoke(args) {

        return cp.spawnSync(process.execPath,[path.join(ROOT,'cli.js')].concat(args),{
            cwd:ROOT,encoding:'utf8',timeout:30000
        });
    }
    const good = invoke(['--lint-pack','samples/orbit.rdt']);
    assert.equal(good.status,0,good.stdout+'\n'+good.stderr);
    assert.match(good.stdout,/structurally valid/);
    const bad = invoke(['--lint-pack','samples/does-not-exist.rdt']);
    assert.notEqual(bad.status,0,'Missing .rdt must exit nonzero');
    assert.match(bad.stdout+bad.stderr,/validation failed|not found|ENOENT/i);
}

function check_job_execution() {

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-job-test-'));
    try {

        const manifest = path.join(workDir,'job.rdt');
        const scene = path.join(workDir,'orbit.scene');
        const animation = path.join(workDir,'orbit','orbit-formula.phy');
        fs.mkdirSync(path.dirname(animation),{recursive:true});
        fs.copyFileSync(path.join(ROOT,'samples','orbit.scene'),scene);
        fs.copyFileSync(path.join(ROOT,'samples','orbit','orbit-formula.phy'),
            animation);
        const job = {version:1,name:'Job integration test',
            scene:'orbit.scene',phy:'orbit/orbit-formula.phy',
            render:{width:12,height:10,quality:1,fps:12,
                frames:{start:2,end:3}},
            output:{destination:'zip',path:'out/test-animation.zip',format:'png'}};
        write_json(manifest,job);
        const finished = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',manifest],{
                cwd:ROOT,encoding:'utf8',timeout:120000
            });
        assert.equal(finished.status,0,finished.stderr+'\n'+finished.stdout);
        const archive = path.join(workDir,'out','test-animation.zip');
        assert.ok(fs.existsSync(archive),'Pack job must write ZIP beside manifest');
        const bytes = fs.readFileSync(archive);
        assert.equal(bytes.readUInt32LE(0),0x04034b50);
        assert.ok(bytes.includes(Buffer.from('frame-0002.png')));
        assert.ok(bytes.includes(Buffer.from('frame-0003.png')));
        assert.ok(bytes.includes(Buffer.from('manifest.json')));
        const manifestOffset = bytes.indexOf(Buffer.from('manifest.json'));
        assert.ok(manifestOffset>=0);

        job.output = {destination:'folder',path:'out/frames',format:'png'};
        write_json(manifest,job);
        const folder = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',manifest],{
                cwd:ROOT,encoding:'utf8',timeout:120000
            });
        assert.equal(folder.status,0,folder.stderr+'\n'+folder.stdout);
        const framesDir = path.join(workDir,'out','frames');
        assert.ok(fs.existsSync(path.join(framesDir,'frame-0002.png')));
        assert.ok(fs.existsSync(path.join(framesDir,'frame-0003.png')));
        assert.deepEqual(fs.readFileSync(path.join(framesDir,'frame-0002.png')),
            zip_entry(bytes,'frame-0002.png'),
            'Pack ZIP and folder must contain byte-identical frames');
        const info = JSON.parse(fs.readFileSync(path.join(framesDir,'manifest.json')));
        assert.equal(info.fps,12,'Manifest FPS must override the .phy timeline');
        assert.equal(info.startFrame,2);
        assert.equal(info.endFrame,3);

        job.render = {width:12,height:10,quality:1};
        job.output = {destination:'file',path:'out/still.png',format:'png'};
        write_json(manifest,job);
        const still = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',manifest],{
                cwd:ROOT,encoding:'utf8',timeout:120000
            });
        assert.equal(still.status,0,still.stderr+'\n'+still.stdout);
        assert.ok(fs.readFileSync(path.join(workDir,'out','still.png'))
            .subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));

        job.scene = 'missing.scene';
        write_json(manifest,job);
        const invalid = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',manifest],{
                cwd:ROOT,encoding:'utf8',timeout:120000
            });
        assert.notEqual(invalid.status,0);
        assert.ok(!fs.existsSync(path.join(workDir,'out','missing.png')));
    } finally {

        fs.rmSync(workDir,{recursive:true,force:true});
    }
}

function zip_entry(bytes,name) {

    let offset=0;
    while (bytes.readUInt32LE(offset)===0x04034b50) {

        const size=bytes.readUInt32LE(offset+18);
        const nameLength=bytes.readUInt16LE(offset+26);
        const extraLength=bytes.readUInt16LE(offset+28);
        const filename=bytes.subarray(offset+30,offset+30+nameLength).toString();
        const start=offset+30+nameLength+extraLength;
        if (filename===name) return bytes.subarray(start,start+size);
        offset=start+size;
    }
    throw new Error('ZIP entry not found: '+name);
}

check_parser();
check_linter();
check_cli();
check_job_execution();
console.log('RDT v1 grammar, preflight and CLI job execution (ZIP/folder/still) passed');
