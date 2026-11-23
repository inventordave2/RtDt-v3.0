'use strict';
/* Benchmark harness invariants and one lightweight real .rdt execution. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const benchmark = require('../rtdt_benchmark_node');

const ROOT = path.resolve(__dirname,'..');
const profiles = benchmark.read_profiles(
    path.join(ROOT,'benchmarks','profiles.json'));

function test_profiles() {

    assert.ok(profiles.length>=4,'Expected bundled primitive, reflection, complex and animation profiles');
    const ids = profiles.map(function (item) {

        return item.id;
    });
    for (const name of ['primitives','reflections','complex-scene','animation'])
        assert.ok(ids.includes(name),'Missing benchmark profile '+name);

    assert.equal(benchmark.median([5,1,9]),5);
    assert.equal(benchmark.median([2,4,10,20]),7);
    assert.equal(benchmark.quantile([4,4,4],0.75),4);
    assert.deepEqual(benchmark.parse_arguments(['--profile','primitives',
        '--warmups','0','--iterations','1']).iterations,1);
    assert.throws(function () {

        benchmark.parse_arguments(['--iterations','0']);
    },/iterations/);
    assert.throws(function () {

        benchmark.parse_arguments(['--warmups','11']);
    },/warmups/);
}

function test_execution() {

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-benchmark-test-'));
    try {

        const result = benchmark.main(['--profile','primitives',
            '--iterations','2','--warmups','0','--output-dir',outDir]);
        assert.equal(result.results.length,1);
        const item = result.results[0];
        assert.equal(item.id,'primitives');
        assert.equal(item.samplesMs.length,2);
        assert.ok(item.medianMs>0);
        assert.ok(item.pixelsPerSecond>0);
        assert.match(item.sha256,/^[a-f0-9]{64}$/);
        const json = JSON.parse(fs.readFileSync(
            path.join(outDir,'benchmark-results.json'),'utf8'));
        assert.equal(json.schemaVersion,1);
        assert.equal(json.results[0].sha256,item.sha256);
        assert.match(fs.readFileSync(
            path.join(outDir,'benchmark-results.csv'),'utf8'),
            /primitives,/);
        const child = cp.spawnSync(process.execPath,
            [path.join(ROOT,'rtdt_benchmark_node.js'),'--profile','unknown'],{
                cwd:ROOT,encoding:'utf8',timeout:10000
            });
        assert.notEqual(child.status,0);
        assert.match(child.stderr,/Unknown benchmark profile/);
    } finally {

        fs.rmSync(outDir,{recursive:true,force:true});
    }
}

test_profiles();
test_execution();
console.log('Benchmark profiles, statistics, deterministic RDT jobs and JSON/CSV reporting passed');
