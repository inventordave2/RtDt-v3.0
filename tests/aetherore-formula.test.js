'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sceneFormat = require('../rtdt_scene_format');
global.rtdt_scene_format = sceneFormat;
const aetherore = require('../rtdt_aetherore');
const file = path.join(__dirname,'../samples/orbit/orbit-formula.phy');
const model = aetherore.parse_phy(fs.readFileSync(file,'utf8'));
assert.equal(model.timeline.duration,8);
const first = aetherore.evaluate(model,0);
assert.deepEqual(first['0'].position,[0,0,0]);
assert.deepEqual(first['0'].rotation,[0,0,0]);
const second = aetherore.evaluate(model,2);
assert.ok(Math.abs(second['0'].position[0] - 3*(Math.cos(1.6)-1)) < 1e-10);
assert.ok(Math.abs(second['0'].position[2] - 3*Math.sin(1.6)) < 1e-10);
assert.deepEqual(second['0'].rotation,[0,1.6,0]);
assert.ok(Math.abs(second['1'].rotation[1] - Math.PI / 4) < 1e-10);
assert.deepEqual(aetherore.evaluate(model,2),second);
assert.ok(Math.abs(aetherore.evaluate(model,2,{speed:0})['0'].position[2]) < 1e-10);
const original = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../samples/orbit/orbit.phy'),'utf8'));
assert.ok(Array.isArray(aetherore.evaluate(original,2)['0'].position));
assert.throws(() => aetherore.parse_phy({
    version:1,parameters:{t:2},objects:[]
}),/reserved/);
assert.throws(() => aetherore.parse_phy({
    version:1,objects:[{id:'0',motion:{position:['process.exit(1)',0,0]}}]
}),/expression|Syntax|Invalid/i);
console.log('AetherOre formula, parameter override, YAML and keyframe tests passed');
