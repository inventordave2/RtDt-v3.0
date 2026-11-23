#!/usr/bin/env node
// cli.js - Main CLI entry point for RTDT raytracer
// Loads all modules in correct dependency order, then handles CLI rendering

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const imageIO = require('./rtdt_image_io_node');
const sceneAssetNode = require('./rtdt_scene_assets_node');
const colourIO = require('./rtdt_colour');

// ============================================================================
// MODULE LOADING
// ============================================================================

function loadScript(filePath) {

	try {
	
		let code = fs.readFileSync(filePath, 'utf8');
		
		// For rtdt_objfile-node.js, we need to strip the require() calls
		// since we're running in a different context
		if (filePath.includes('rtdt_objfile-node')) {
		
			// Replace require() calls with references to outer scope
			code = code.replace(/const fs = require\('fs'\);/g, '');
			code = code.replace(/const path = require\('path'\);/g, '');
			// fs and path are available in outer scope already
		}
		
		vm.runInThisContext(code);
	} catch (e) {
	
		console.error('✗ Failed to load ' + path.basename(filePath) + ':');
		console.error('  ' + e.message);
		process.exit(1);
	}
}

// Prevent browser APIs
if (typeof window !== 'undefined') {

	throw new Error('This CLI should not run in a browser');
}

const repoRoot = __dirname;

