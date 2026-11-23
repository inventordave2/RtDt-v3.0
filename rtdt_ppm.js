/* Shared portable P3 PPM encoder: identical bytes in Node and the WebApp. */
var rtdt_ppm = (function () {

    function encode(pixels,width,height) {

        if (!Number.isInteger(width) || !Number.isInteger(height) ||
            width < 1 || height < 1 || width*height > 4000000 ||
            !pixels || pixels.length !== width*height)
            throw new Error('Invalid PPM dimensions or pixels');
        var colourCodec = typeof rtdt_colour !== 'undefined' ?
            rtdt_colour : require('./rtdt_colour');
        var lines = ['P3',width+' '+height,'255'];
        for (var y=0;y<height;y++) {

            var row = [];
            for (var x=0;x<width;x++) {

                var pixel = pixels[y*width+x];
                if (!pixel || ![pixel.r,pixel.g,pixel.b].every(Number.isFinite))
                    throw new Error('Invalid PPM RGB at pixel '+(y*width+x));
                row.push(colourCodec.byte(pixel.r)+' '+
                    colourCodec.byte(pixel.g)+' '+colourCodec.byte(pixel.b));
            }
            lines.push(row.join('  '));
        }
        return new TextEncoder().encode(lines.join('\n')+'\n');
    }

    return {encode:encode};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_ppm;
