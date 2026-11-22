/* Runtime-independent AetherOre batch renderer.
 * A supplied render_frame callback uses the same raytracing core in Node and browser.
 * PNG encoding, frame sequencing, manifest and destination calls live here.
 */
var rtdt_animation_batch = (function () {

    function frame_name(index) {

        return 'frame-' + String(index).padStart(4,'0') + '.png';
    }

    function settings(options) {

        var start = Number(options.startFrame);
        var end = Number(options.endFrame);
        var fps = Number(options.fps);
        var width = Number(options.width), height = Number(options.height);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 ||
            end < start || end > 99999999 || end-start+1 > 100000 ||
            !Number.isFinite(fps) || fps <= 0 || fps > 1000 ||
            !Number.isInteger(width) || !Number.isInteger(height) ||
            width < 1 || height < 1 || width * height > 4000000)
            throw new Error('Invalid animation frame range, FPS or dimensions');
        if (!options.sink || typeof options.sink.add !== 'function' ||
            typeof options.sink.finish !== 'function' ||
            typeof options.render_frame !== 'function')
            throw new Error('Animation requires a renderer and output destination');
        if (typeof rtdt_png === 'undefined' && typeof require !== 'function')
            throw new Error('Shared PNG encoder is missing');
        return {start:start,end:end,fps:fps,width:width,height:height};
    }

    async function run(options) {

        var opts = settings(options);
        var png = typeof rtdt_png !== 'undefined' ? rtdt_png : require('./rtdt_png');
        var manifest = {version:1,format:'png',startFrame:opts.start,endFrame:opts.end,
            fps:opts.fps,width:opts.width,height:opts.height,frames:[]};
        var sink = options.sink;
        for (var index = opts.start; index <= opts.end; index++) {

            if (options.cancelled && options.cancelled())
                throw new Error('Animation export cancelled');
            var time = index / opts.fps;
            var pixels = await options.render_frame(index,time,opts.width,opts.height);
            var encoded = png.encode(pixels,opts.width,opts.height);
            var name = frame_name(index);
            await sink.add(name,encoded);
            manifest.frames.push({index:index,timeSeconds:time,
                filename:name,crc32:png.crc32(encoded),bytes:encoded.length});
            if (options.on_progress)
                options.on_progress(index-opts.start+1,opts.end-opts.start+1,name);
            if (options.yield_control)
                await options.yield_control();
        }
        var content = JSON.stringify(manifest,null,2)+'\n';
        var manifestBytes = new TextEncoder().encode(content);
        await sink.add('manifest.json',manifestBytes);
        var output = await sink.finish();
        return {manifest:manifest,output:output};
    }

    return {run:run,frame_name:frame_name,settings:settings};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_animation_batch;
