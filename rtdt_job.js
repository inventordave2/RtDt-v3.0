/* Shared RtDt job execution: no DOM, filesystem, timers or provider SDKs.
 * Node and browser supply only scene acquisition and destination adapters.
 */
var rtdt_job = (function () {

    function render_options(options) {

        var width = Number(options.width), height = Number(options.height);
        var quality = Number(options.quality === undefined ? 1 : options.quality);
        rtdt_render_core.validate_render(width,height,quality);
        return {width:width,height:height,quality:quality};
    }

    function create_session(options) {

        var settings = render_options(options);
        var state = options.sceneState;
        if (!state || !state.c || !state.o)
            throw new Error('Job requires a loaded scene and camera');
        var camera = options.camera || state.c;
        var renderWorld = rtdt_render_core.create_world(state);
        var pixels = new Array(settings.width*settings.height);
        var nextRow = 0;
        var stopped = false;

        function step(rowCount) {

            if (stopped) throw new Error('Render session was cancelled');
            if (nextRow >= settings.height)
                return {done:true,row:nextRow,pixels:pixels};
            nextRow = rtdt_render_core.render_rows(renderWorld,camera,pixels,
                settings.width,settings.height,settings.quality,nextRow,rowCount);
            if (options.on_progress)
                options.on_progress(nextRow,settings.height,pixels);
            return {done:nextRow===settings.height,row:nextRow,pixels:pixels};
        }

        function finish() {

            while (nextRow < settings.height)
                step(settings.height-nextRow);
            return pixels;
        }

        function cancel() {

            stopped = true;
        }

        return {step:step,finish:finish,cancel:cancel,pixels:pixels,
            settings:settings};
    }

    function render_still(options) {

        return create_session(options).finish();
    }

    function animation_bindings(sceneState) {

        if (!sceneState || !sceneState.o || !Array.isArray(sceneState.o.s))
            throw new Error('Animation requires loaded scene objects');
        var bindings = Object.create(null);
        sceneState.o.s.forEach(function (shape,index) {

            bindings[String(index)] = shape;
            if (shape.id2 &&
                !Object.prototype.hasOwnProperty.call(bindings,String(shape.id2)))
                bindings[String(shape.id2)] = shape;
        });
        return bindings;
    }

    function frame_time(index,fps) {

        if (!Number.isInteger(index) || index < 0 ||
            !Number.isFinite(fps) || fps <= 0 || fps > 1000)
            throw new Error('Invalid animation index or frame rate');
        return index/fps;
    }

    async function render_animation(options) {

        if (!options.animator || typeof options.animator.at !== 'function')
            throw new Error('Animation requires an AetherOre animator');
        var config = render_options(options);
        return rtdt_animation_batch.run({
            sink:options.sink,startFrame:options.startFrame,
            endFrame:options.endFrame,fps:options.fps,
            width:config.width,height:config.height,
            cancelled:options.cancelled,on_progress:options.on_progress,
            yield_control:options.yield_control,
            render_frame:function (index,time) {

                options.animator.at(time);
                if (options.on_pose) options.on_pose(index,time);
                return render_still({
                    sceneState:options.sceneState,
                    camera:options.camera || options.sceneState.c,
                    width:config.width,height:config.height,
                    quality:config.quality
                });
            }
        });
    }

    return {create_session:create_session,render_still:render_still,
        render_animation:render_animation,animation_bindings:animation_bindings,
        frame_time:frame_time,render_options:render_options};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_job;
