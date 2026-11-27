'use strict';
/* Node preflight for .rdt packs. Uses the common grammar; no render/transformer logic. */
const fs = require('node:fs');
const path = require('node:path');
const rtdt_pack = require('./rtdt_pack');
const rtdt_scene_format = require('./rtdt_scene_format');

function inside_directory(root,filename) {

    const relative = path.relative(root,filename);
    return relative !== '..' && !relative.startsWith('..'+path.sep) &&
        !path.isAbsolute(relative);
}

function lint_file(filename) {

    const errors = [], warnings = [], checked = new Set();
    const resolvedPaths = Object.create(null);
    let registryRoots = [];
    const packFile = path.resolve(filename);
    const root = path.dirname(packFile);

    function add_issue(list,message) {

        list.push(message);
    }

    function check_reference(reference,kind,required,baseDir) {

        let relative;
        try {

            relative = rtdt_pack.safe_path(reference,kind);
        } catch (error) {

            add_issue(errors,error.message+' ('+reference+')');
            return null;
        }
        const candidates=[path.resolve(baseDir,relative)];
        for(const registryRoot of registryRoots)
            candidates.push(path.resolve(root,registryRoot,relative));
        const absolute=candidates.find(function(candidate) {

            return inside_directory(root,candidate) && fs.existsSync(candidate);
        });
        if(!absolute) {

            add_issue(required ? errors : warnings,
                (required ? 'Required' : 'Optional')+' '+kind+
                ' file not found in pack or registries: '+reference);
            return null;
        }
        const realRoot = fs.realpathSync(root);
        const realFile = fs.realpathSync(absolute);
        if (!inside_directory(realRoot,realFile)) {

            add_issue(errors,'Asset symlink escapes pack directory: '+reference);
            return null;
        }
        if (!fs.statSync(absolute).isFile()) {

            add_issue(errors,'Expected a regular file: '+reference);
            return null;
        }
        checked.add(path.relative(root,absolute).replace(/\\/g,'/'));
        resolvedPaths[kind+':'+reference]=absolute;
        return absolute;
    }

    function check_phy(filename) {

        if (!filename) return;
        try {

            const source = fs.readFileSync(filename,'utf8');
            const model = rtdt_scene_format.parse(source);
            if (!model || model.version !== 1 || !Array.isArray(model.objects))
                throw new Error('Expected AetherOre v1 with an objects array');
        } catch (error) {

            add_issue(errors,'Invalid .phy '+path.relative(root,filename)+': '+
                error.message);
        }
    }

    let pack = null;
    try {

        const source = fs.readFileSync(packFile,'utf8');
        if (!/\.rdt$/i.test(packFile))
            throw new Error('Pack filename must end with .rdt');
        pack = rtdt_pack.parse(source);
        registryRoots=pack.registries || [];
        const sceneFile = check_reference(pack.scene,'scene',true,root);
        const phyFile = pack.phy ?
            check_reference(pack.phy,'animation',true,root) : null;
        check_phy(phyFile);

        for (const entry of pack.assets) {

            const found = check_reference(entry.path,entry.kind,entry.required,root);
            if (entry.kind === 'animation' && found) check_phy(found);
        }
        if (sceneFile) {

            try {

                const scene = rtdt_scene_format.parse(fs.readFileSync(sceneFile,'utf8'));
                if (!scene || scene.version !== 1 || !Array.isArray(scene.objects))
                    throw new Error('Expected scene v1 with objects array');
                const sceneBase = path.dirname(sceneFile);

                function inspect_asset(kind,value,target) {

                    if (value === undefined || value === null) return;
                    const entries = Array.isArray(value) ? value : [value];
                    for (const item of entries) {

                        const declared = typeof item === 'string' ? {path:item} : item;
                        if (!declared || typeof declared.path !== 'string') {

                            add_issue(errors,'Invalid scene '+kind+' asset declaration');
                            continue;
                        }
                        const found = check_reference(declared.path,kind,
                            declared.required !== false,sceneBase);
                        if (kind === 'animation' && found) check_phy(found);
                    }
                }
                const sceneAssets = scene.assets || {};
                inspect_asset('mesh',sceneAssets.mesh);
                inspect_asset('texture',sceneAssets.texture);
                inspect_asset('animation',sceneAssets.animation);
                for (const object of scene.objects) {

                    if (!object || typeof object !== 'object') continue;
                    if (object.mesh)
                        inspect_asset('mesh',object.mesh);
                    if (object.texture)
                        inspect_asset('texture',object.texture);
                }
            } catch (error) {

                add_issue(errors,'Invalid scene '+path.relative(root,sceneFile)+': '+
                    error.message);
            }
        }
        if (pack.render.frames && !pack.phy &&
            !checked.has(pack.scene)) {

            add_issue(warnings,'Batch job has no explicit .phy; '+
                'verify that the scene declares an animation');
        }
    } catch (error) {

        add_issue(errors,error.message);
    }
    return {valid:errors.length === 0,pack:pack,errors:errors,
        warnings:warnings,checked:Array.from(checked).sort(),resolved:resolvedPaths};
}

function print_report(filename) {

    const report = lint_file(filename);
    console.log('RtDt pack preflight: '+filename);
    report.checked.forEach(function (filename) {

        console.log('  ✓ '+filename);
    });
    report.warnings.forEach(function (message) {

        console.warn('  warning: '+message);
    });
    report.errors.forEach(function (message) {

        console.error('  error: '+message);
    });
    console.log(report.valid ? 'Pack is structurally valid.' :
        'Pack validation failed ('+report.errors.length+' error(s)).');
    return report.valid;
}

if (require.main === module) {

    if (process.argv.length !== 3) {

        console.error('Usage: node rtdt_pack_lint_node.js <pack.rdt>');
        process.exitCode = 2;
    } else if (!print_report(process.argv[2])) {

        process.exitCode = 1;
    }
}

module.exports = {lint_file:lint_file,print_report:print_report};
