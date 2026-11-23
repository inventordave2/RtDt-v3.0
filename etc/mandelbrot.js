/* Canvas preview adapter for the shared RtDt Mandelbrot engine.
 * The original plot/colour scheme lives in rtdt_mandelbrot.texture().
 * Loading this utility no longer creates or edits a document automatically.
 */
function mandel_iterate(cx,cy,maxIterations) {

    var engine=typeof rtdt_mandelbrot!=='undefined' ?
        rtdt_mandelbrot : require('../rtdt_mandelbrot');
    return engine.iterate(cx,cy,maxIterations);
}

function mandelbrot(canvas,xmin,xmax,ymin,ymax,iterations) {

    if(!canvas || !canvas.getContext)
        throw new Error('Mandelbrot preview requires a canvas');
    var engine=typeof rtdt_mandelbrot!=='undefined' ?
        rtdt_mandelbrot : require('../rtdt_mandelbrot');
    var texture=engine.texture({
        width:canvas.width,height:canvas.height,
        xmin:xmin,xmax:xmax,ymin:ymin,ymax:ymax,
        iterations:iterations
    });
    var context=canvas.getContext('2d');
    var image=context.createImageData(texture.width,texture.height);
    for(var index=0;index<texture.width*texture.height;index++) {

        image.data[4*index]=texture.data[3*index];
        image.data[4*index+1]=texture.data[3*index+1];
        image.data[4*index+2]=texture.data[3*index+2];
        image.data[4*index+3]=255;
    }
    context.putImageData(image,0,0);
    return texture;
}
if(typeof module!=='undefined'&&module.exports)
    module.exports={mandel_iterate:mandel_iterate,mandelbrot:mandelbrot};
