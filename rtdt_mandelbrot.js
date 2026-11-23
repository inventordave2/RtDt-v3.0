/* RtDt Mandelbrot procedural texture and cyclic AetherOre flight path.
 * Complex recurrence adapted from etc/mandelbrot.js.
 * Expressions use the existing AetherOre parser, never eval or new Function.
 */
var rtdt_mandelbrot = (function () {

    function parameter(value,variables,label) {

        var result=typeof value==='string' ?
            rtdt_aetherore.evaluate_expression(
                rtdt_aetherore.compile_expression(value),variables) : value;
        if (typeof result!=='number' || !Number.isFinite(result))
            throw new Error('Invalid Mandelbrot '+label);
        return result;
    }

    function parameters(model) {

        var vars=Object.create(null), given=model.parameters || {};
        if (!given || typeof given!=='object' || Array.isArray(given))
            throw new Error('Mandelbrot parameters must be an object');
        Object.keys(given).forEach(function (key) {

            if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) ||
                ['t','x','y','i','iterations','__proto__',
                    'constructor','prototype'].indexOf(key)>=0)
                throw new Error('Unsafe Mandelbrot parameter: '+key);
            vars[key]=parameter(given[key],vars,key);
        });
        return vars;
    }

    function iterate(cx,cy,maxIterations) {

        var x=0,y=0,xx=0,yy=0;
        for(var step=0;step<maxIterations;step++) {

            if(xx+yy>4) return step;
            var xy=x*y;
            xx=x*x;
            yy=y*y;
            x=xx-yy+cx;
            y=xy+xy+cy;
        }
        return maxIterations;
    }

    function orbit(cx,cy,steps,limit) {

        var x=0,y=0,output=[[0,0]];
        var radiusSquared=limit*limit;
        for(var step=0;step<steps;step++) {

            var xx=x*x,yy=y*y,xy=x*y;
            x=xx-yy+cx;
            y=2*xy+cy;
            if(!Number.isFinite(x)||!Number.isFinite(y)||
                x*x+y*y>radiusSquared)
                break;
            output.push([x,y]);
        }
        return output;
    }

    function byte(value) {

        return Math.round(255*Math.max(0,Math.min(1,value)));
    }

    function texture(source) {

        var spec=source || {},vars=parameters(spec);
        var width=parameter(spec.width===undefined?256:spec.width,vars,'width');
        var height=parameter(spec.height===undefined?256:spec.height,vars,'height');
        var iterations=parameter(spec.iterations===undefined?128:
            spec.iterations,vars,'iterations');
        if(!Number.isInteger(width)||!Number.isInteger(height)||
            width<2||height<2||width*height>1048576||
            !Number.isInteger(iterations)||iterations<3||iterations>4096||
            width*height*iterations>150000000)
            throw new Error('Invalid or excessive Mandelbrot texture workload');
        var xmin=parameter(spec.xmin===undefined?-2:spec.xmin,vars,'xmin');
        var xmax=parameter(spec.xmax===undefined?1:spec.xmax,vars,'xmax');
        var ymin=parameter(spec.ymin===undefined?-1:spec.ymin,vars,'ymin');
        var ymax=parameter(spec.ymax===undefined?1:spec.ymax,vars,'ymax');
        if(xmin>=xmax||ymin>=ymax)
            throw new Error('Mandelbrot bounds must increase');
        var palette=spec.palette===undefined?
            '3*log10(i)/log10(iterations-1)':spec.palette;
        if(typeof palette!=='string'||palette.length>240)
            throw new Error('Invalid Mandelbrot palette expression');
        var compiled=rtdt_aetherore.compile_expression(palette);
        var rgb=new Uint8Array(width*height*3);
        var values=Object.assign(Object.create(null),vars,{iterations:iterations});
        for(var iy=0;iy<height;iy++) {

            var cy=ymax-(ymax-ymin)*iy/(height-1);
            for(var ix=0;ix<width;ix++) {

                var cx=xmin+(xmax-xmin)*ix/(width-1);
                var count=iterate(cx,cy,iterations);
                if(count===iterations) continue;
                values.i=count+1;
                values.x=cx;
                values.y=cy;
                var c=rtdt_aetherore.evaluate_expression(compiled,values);
                var pos=3*(iy*width+ix);
                rgb[pos]=byte(Math.min(1,c));
                rgb[pos+1]=byte(Math.min(1,Math.max(0,c-1)));
                rgb[pos+2]=byte(Math.min(1,Math.max(0,c-2)));
            }
        }
        return {width:width,height:height,data:rgb,profile:'RGB',
            generator:'mandelbrot'};
    }

    function flight_source(source) {

        var spec=source || {},vars=parameters(spec);
        var cx=parameter(spec.cx===undefined?-0.75:spec.cx,vars,'cx');
        var cy=parameter(spec.cy===undefined?0.1:spec.cy,vars,'cy');
        var steps=parameter(spec.steps===undefined?48:spec.steps,vars,'steps');
        var radius=parameter(spec.escapeRadius===undefined?8:
            spec.escapeRadius,vars,'escapeRadius');
        if(!Number.isInteger(steps)||steps<2||steps>512||
            radius<=0||radius>1000)
            throw new Error('Invalid Mandelbrot orbit settings');
        var points=orbit(cx,cy,steps,radius);
        if(points.length<3)
            throw new Error('Mandelbrot orbit escaped before a usable flight cycle');
        // A Mandelbrot orbit only supplies sample geometry; periodic
        // interpolation and expansion belong to the shared flightpath API.
        return rtdt_flightpath.create(points.map(function (point) {

            return [point[0],0,point[1]];
        }),{
            fps:parameter(spec.fps===undefined?24:spec.fps,vars,'fps'),
            cycles:parameter(spec.cycles===undefined?2:spec.cycles,vars,'cycles'),
            scale:parameter(spec.scale===undefined?2:spec.scale,vars,'scale'),
            entropy:parameter(spec.entropy===undefined?0.08:spec.entropy,
                vars,'entropy'),
            expansion:spec.expansion
        });
    }

    function flight_path(source) {

        return rtdt_flightpath.to_keyframes(flight_source(source));
    }

    function flight_phy(source,id) {

        return rtdt_flightpath.to_phy(flight_source(source),id);
    }

    return {iterate:iterate,orbit:orbit,texture:texture,
        flight_source:flight_source,flight_path:flight_path,flight_phy:flight_phy};
}());
if(typeof module!=='undefined'&&module.exports)
    module.exports=rtdt_mandelbrot;
