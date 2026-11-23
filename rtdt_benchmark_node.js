'use strict';
/* RtDt reproducible end-to-end benchmark harness.
 * Timing includes fresh Node process startup, scene I/O, raytracing and encoding.
 * Results are descriptive; no cross-machine speed claims or time thresholds.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DEFAULT_PROFILE_FILE = path.join(ROOT,'benchmarks','profiles.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT,'benchmarks','results');

function parse_arguments(argv) {

    const options = {profile:'all',iterations:5,warmups:1,
        outputDir:DEFAULT_OUTPUT_DIR,list:false,help:false};
    for (let index=0;index<argv.length;index++) {

        const arg = argv[index];
        if (arg === '--list') options.list = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (['--profile','--iterations','--warmups','--output-dir'].includes(arg)) {

            if (index+1 >= argv.length) throw new Error(arg+' requires a value');
            const key = {'--profile':'profile','--iterations':'iterations',
                '--warmups':'warmups','--output-dir':'outputDir'}[arg];
            options[key] = argv[++index];
        } else {

            throw new Error('Unknown benchmark argument: '+arg);
        }
    }
    options.iterations = Number(options.iterations);
    options.warmups = Number(options.warmups);
    if (!Number.isInteger(options.iterations) ||
        options.iterations < 1 || options.iterations > 30)
        throw new Error('--iterations must be an integer from 1 to 30');
    if (!Number.isInteger(options.warmups) ||
        options.warmups < 0 || options.warmups > 10)
        throw new Error('--warmups must be an integer from 0 to 10');
    return options;
}

function safe_input_file(relative) {

    if (typeof relative !== 'string' ||
        !/^samples\/[A-Za-z0-9_\-/]+\.(?:scene|phy)$/.test(relative) ||
        relative.split('/').includes('..'))
        throw new Error('Benchmark input must be a checked-in samples scene or .phy');
    const absolute = path.resolve(ROOT,relative);
    const rel = path.relative(ROOT,absolute);
    if (rel.startsWith('..') || path.isAbsolute(rel))
        throw new Error('Benchmark input escapes repository');
    return absolute;
}

function read_profiles(filename) {

    const doc = JSON.parse(fs.readFileSync(filename,'utf8'));
    if (doc.version !== 1 || !Array.isArray(doc.profiles) ||
        !doc.profiles.length)
        throw new Error('Expected benchmark profile collection version 1');
    const known = new Set();
    for (const item of doc.profiles) {

        if (!item || !/^[a-z][a-z0-9-]{1,40}$/.test(item.id) ||
            known.has(item.id))
            throw new Error('Invalid or duplicate benchmark profile ID');
        known.add(item.id);
        safe_input_file(item.scene);
        if (item.phy) safe_input_file(item.phy);
        if (!Number.isInteger(item.width) || item.width < 1 ||
            !Number.isInteger(item.height) || item.height < 1 ||
            item.width*item.height > 4000000 ||
            !Number.isInteger(item.quality) || item.quality < 1 ||
            item.quality > 20)
            throw new Error('Invalid benchmark render settings for '+item.id);
        if (item.mode !== 'still' && item.mode !== 'animation')
            throw new Error('Unknown benchmark mode: '+item.id);
        if (item.mode === 'animation') {

            if (!item.phy || !item.frames ||
                !Number.isInteger(item.frames.start) ||
                !Number.isInteger(item.frames.end) ||
                item.frames.start < 0 ||
                item.frames.end < item.frames.start ||
                item.frames.end-item.frames.start+1 > 240 ||
                typeof item.fps !== 'number' || !Number.isFinite(item.fps) ||
                item.fps <= 0 || item.fps > 240)
                throw new Error('Invalid animation benchmark profile: '+item.id);
        }
    }
    return doc.profiles;
}

function median(values) {

    const sorted = values.slice().sort(function (a,b) {

        return a-b;
    });
    const middle = Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[middle] :
        (sorted[middle-1]+sorted[middle])/2;
}

function quantile(values,fraction) {

    const sorted = values.slice().sort(function (a,b) {

        return a-b;
    });
    if (sorted.length===1) return sorted[0];
    const position = (sorted.length-1)*fraction;
    const before = Math.floor(position), after = Math.ceil(position);
    return sorted[before]+(sorted[after]-sorted[before])*(position-before);
}

function file_hash(filename) {

    return crypto.createHash('sha256')
        .update(fs.readFileSync(filename)).digest('hex');
}

function prepare_job(profile,workingDir) {

    const sceneTarget = path.join(workingDir,'scene.scene');
    fs.copyFileSync(safe_input_file(profile.scene),sceneTarget);
    const job = {version:1,name:'Benchmark '+profile.id,scene:'scene.scene',
        render:{width:profile.width,height:profile.height,
            quality:profile.quality},output:{
            destination:profile.mode==='still'?'file':'zip',
            path:profile.mode==='still'?'output.png':'output.zip',
            format:'png'
        }};
    if (profile.phy) {

        fs.copyFileSync(safe_input_file(profile.phy),
            path.join(workingDir,'motion.phy'));
        job.phy = 'motion.phy';
    }
    if (profile.mode==='animation') {

        job.render.fps = profile.fps;
        job.render.frames = {start:profile.frames.start,end:profile.frames.end};
    }
    fs.writeFileSync(path.join(workingDir,'job.rdt'),
        JSON.stringify(job,null,2)+'\n');
    return {jobPath:path.join(workingDir,'job.rdt'),
        outputPath:path.join(workingDir,job.output.path),
        count:profile.mode==='animation' ?
            profile.frames.end-profile.frames.start+1 : 1};
}

function run_trial(profile,workDir) {

    const job = prepare_job(profile,workDir);
    try {

        fs.rmSync(job.outputPath,{force:true});
        const start = process.hrtime.bigint();
        const child = cp.spawnSync(process.execPath,
            [path.join(ROOT,'cli.js'),'--job',job.jobPath],{
                cwd:workDir,encoding:'utf8',timeout:180000,
                maxBuffer:2*1024*1024,
                env:Object.assign({},process.env,{DEBUG:''})
            });
        const elapsedMs = Number(process.hrtime.bigint()-start)/1e6;
        if (child.error || child.status!==0)
            throw new Error('Benchmark '+profile.id+' failed: '+
                (child.error ? child.error.message : (child.stderr || child.stdout).slice(-1000)));
        if (!fs.existsSync(job.outputPath))
            throw new Error('Benchmark '+profile.id+' did not produce the expected output');
        return {elapsedMs:elapsedMs,sha256:file_hash(job.outputPath),
            outputBytes:fs.statSync(job.outputPath).size,
            pixelFrames:profile.width*profile.height*job.count,
            frameCount:job.count};
    } finally {

        // Files stay isolated to the trial directory and are removed by caller.
    }
}

function run_profile(profile,options) {

    const trialDir = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-benchmark-'));
    try {

        const timings = [], hashes = new Set();
        let latest = null;
        for (let index=0;index<options.warmups+options.iterations;index++) {

            const trial = run_trial(profile,trialDir);
            if (index>=options.warmups) {

                latest = trial;
                timings.push(trial.elapsedMs);
                hashes.add(trial.sha256);
            }
        }
        if (hashes.size!==1)
            throw new Error('Benchmark '+profile.id+' produced inconsistent output checksums');
        const medianMs = median(timings);
        return {id:profile.id,label:profile.label,mode:profile.mode,
            scene:profile.scene,phy:profile.phy || null,
            features:profile.features || [],
            width:profile.width,height:profile.height,
            quality:profile.quality,fps:profile.fps || null,
            frames:profile.frames || null,frameCount:latest.frameCount,
            iterations:options.iterations,warmups:options.warmups,
            samplesMs:timings,medianMs:medianMs,
            minMs:Math.min.apply(null,timings),
            maxMs:Math.max.apply(null,timings),
            p25Ms:quantile(timings,0.25),p75Ms:quantile(timings,0.75),
            pixelsPerSecond:Math.round(latest.pixelFrames/(medianMs/1000)),
            framesPerSecond:latest.frameCount/(medianMs/1000),
            sha256:latest.sha256,outputBytes:latest.outputBytes};
    } finally {

        fs.rmSync(trialDir,{recursive:true,force:true});
    }
}

function csv_cell(value) {

    const text = value===null || value===undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ?
        '"'+text.replace(/"/g,'""')+'"' : text;
}

function write_reports(outputDir,report) {

    fs.mkdirSync(outputDir,{recursive:true});
    const jsonPath = path.join(outputDir,'benchmark-results.json');
    const csvPath = path.join(outputDir,'benchmark-results.csv');
    fs.writeFileSync(jsonPath,JSON.stringify(report,null,2)+'\n');
    const columns = ['id','label','mode','scene','width','height','quality',
        'frameCount','iterations','warmups','medianMs','minMs','maxMs',
        'p25Ms','p75Ms','pixelsPerSecond','framesPerSecond','sha256','outputBytes'];
    const lines = [columns.join(',')];
    for (const item of report.results) {

        lines.push(columns.map(function (column) {

            return csv_cell(item[column]);
        }).join(','));
    }
    fs.writeFileSync(csvPath,lines.join('\n')+'\n');
    return {jsonPath:jsonPath,csvPath:csvPath};
}

function main(argv) {

    const options = parse_arguments(argv);
    if (options.help) {

        console.log('Usage: node rtdt_benchmark_node.js '+
            '[--profile ID|all] [--iterations 1..30] [--warmups 0..10] '+
            '[--output-dir DIR] [--list]');
        return null;
    }
    const profiles = read_profiles(DEFAULT_PROFILE_FILE);
    if (options.list) {

        profiles.forEach(function (profile) {

            console.log(profile.id+' — '+profile.label);
        });
        return null;
    }
    const selected = options.profile==='all' ? profiles :
        profiles.filter(function (item) {

            return item.id===options.profile;
        });
    if (!selected.length)
        throw new Error('Unknown benchmark profile: '+options.profile);
    const git = cp.spawnSync('git',['rev-parse','HEAD'],{
        cwd:ROOT,encoding:'utf8',timeout:5000
    });
    const report = {schemaVersion:1,benchmarkType:'end-to-end CLI job',
        measurement:'wall clock including fresh Node startup, input loading, render and PNG/ZIP output',
        disclaimer:'Not render-only throughput; compare scores only on equivalent hardware and settings.',
        timestampUtc:new Date().toISOString(),
        revision:git.status===0 ? git.stdout.trim() : (process.env.GITHUB_SHA || null),
        environment:{node:process.version,platform:process.platform,
            arch:process.arch,cpus:os.cpus().length,
            cpuModel:os.cpus()[0] ? os.cpus()[0].model : 'unknown',
            totalMemoryBytes:os.totalmem()},
        results:[]};
    for (const profile of selected) {

        const result = run_profile(profile,options);
        report.results.push(result);
        console.log(profile.id+': median '+result.medianMs.toFixed(2)+
            ' ms ('+result.pixelsPerSecond+' output pixels/s, '+
            result.iterations+' measured runs)');
    }
    const locations = write_reports(path.resolve(options.outputDir),report);
    console.log('JSON: '+locations.jsonPath);
    console.log('CSV:  '+locations.csvPath);
    return report;
}

if (require.main===module) {

    try {

        main(process.argv.slice(2));
    } catch (error) {

        console.error('Benchmark failed: '+error.message);
        process.exitCode = 1;
    }
}

module.exports = {main:main,parse_arguments:parse_arguments,
    read_profiles:read_profiles,run_profile:run_profile,
    median:median,quantile:quantile,write_reports:write_reports};