// Load in CORRECT dependency order
try {

	loadScript(path.join(repoRoot, 'rtdt_math.js'));
	loadScript(path.join(repoRoot, 'rtdt_core.js'));
	loadScript(path.join(repoRoot, 'rtdt_matrix-transform.js')); // Load first - provides multiply_matrix_by_tuple
	loadScript(path.join(repoRoot, 'rtdt_matrix.js'));        // Depends on rtdt_matrix-transform
	loadScript(path.join(repoRoot, 'rtdt_ray.js'));
	loadScript(path.join(repoRoot, 'rtdt_light.js'));
	loadScript(path.join(repoRoot, 'rtdt_material.js'));
	loadScript(path.join(repoRoot, 'rtdt_world.js'));
	loadScript(path.join(repoRoot, 'rtdt_shade.js'));
	loadScript(path.join(repoRoot, 'rtdt_p+e.js'));
	loadScript(path.join(repoRoot, 'rtdt_pattern.js'));
	loadScript(path.join(repoRoot, 'rtdt_examples.js'));
	loadScript(path.join(repoRoot, 'raytracer-core.js'));
	loadScript(path.join(repoRoot, 'rtdt_render_core.js'));
    global.rtdt_colour = colourIO;
    loadScript(path.join(repoRoot, 'rtdt_png.js'));
    loadScript(path.join(repoRoot, 'rtdt_ppm.js'));
    loadScript(path.join(repoRoot, 'rtdt_animation_export.js'));
    loadScript(path.join(repoRoot, 'rtdt_animation_destination.js'));
    loadScript(path.join(repoRoot, 'rtdt_animation_batch.js'));
    loadScript(path.join(repoRoot, 'rtdt_job.js'));

	loadScript(path.join(repoRoot, 'rtdt_scene_assets.js'));
	loadScript(path.join(repoRoot, 'rtdt_scene_format.js'));
	loadScript(path.join(repoRoot, 'rtdt_scene_browser.js'));
	loadScript(path.join(repoRoot, 'rtdt_image_io_browser.js'));
	loadScript(path.join(repoRoot, 'rtdt_objfile-node.js'));
	loadScript(path.join(repoRoot, 'rtdt_ap_math.js'));
	loadScript(path.join(repoRoot, 'rtdt_aetherore.js'));
    loadScript(path.join(repoRoot, 'rtdt_flightpath.js'));
    loadScript(path.join(repoRoot, 'rtdt_mandelbrot.js'));
    loadScript(path.join(repoRoot, 'rtdt_metal_surfaces.js'));
	
	// Create scenes object from loaded functions
	if (typeof global.scenes === 'undefined') {
	
		global.scenes = {
		
			scene1: typeof scene1 === 'function' ? scene1 : undefined,
			scene2: typeof scene2 === 'function' ? scene2 : undefined,
			scene3: typeof scene3 === 'function' ? scene3 : undefined,
			mySkyBox: typeof mySkyBox === 'function' ? mySkyBox : undefined,
			earth: typeof earth === 'function' ? earth : undefined,
			cm_cube: typeof cm_cube === 'function' ? cm_cube : undefined,
			endGame: typeof endGame === 'function' ? endGame : undefined
		};
	}
	
	// Provide stub functions for browser-only APIs
	if (typeof prepCanvas === 'undefined') {
	
		global.prepCanvas = function() { /* no-op for CLI */ };
	}
	if (typeof renderImage === 'undefined') {
	
		global.renderImage = function() { /* no-op for CLI - use renderSceneSync instead */ };
	}

} catch (e) {

	console.error('Failed to load modules: ' + e.message);
	process.exit(1);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

// Global config
const cliConfig = {

	sceneName: 'scene1',
    sceneFile: null,
    jobFile: null,
    batchFps: null,
	width: 500,
	height: 281,
	outputFile: 'render.png',
	outputExplicit: false,
	outputDir: null,
	format: null,
	jpegQuality: 85,
	bmpPalette: 'rgb24',
	quality: 1,
	phyFile: null,
	phyTime: null,
	phyFrame: null,
    batch: false,
    destination: 'zip',
    startFrame: 0,
    endFrame: null,
    zipFile: 'renders/animation.zip',
	verbose: true
};

function printHelp() {

	console.log(`
RTDT Ray Tracer - Command Line Interface

USAGE:
  rtdt [OPTIONS]
  node cli.js [OPTIONS]

OPTIONS:
  --scene NAME        Built-in scene name (default: scene1)
  --scene-file FILE   JSON/YAML v1 .scene/.scene.yaml file and assets
  --job FILE          Execute a validated .rdt v1 pack manifest
  --lint-pack FILE   Validate a .rdt pack and all referenced files without rendering
  --phy FILE          Load .phy animation file (JSON version 1)
  --time SECONDS      Evaluate .phy at time t
  --frame INDEX       Evaluate .phy at frame INDEX (using timeline fps)
  --batch             Render a complete range of .phy animation frames
  --start-frame N     First batch frame, inclusive (default 0)
  --end-frame N       Last batch frame, inclusive (default duration * fps - 1)
  --destination TYPE  zip, folder, google-drive, dropbox or onedrive (default zip)
  --output-dir DIR    Local folder or remote cloud folder for batch output
  auth login PROVIDER  Authorise Google Drive, Dropbox or OneDrive
  auth status          Show cached cloud connections
  auth logout PROVIDER Disconnect a cloud provider
  --zip-file FILE     Output ZIP file (default renders/animation.zip)
  --width NUM         Image width in pixels (default: 500)
  --height NUM        Image height in pixels (default: 281; shortcut -H)
  --output FILE       Output filename (default: render.png)
  --format FORMAT     png, jpg, jpeg, bmp, ppm (otherwise inferred from extension)
  --jpeg-quality N    JPEG compression quality 1..100 (default: 85)
  --bmp-palette NAME  rgb24, ansi256, c64, ansi16, html (default: rgb24)
  --output-dir DIR    Create output directory automatically
  --quality NUM       Render quality/samples (default: 1)
  --help              Show this help message
  --list-scenes       List available scenes

EXAMPLES:
  # Render default scene
  rtdt

  # Render scene1 at 900x550
  rtdt --scene scene1 --width 900 --height 550

  # Small preview render
  rtdt --scene scene1 --width 150 --height 84 --output preview.png

  # Animate the first scene object at t = 1.5 seconds
  rtdt --scene scene1 --phy motion.phy --time 1.5

  # High quality render (more samples)
  rtdt --scene scene1 --quality 3 --output hires.jpg

AVAILABLE SCENES:
  scene1              Default scene with primitives
  mySkyBox            Sky box scene
  earth               Earth scene
  cm_cube             Cube scene
  endGame             End game scene

NOTES:
  - Output bytes match filename extension: PNG, JPEG, BMP or legacy P3 PPM
  - BMP palettes: 24-bit RGB, 8-bit ANSI256, 4-bit C64/ANSI16, 8-bit HTML names
  - JPEG requires the jpeg-js npm package (installed by npm install)
  - Rendering is synchronous and may take time for high resolutions

For interactive rendering, see webapp.html

`);
}

function listScenes() {

	if (typeof scenes === 'undefined' || typeof scenes !== 'object') {
	
		console.error('Scenes not loaded');
		process.exit(1);
	}
	
	const sceneList = Object.keys(scenes).sort();
	if (sceneList.length === 0) {
	
		console.error('No scenes available');
		process.exit(1);
	}
	
	console.log('Available scenes:\n');
	sceneList.forEach(function (name) {
	
		console.log('  ' + name);
	});
	console.log('');
}

function parseArguments(argv) {

	for (let i = 2; i < argv.length; i++) {
	
		const arg = argv[i];
		
		if (arg === '--help' || arg === '-h') {
		
			printHelp();
			process.exit(0);
		}
		else if (arg === '--list-scenes') {
		
			listScenes();
			process.exit(0);
		}
		else if (arg === '--scene' || arg === '-s') {
		
			if (i + 1 >= argv.length) {
			
				console.error('Error: --scene requires a value');
				process.exit(1);
			}
			cliConfig.sceneName = argv[++i];
            if (/(?:\.scene(?:\.ya?ml)?|\.ya?ml)$/i.test(cliConfig.sceneName)) {

                cliConfig.sceneFile = cliConfig.sceneName;
            }
		}
        else if (arg === '--job') {

            if (i + 1 >= argv.length)
                throw new Error('--job requires a .rdt filename');
            cliConfig.jobFile = argv[++i];
        }
        else if (arg === '--batch') {

            cliConfig.batch = true;
        }
        else if (arg === '--start-frame' || arg === '--end-frame') {

            if (i + 1 >= argv.length) throw new Error(arg + ' needs an integer');
            var frameValue = Number(argv[++i]);
            if (!Number.isInteger(frameValue) || frameValue < 0)
                throw new Error(arg + ' requires a nonnegative integer');
            if (arg === '--start-frame') cliConfig.startFrame = frameValue;
            else cliConfig.endFrame = frameValue;
        }
        else if (arg === '--destination') {

            if (i + 1 >= argv.length) throw new Error('--destination requires a provider');
            cliConfig.destination = argv[++i];
            if (['zip','folder','google-drive','dropbox','onedrive'].indexOf(cliConfig.destination) < 0)
                throw new Error('Destination must be zip, folder, google-drive, dropbox or onedrive');
        }
        else if (arg === '--zip-file') {

            if (i + 1 >= argv.length) throw new Error('--zip-file requires a filename');
            cliConfig.zipFile = argv[++i];
        }
		else if (arg === '--scene-file') {

            if (i + 1 >= argv.length) throw new Error('--scene-file requires a path');
            cliConfig.sceneFile = argv[++i];
        }
		else if (arg === '--phy' || arg === '--time' || arg === '--frame') {
		
			if (i + 1 >= argv.length)
				throw new Error(arg + ' requires a value');
			var raw = argv[++i];
			if (arg === '--phy')
				cliConfig.phyFile = raw;
			else {

				var value = Number(raw);
				if (!isFinite(value) || value < 0 ||
					(arg === '--frame' && Math.floor(value) !== value))
					throw new Error(arg + ' requires a nonnegative ' +
						(arg === '--frame' ? 'integer' : 'number'));
				if (arg === '--time') cliConfig.phyTime = value;
				else cliConfig.phyFrame = value;
			}
		}
		else if (arg === '--width' || arg === '-w') {
		
			if (i + 1 >= argv.length) {
			
				console.error('Error: --width requires a value');
				process.exit(1);
			}
			const w = Number(argv[++i]);
			if (!Number.isInteger(w) || w < 1 || w > 4096) {
			
				console.error('Error: width must be a positive integer');
				process.exit(1);
			}
			cliConfig.width = w;
		}
		else if (arg === '--height' || arg === '-H') {
		
			if (i + 1 >= argv.length) {
			
				console.error('Error: --height requires a value');
				process.exit(1);
			}
			const h = Number(argv[++i]);
			if (!Number.isInteger(h) || h < 1 || h > 4096) {
			
				console.error('Error: height must be a positive integer');
				process.exit(1);
			}
			cliConfig.height = h;
		}
		else if (arg === '--output' || arg === '-o') {
		
			if (i + 1 >= argv.length) {
			
				console.error('Error: --output requires a value');
				process.exit(1);
			}
			cliConfig.outputFile = argv[++i];
			cliConfig.outputExplicit = true;
		}
		else if (arg === '--format' || arg === '-f') {

            if (i + 1 >= argv.length) throw new Error('--format requires png, jpeg, bmp or ppm');
            var format = String(argv[++i]).toLowerCase().replace(/^\\./,'');
            if (['png','jpg','jpeg','bmp','ppm'].indexOf(format) < 0)
                throw new Error('Unsupported image format: ' + format);
            cliConfig.format = format;
        }
        else if (arg === '--jpeg-quality') {

            if (i + 1 >= argv.length) throw new Error('--jpeg-quality requires a number');
            var jpegQuality = Number(argv[++i]);
            if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100)
                throw new Error('JPEG quality must be an integer from 1 to 100');
            cliConfig.jpegQuality = jpegQuality;
        }
        else if (arg === '--bmp-palette') {

            if (i + 1 >= argv.length) throw new Error('--bmp-palette requires a value');
            var palette = String(argv[++i]).toLowerCase();
            if (['rgb24','ansi256','c64','ansi16','vt100','html'].indexOf(palette) < 0)
                throw new Error('Unknown BMP palette: '+palette);
            cliConfig.bmpPalette = palette === 'vt100' ? 'ansi16' : palette;
        }
        else if (arg === '--output-dir') {

            if (i + 1 >= argv.length) throw new Error('--output-dir requires a directory');
            cliConfig.outputDir = argv[++i];
            if (!cliConfig.outputDir.trim()) throw new Error('--output-dir cannot be blank');
        }
        else if (arg === '--quality' || arg === '-q') {
		
			if (i + 1 >= argv.length) {
			
				console.error('Error: --quality requires a value');
				process.exit(1);
			}
			const q = Number(argv[++i]);
			if (!Number.isInteger(q) || q < 1 || q > 20) {
			
				console.error('Error: quality must be a positive integer');
				process.exit(1);
			}
			cliConfig.quality = q;
		}
		else {
		
			console.error('Error: unknown option: ' + arg);
			console.error('Use --help for usage information');
			process.exit(1);
		}
	}
}

