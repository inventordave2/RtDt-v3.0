'use strict';
/* Browser folder registry and RDT registry fallback contract. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const child=require('node:child_process');
const registry=require('../rtdt_asset_registry');
const pack=require('../rtdt_pack');
const lint=require('../rtdt_pack_lint_node');

const indexed=registry.index([
    {name:'scene.scene',webkitRelativePath:'project/scenes/scene.scene'},
    {name:'mesh.obj',webkitRelativePath:'project/assets/mesh.obj'},
    {name:'mesh.obj',webkitRelativePath:'project/other/mesh.obj'},
    {name:'paint.png',webkitRelativePath:'project/assets/paint.png'}
]);
assert.equal(indexed.count,4);
assert.equal(indexed.entries['scenes/scene.scene'].type,'scene');
assert.equal(indexed.counts.mesh,2);
assert.equal(registry.find(indexed,'mesh.obj',['assets']).path,'assets/mesh.obj');
assert.equal(registry.find(indexed,'missing.obj',['assets']),null);
assert.throws(function() {

    registry.index([{name:'bad',webkitRelativePath:'project/../bad'}]);
},/Invalid registry path/);
assert.throws(function() {

    registry.index([
        {name:'a',webkitRelativePath:'one/a'},
        {name:'b',webkitRelativePath:'two/b'}
    ]);
},/single selected folder/);

const manifest={version:1,scene:'orbit.scene',
    registries:['assets','other'],render:{width:12,height:10},
    output:{destination:'file',path:'result.png'}};
const normalized=pack.parse(JSON.stringify(manifest));
assert.deepEqual(normalized.registries,['assets','other']);
assert.deepEqual(pack.validate(normalized),normalized);
assert.throws(function() {

    pack.parse(JSON.stringify({...manifest,registries:['../escape']}));
},/Unsafe relative/);
assert.throws(function() {

    pack.parse(JSON.stringify({...manifest,registries:['assets','assets']}));
},/Duplicate registry/);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-registry-test-'));
try {

    const scene={version:1,objects:[{type:'mesh',mesh:'model.obj'}]};
    fs.mkdirSync(path.join(tmp,'assets'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'assets','orbit.scene'),JSON.stringify(scene));
    fs.writeFileSync(path.join(tmp,'assets','model.obj'),
        'v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nf 1 2 3\\n'.replace(/\\n/g,'\n'));
    const file=path.join(tmp,'demo.rdt');
    fs.writeFileSync(file,JSON.stringify(manifest));
    const report=lint.lint_file(file);
    assert.equal(report.valid,true,JSON.stringify(report.errors));
    assert.equal(report.resolved['scene:orbit.scene'],
        path.join(tmp,'assets','orbit.scene'));
    assert.ok(report.checked.includes('assets/model.obj'));
    const cli=child.spawnSync(process.execPath,
        [path.join(__dirname,'..','cli.js'),'--job',file],{
            cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:120000
        });
    assert.equal(cli.status,0,cli.stdout+'\n'+cli.stderr);
    assert.ok(fs.existsSync(path.join(tmp,'result.png')));
} finally {

    fs.rmSync(tmp,{recursive:true,force:true});
}
console.log('Browser asset indexing, RDT default registries and CLI fallback passed');
