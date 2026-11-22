'use strict';
/* Full AetherOre CLI batch run: 192 PNGs, manifest, motion and timestamps. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {PNG} = require('pngjs');

const ROOT = path.resolve(__dirname,'..');
const FRAME_COUNT = 192;
const FPS = 24;
const WIDTH = 48;
const HEIGHT = 30;

function read_stored_zip(filename) {

    const bytes = fs.readFileSync(filename);
    const entries = {};
    let offset = 0;
    while (bytes.readUInt32LE(offset) === 0x04034b50) {

        const method = bytes.readUInt16LE(offset+8);
        const length = bytes.readUInt32LE(offset+18);
        const filenameLength = bytes.readUInt16LE(offset+26);
        const extraLength = bytes.readUInt16LE(offset+28);
        const name = bytes.subarray(offset+30,offset+30+filenameLength).toString('utf8');
        assert.equal(method,0,'ZIP entries must preserve their encoded bytes');
        assert.equal(entries[name],undefined,'Duplicate archive entry '+name);
        const start = offset+30+filenameLength+extraLength;
        entries[name] = bytes.subarray(start,start+length);
        offset = start+length;
    }
    assert.equal(bytes.readUInt32LE(offset),0x02014b50);
    return entries;
}

function run() {

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-192-'));
    try {

        const archive = path.join(workDir,'orbit.zip');
        const argv = [path.join(ROOT,'cli.js'),
            '--scene-file','samples/orbit.scene',
            '--phy','samples/orbit/orbit-formula.phy',
            '--batch','--destination','zip',
            '--start-frame','0','--end-frame','191',
            '--width',String(WIDTH),'--height',String(HEIGHT),
            '--zip-file',archive];
        const child = cp.spawnSync(process.execPath,argv,{
            cwd:ROOT,encoding:'utf8',timeout:180000,
            maxBuffer:1024*1024
        });
        assert.equal(child.status,0,'CLI batch failure:\n'+child.stderr+
            '\n'+child.stdout);
        assert.ok(fs.statSync(archive).size > 1000,'Expected a nonempty ZIP');
        const entries = read_stored_zip(archive);
        assert.equal(Object.keys(entries).length,FRAME_COUNT+1,
            'Expected all 192 frames and manifest');
        const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
        assert.equal(manifest.frames.length,FRAME_COUNT);
        assert.equal(manifest.fps,FPS);
        assert.equal(manifest.startFrame,0);
        assert.equal(manifest.endFrame,191);
        assert.equal(manifest.width,WIDTH);
        assert.equal(manifest.height,HEIGHT);
        const distinct = new Set();
        let changed = 0;
        let first = null;
        for (let i=0;i<FRAME_COUNT;i++) {

            const name = 'frame-'+String(i).padStart(4,'0')+'.png';
            const buffer = entries[name];
            assert.ok(buffer,'Missing '+name);
            const frame = PNG.sync.read(buffer,{checkCRC:true});
            assert.equal(frame.width,WIDTH);
            assert.equal(frame.height,HEIGHT);
            assert.equal(manifest.frames[i].index,i);
            assert.equal(manifest.frames[i].timeSeconds,i/FPS);
            assert.equal(manifest.frames[i].filename,name);
            const hash = crypto.createHash('sha256').update(frame.data).digest('hex');
            distinct.add(hash);
            if (first === null) first = hash;
            if (hash !== first) changed++;
        }
        assert.ok(distinct.size >= 3,
            'Animation produced fewer than 3 visually distinct frames');
        assert.ok(changed >= FRAME_COUNT/4,
            'Most frames match the first; .phy motion may not have been applied');
        console.log('192-frame CLI batch ZIP verified: '+distinct.size+
            ' distinct images at '+WIDTH+'x'+HEIGHT+' / '+FPS+'fps');
    } finally {

        fs.rmSync(workDir,{recursive:true,force:true});
    }
}

run();