function configure_job() {

    if (!cliConfig.jobFile) return;
    var report = require('./rtdt_pack_lint_node').lint_file(cliConfig.jobFile);
    if (!report.valid)
        throw new Error('Invalid .rdt pack: '+report.errors.join('; '));
    var pack = report.pack;
    var base = path.dirname(path.resolve(cliConfig.jobFile));
    cliConfig.sceneFile = path.join(base,pack.scene);
    cliConfig.phyFile = pack.phy ? path.join(base,pack.phy) : null;
    cliConfig.width = pack.render.width;
    cliConfig.height = pack.render.height;
    cliConfig.quality = pack.render.quality;
    cliConfig.batchFps = pack.render.fps || null;
    cliConfig.batch = !!pack.render.frames;
    cliConfig.format = pack.output.format;
    if (cliConfig.batch) {

        cliConfig.startFrame = pack.render.frames.start;
        cliConfig.endFrame = pack.render.frames.end;
        cliConfig.destination = pack.output.destination;
        if (pack.output.destination === 'zip')
            cliConfig.zipFile = path.join(base,pack.output.path);
        else if (['google-drive','dropbox','onedrive'].includes(pack.output.destination))
            cliConfig.outputDir = pack.output.path;
        else
            cliConfig.outputDir = path.join(base,pack.output.path);
    } else {

        cliConfig.outputFile = path.join(base,pack.output.path);
        cliConfig.outputExplicit = true;
    }
    log('RtDt pack: '+(pack.name || path.basename(cliConfig.jobFile)));
}

