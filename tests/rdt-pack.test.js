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

check_parser();
check_linter();
check_cli();
console.log('RDT v1 grammar, dependencies, symlink protection and CLI lint passed');
