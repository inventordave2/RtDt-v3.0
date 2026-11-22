/* Shared RtDt raytracing contract for Node.js and the browser. */
var rtdt_render_core = (function () {

    function create_world(sceneState) {

        if (!sceneState || !sceneState.o || !sceneState.c)
            throw new Error('Load a scene and camera before rendering');
        var renderWorld = new world();
        renderWorld.light = sceneState.l;
        renderWorld.objects = sceneState.o.s || [sceneState.o];
        renderWorld.background = sceneState.background || colour(0, 0, 0);
        return renderWorld;
    }

    function trace_pixel(renderWorld, renderCamera, x, y, maxRayDepth) {

        return color_at(renderWorld, renderCamera.ray_for_pixel(x, y), maxRayDepth);
    }

    function render_pixels(renderWorld, renderCamera, width, height, maxRayDepth, onProgress) {

        if (!Number.isInteger(width) || !Number.isInteger(height) ||
            width < 1 || height < 1 || width * height > 4000000 ||
            !Number.isInteger(maxRayDepth) || maxRayDepth < 1 || maxRayDepth > 20)
            throw new Error('Invalid render dimensions or recursion depth');
        var pixels = new Array(width * height);
        for (var y = 0; y < height; y++) {

            for (var x = 0; x < width; x++) {

                pixels[y * width + x] = trace_pixel(renderWorld, renderCamera, x, y, maxRayDepth);
            }
            if (onProgress) onProgress(y + 1, height);
        }
        return pixels;
    }

    return {create_world:create_world, trace_pixel:trace_pixel, render_pixels:render_pixels};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_render_core;