function log(message) {

	if (cliConfig.verbose) {
	
		console.log(message);
	}
}

async function renderScene() {

	try {
	
		log('Resolution: ' + cliConfig.width + 'x' + cliConfig.height);
		log('Quality: ' + cliConfig.quality);
		log('');
		
		// Set rendering dimensions
		WIDTH = cliConfig.width;
		HEIGHT = cliConfig.height;
		
		// Initialize raytracer
		initRaytracer(WIDTH, HEIGHT);
		
        var declaredPhySource = null;
        var batchAnimator = null, batchModel = null;
		// Both frontends use the same declarative loader and asset model.
        if (cliConfig.sceneFile) {

            const sceneFile = path.resolve(cliConfig.sceneFile);
            const model = rtdt_scene_browser.parse(fs.readFileSync(sceneFile,'utf8'));
            const resolved = sceneAssetNode.resolve(
                model,sceneFile,repoRoot,rtdt_scene_assets,rtdt_image_io_browser);
            rtdt_scene_browser.load(model,WIDTH,HEIGHT,resolved);
            for (const entry of resolved.entries) {

                if (entry.kind === 'phy' && !declaredPhySource && resolved.files['phy:'+entry.path])
                    declaredPhySource = {source:resolved.files['phy:'+entry.path],path:entry.path};

                if (entry.kind === 'image' && resolved.files['image:'+entry.path])
                    RtDtState.scene.PPM[entry.path] = resolved.files['image:'+entry.path];
            }
        } else {

            if (typeof scenes === 'undefined' || typeof scenes[cliConfig.sceneName] !== 'function') {

                const available = typeof scenes === 'object' ? Object.keys(scenes).join(', ') : 'none';
                throw new Error('Scene not found: ' + cliConfig.sceneName + '. Available: ' + available);
            }
            scenes[cliConfig.sceneName]();
        }
		
		// RtDtState.scene.o should now contain the scene
		if (!RtDtState.scene.o || !RtDtState.scene.o.s) {
		
			throw new Error('Scene did not populate scene data');
		}
		
		// Optional AetherOre animation: numeric string indices ("0", "1", ...)
		// refer to the top-level objects in RtDtState.scene.o.s.
		if (cliConfig.phyFile || declaredPhySource) {
		
			if (cliConfig.phyFile && !/\.phy$/i.test(cliConfig.phyFile))
				throw new Error('Expected a .phy animation file');
			var phy = rtdt_aetherore.parse_phy(cliConfig.phyFile ?
                fs.readFileSync(cliConfig.phyFile, 'utf8') : declaredPhySource.source);
			var bindings = rtdt_job.animation_bindings(RtDtState.scene);
			if (cliConfig.phyFrame !== null && cliConfig.phyTime !== null)
				throw new Error('Choose either --time or --frame, not both');
			var fps = phy.timeline && phy.timeline.fps || 30;
			var t = cliConfig.phyTime !== null ? cliConfig.phyTime :
				(cliConfig.phyFrame !== null ? cliConfig.phyFrame / fps : 0);
			batchAnimator = rtdt_aetherore.create_animator(phy, bindings);
            batchModel = phy;
            batchAnimator.at(t);
			log('AetherOre: ' + (cliConfig.phyFile || declaredPhySource.path) + ' at t=' + t + 's');
		}
		else if (cliConfig.phyTime !== null || cliConfig.phyFrame !== null)
			throw new Error('--time/--frame requires --phy');
		
        if (cliConfig.batch) {

            if (!batchModel || !batchAnimator)
                throw new Error('--batch requires a scene animation or --phy FILE');
            if (cliConfig.phyFrame !== null || cliConfig.phyTime !== null)
                throw new Error('Batch range uses --start-frame and --end-frame, not --time/--frame');
            var frameRate = cliConfig.batchFps || (batchModel.timeline && batchModel.timeline.fps) || 24;
            var endFrame = cliConfig.endFrame === null ?
                Math.round((batchModel.timeline && batchModel.timeline.duration || 0) * frameRate) - 1 :
                cliConfig.endFrame;
            var cloudSelected = ['google-drive','dropbox','onedrive'].includes(cliConfig.destination);
            var outDir = cliConfig.outputDir || (cloudSelected ?
                'RtDt/Animation' : 'renders/animation');
            var remoteWriter = cloudSelected ?
                await require('./rtdt_cloud_storage_node').create_writer(
                    cliConfig.destination,outDir) : null;
            var sink = rtdt_animation_destination.create({
                kind:cloudSelected ? 'folder' : cliConfig.destination,
                write_file:function (name,bytes) {

                    if (remoteWriter) return remoteWriter(name,bytes);
                    fs.mkdirSync(outDir,{recursive:true});
                    fs.writeFileSync(path.join(outDir,name),Buffer.from(bytes));
                },
                output_archive:function (bytes) {

                    var destinationFile = path.resolve(cliConfig.zipFile);
                    fs.mkdirSync(path.dirname(destinationFile),{recursive:true});
                    fs.writeFileSync(destinationFile,Buffer.from(bytes));
                    log('ZIP written: '+destinationFile);
                }
            });
            return rtdt_job.render_animation({
                sink:sink,animator:batchAnimator,sceneState:RtDtState.scene,
                fps:frameRate,width:cliConfig.width,height:cliConfig.height,
                quality:cliConfig.quality,
                startFrame:cliConfig.startFrame,endFrame:endFrame,
                on_progress:function (done,total) {

                    if (done === 1 || done % 24 === 0 || done === total)
                        log('Animation frames: '+done+'/'+total);
                }
            }).then(function (result) {

                log('AetherOre batch completed: '+result.manifest.frames.length+' frames');
            });
        }

		// Render synchronously through the shared job executor
		const startTime = Date.now();
		const pixels = rtdt_job.render_still({sceneState:RtDtState.scene,
            width:cliConfig.width,height:cliConfig.height,quality:cliConfig.quality});
		const elapsed = (Date.now() - startTime) / 1000;
		
		log('Render completed in ' + elapsed.toFixed(2) + ' seconds');
		log('');
		
		// Convert pixels to PPM and write file
		writeRenderImage(cliConfig.outputFile, pixels);
		
	} catch (e) {
	
		console.error('Error during rendering:');
		console.error('  ' + e.message);
		if (process.env.DEBUG) {
		
			console.error(e.stack);
		}
		process.exit(1);
	}
}

