'use strict';
/* Regression: portable ZIP, shared PNG bytes, CLI single-frame/batch parity. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {PNG} = require('pngjs');
const encoder = require('../rtdt_png');
const images = require('../rtdt_image_io_node');
const zipper = require('../rtdt_animation_export');
const destination = require('../rtdt_animation_destination');
const batch = require('../rtdt_animation_batch');

function zip_files(bytes) {

    const result = {};
    let offset = 0;
    while (bytes.readUInt32LE(offset) === 0x04034b50) {

        const size = bytes.readUInt32LE(offset+18);
        const compressed = bytes.readUInt32LE(offset+22);
        const nameLength = bytes.readUInt16LE(offset+26);
        const extraLength = bytes.readUInt16LE(offset+28);
        const expectedCRC = bytes.readUInt32LE(offset+14);
        assert.equal(size,compressed,'All ZIP entries use stored bytes');
        const name = bytes.subarray(offset+30,offset+30+nameLength).toString('utf8');
        const contentStart = offset+30+nameLength+extraLength;
        const content = bytes.subarray(contentStart,contentStart+size);
        assert.equal(zipper.crc32(content),expectedCRC,'ZIP CRC mismatch');
        assert.equal(result[name],undefined,'Duplicate ZIP entry');
        result[name] = content;
        offset = contentStart+size;
    }
    assert.equal(bytes.readUInt32LE(offset),0x02014b50,
        'ZIP central directory is missing');
    return result;
}

async function test_batch() {

    const generated = [];
    const sink = destination.create({
        kind:'zip',
        output_archive:function (bytes) {

            generated.push(Buffer.from(bytes));
        }
    });
    const output = await batch.run({
        sink, startFrame:0,endFrame:3,fps:24,width:4,height:3,
        render_frame:function (index) {

            return Array.from({length:12},function (_,pixel) {

                return {r:index/5,g:pixel/12,b:0.25};
            });
        }
    });
    assert.equal(output.manifest.frames.length,4);
    assert.equal(generated.length,1);
    const files = zip_files(generated[0]);
    assert.equal(Object.keys(files).length,5);
    const manifest = JSON.parse(files['manifest.json'].toString('utf8'));
    assert.equal(manifest.frames[3].timeSeconds,3/24);
    for (let i=0;i<4;i++) {

        const name = 'frame-'+String(i).padStart(4,'0')+'.png';
        const bytes = files[name];
        assert.ok(bytes,'Missing '+name);
        const png = PNG.sync.read(bytes,{checkCRC:true});
        assert.equal(png.width,4);
        assert.equal(png.height,3);
        assert.equal(png.data[0],Math.round(i/5*255));
        const pixels = Array.from({length:12},function (_,pixel) {

            return {r:i/5,g:pixel/12,b:0.25};
        });
        assert.deepEqual(bytes,images.encodePNG(pixels,4,3),
            'Browser and CLI PNG bytes must be identical');
        assert.deepEqual(bytes,Buffer.from(encoder.encode(pixels,4,3)));
    }
}

function render_cli() {

    const root = path.resolve(__dirname,'..');
    const work = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-zip-'));
    const scene = path.join(root,'samples/orbit.scene');
    const phy = path.join(root,'samples/orbit/orbit-formula.phy');
    const common = ['--scene-file',scene,'--phy',phy,
        '--width','8','--height','8'];
    function command(args) {

        const child = cp.spawnSync(process.execPath,[path.join(root,'cli.js')].concat(args),{
            cwd:root,encoding:'utf8',timeout:120000
        });
        assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
    }
    try {

        const frame = path.join(work,'single.png');
        const archive = path.join(work,'batch.zip');
        const folder = path.join(work,'frames');
        command(common.concat(['--frame','2','--output',frame]));
        command(common.concat(['--batch','--destination','zip',
            '--start-frame','2','--end-frame','2','--zip-file',archive]));
        command(common.concat(['--batch','--destination','folder',
            '--start-frame','2','--end-frame','2','--output-dir',folder]));
        const files = zip_files(fs.readFileSync(archive));
        assert.deepEqual(files['frame-0002.png'],fs.readFileSync(frame),
            'Single PNG and batch ZIP must contain identical bytes');
        assert.deepEqual(fs.readFileSync(path.join(folder,'frame-0002.png')),
            fs.readFileSync(frame),'Folder batch must match CLI PNG');
        assert.equal(JSON.parse(files['manifest.json']).frames.length,1);
        assert.ok(fs.existsSync(path.join(folder,'manifest.json')));
    } finally {

        fs.rmSync(work,{recursive:true,force:true});
    }
}

test_batch().then(function () {

    render_cli();
    console.log('Shared PNG, ZIP, directory and CLI batch byte parity verified');
}).catch(function (error) {

    console.error(error);
    process.exitCode = 1;
});
