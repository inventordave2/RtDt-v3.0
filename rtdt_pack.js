/* RtDt pack format v1: strict JSON job/asset manifest shared by Node and browser.
 * All paths are local pack-relative references; executable code is never read.
 */
var rtdt_pack = (function () {

    var MAX_SOURCE_BYTES = 262144;
    var TOP_LEVEL = ['version','name','scene','phy','assets','render','output'];
    var ASSET_KINDS = ['mesh','texture','animation'];
    var DESTINATIONS = ['file','zip','folder','google-drive','dropbox','onedrive'];

    function is_object(value) {

        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function known_keys(object,keys,label) {

        Object.keys(object).forEach(function (key) {

            if (keys.indexOf(key) < 0)
                throw new Error('Unknown '+label+' field: '+key);
        });
    }

    function safe_path(value,label) {

        if (typeof value !== 'string' || !value.length || value.length > 240 ||
            value.indexOf('\\') >= 0 || value.indexOf(':') >= 0 ||
            value.charAt(0) === '/' || value.indexOf('//') >= 0 ||
            !/^[A-Za-z0-9_.\/() -]+$/.test(value))
            throw new Error('Invalid relative '+label+' path');
        var parts = value.split('/');
        if (parts.some(function (part) {

            return !part || part === '.' || part === '..';
        }))
            throw new Error('Unsafe relative '+label+' path');
        return value;
    }

    function exact_type(path,expression,label) {

        if (!expression.test(path))
            throw new Error(label+' must have a supported filename extension');
    }

    function integer(value,min,max,label) {

        if (!Number.isInteger(value) || value < min || value > max)
            throw new Error(label+' must be an integer between '+min+' and '+max);
    }

    function parse(source) {

        if (typeof source !== 'string' || source.length > MAX_SOURCE_BYTES)
            throw new Error('.rdt manifest must be UTF-8 JSON (maximum 256 KiB)');
        var model;
        try {

            model = JSON.parse(source);
        } catch (error) {

            throw new Error('Invalid .rdt JSON: '+error.message);
        }
        return validate(model);
    }

    function validate(model) {

        if (!is_object(model))
            throw new Error('.rdt manifest must be a JSON object');
        known_keys(model,TOP_LEVEL,'pack');
        if (model.version !== 1)
            throw new Error('Unsupported .rdt version; expected integer version 1');
        if (model.name !== undefined &&
            (typeof model.name !== 'string' || !model.name.trim() ||
                model.name.length > 120))
            throw new Error('Pack name must be nonempty text, at most 120 characters');

        var scene = safe_path(model.scene,'scene');
        exact_type(scene,/\.scene(?:\.ya?ml)?$/i,'Scene');
        var phy = null;
        if (model.phy !== undefined) {

            phy = safe_path(model.phy,'animation');
            exact_type(phy,/\.phy$/i,'Animation');
        }

        var assets = model.assets === undefined ? [] : model.assets;
        if (!Array.isArray(assets) || assets.length > 200)
            throw new Error('Pack assets must be an array of up to 200 references');
        var seen = Object.create(null);
        var references = assets.map(function (asset) {

            if (!is_object(asset)) throw new Error('Pack asset must be an object');
            known_keys(asset,['kind','path','required'],'asset');
            if (ASSET_KINDS.indexOf(asset.kind) < 0)
                throw new Error('Pack asset kind must be mesh, texture or animation');
            var assetPath = safe_path(asset.path,'asset');
            var patterns = {
                mesh:/\.obj$/i,
                texture:/\.(?:png|jpe?g|bmp|ppm)$/i,
                animation:/\.phy$/i
            };
            exact_type(assetPath,patterns[asset.kind],'Asset');
            if (asset.required !== undefined && typeof asset.required !== 'boolean')
                throw new Error('Asset required must be a boolean');
            if (seen[asset.kind+':'+assetPath])
                throw new Error('Duplicate pack asset: '+assetPath);
            seen[asset.kind+':'+assetPath] = true;
            return {kind:asset.kind,path:assetPath,required:asset.required !== false};
        });

        var render = model.render === undefined ? {} : model.render;
        if (!is_object(render)) throw new Error('Pack render must be an object');
        known_keys(render,['width','height','quality','fps','frames'],'render');
        var width = render.width === undefined ? 500 : render.width;
        var height = render.height === undefined ? 281 : render.height;
        var quality = render.quality === undefined ? 1 : render.quality;
        integer(width,1,4096,'render.width');
        integer(height,1,4096,'render.height');
        integer(quality,1,20,'render.quality');
        if (width*height > 4000000)
            throw new Error('Render resolution exceeds 4 million pixels');
        var fps = render.fps;
        if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0 || fps > 240))
            throw new Error('render.fps must be between 0 and 240');
        var frames = null;
        if (render.frames !== undefined) {

            if (!is_object(render.frames)) throw new Error('render.frames must be an object');
            known_keys(render.frames,['start','end'],'frames');
            integer(render.frames.start,0,99999999,'frames.start');
            integer(render.frames.end,0,99999999,'frames.end');
            if (render.frames.end < render.frames.start ||
                render.frames.end-render.frames.start+1 > 100000)
                throw new Error('Frame range must contain 1..100000 frames');
            frames = {start:render.frames.start,end:render.frames.end};
        }

        var output = model.output === undefined ? {} : model.output;
        if (!is_object(output)) throw new Error('Pack output must be an object');
        known_keys(output,['destination','path','format'],'output');
        var destination = output.destination === undefined ?
            (frames ? 'zip' : 'file') : output.destination;
        if (DESTINATIONS.indexOf(destination) < 0)
            throw new Error('Unsupported pack output destination: '+destination);
        if (frames && destination === 'file')
            throw new Error('A frame range requires zip, folder or cloud output');
        if (!frames && destination !== 'file')
            throw new Error('Batch destinations require render.frames');
        var format = output.format === undefined ? 'png' : output.format;
        if (['png','jpg','jpeg','bmp','ppm'].indexOf(format) < 0)
            throw new Error('Unsupported pack output image format');
        if (frames && format !== 'png')
            throw new Error('Pack animation frames must use the shared PNG encoder');
        var outputPath = output.path === undefined ?
            (destination === 'file' ? 'render.png' :
                destination === 'zip' ? 'renders/animation.zip' : 'renders/animation') :
            safe_path(output.path,'output');
        if (destination === 'zip') exact_type(outputPath,/\.zip$/i,'ZIP output');
        if (destination === 'file') {

            var match = /\.([a-z0-9]+)$/i.exec(outputPath);
            if (!match || (match[1].toLowerCase() !== format &&
                !(format === 'jpeg' && match[1].toLowerCase() === 'jpg') &&
                !(format === 'jpg' && match[1].toLowerCase() === 'jpeg')))
                throw new Error('Output filename extension must match output.format');
        }
        return {version:1,name:model.name || '',scene:scene,phy:phy,
            assets:references,render:{width:width,height:height,quality:quality,
                fps:fps,frames:frames},
            output:{destination:destination,path:outputPath,format:format}};
    }

    function references(pack) {

        var manifest = validate(pack);
        var items = [{kind:'scene',path:manifest.scene,required:true}];
        if (manifest.phy)
            items.push({kind:'animation',path:manifest.phy,required:true});
        manifest.assets.forEach(function (entry) {

            if (!items.some(function (item) {

                return item.kind === entry.kind && item.path === entry.path;
            }))
                items.push(entry);
        });
        return items;
    }

    function relative_location(packPath,reference) {

        var value = safe_path(reference,'reference');
        if (typeof packPath !== 'string' || !packPath)
            throw new Error('Pack location is required');
        var cleaned = packPath.replace(/\\/g,'/');
        if (cleaned.indexOf('..') >= 0)
            throw new Error('Invalid pack location');
        var slash = cleaned.lastIndexOf('/');
        return (slash < 0 ? '' : cleaned.slice(0,slash+1)) + value;
    }

    return {parse:parse,validate:validate,references:references,
        safe_path:safe_path,relative_location:relative_location};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_pack;