function writeRenderImage(filename, pixels) {

    if (!pixels || pixels.length !== WIDTH * HEIGHT)
        throw new Error('No pixels or pixel count mismatch');

    var format = cliConfig.format, target = filename;
    var canonical = function (name) { return name === 'jpeg' ? 'jpg' : name; };
    if (format && !cliConfig.outputExplicit)
        target = 'render.' + canonical(format);
    else if (format && canonical(imageIO.inferFormat(target)) !== canonical(format))
        throw new Error('--format conflicts with --output filename: ' + target);
    if (cliConfig.outputDir)
        target = path.join(cliConfig.outputDir, path.basename(target));

    var extension = imageIO.inferFormat(target);
    if (cliConfig.bmpPalette !== 'rgb24' && extension !== 'bmp')
        throw new Error('--bmp-palette requires BMP output');
    var result = imageIO.writeImage(target, pixels, WIDTH, HEIGHT, {

        jpegQuality:cliConfig.jpegQuality, bmpPalette:cliConfig.bmpPalette
    });
    log('✓ ' + extension.toUpperCase() + ' image written: ' + target +
        ' (' + (result.bytes/1024).toFixed(1) + ' KB)');
}

async function main() {

	try {

        if (process.argv[2] === '--lint-pack') {

            if (process.argv.length !== 4)
                throw new Error('Usage: node cli.js --lint-pack <pack.rdt>');
            if (!require('./rtdt_pack_lint_node').print_report(process.argv[3]))
                process.exitCode = 1;
            return;
        }
        if (process.argv[2] === 'auth') {

            await require('./rtdt_cloud_auth_node').auth_command(process.argv.slice(3));
            return;
        }
		parseArguments(process.argv);
        if (cliConfig.jobFile && process.argv.length !== 4)
            throw new Error('--job cannot be combined with other render options; edit the manifest instead');
        configure_job();
		await renderScene();
		process.exit(0);
	} catch (e) {
	
		console.error('Fatal error: ' + e.message);
		if (process.env.DEBUG) {
		
			console.error(e.stack);
		}
		process.exit(1);
	}
}

// ============================================================================
// ENTRY POINT
// ============================================================================

if (require.main === module) {

	main();
}

module.exports = {

	renderScene,
	parseArguments,
	cliConfig,
	listScenes
};
