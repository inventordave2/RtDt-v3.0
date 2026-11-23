/* Shared RtDt flightpath API: path geometry, phase, expansion and AetherOre.
 * Path generators (including Mandelbrot) provide sampled 3D points.
 */
var rtdt_flightpath = (function () {

    function numeric(value,variables,label) {

        var result=typeof value==='string' ?
            rtdt_aetherore.evaluate_expression(value,variables) : value;
        if(typeof result!=='number'||!Number.isFinite(result))
            throw new Error('Invalid flightpath '+label);
        return result;
    }

    function validate_points(points) {

        if(!Array.isArray(points)||points.length<2||points.length>4096)
            throw new Error('Flightpath requires 2–4096 sample points');
        return points.map(function (point) {

            if(!Array.isArray(point)||point.length!==3||
                !point.every(function (value) {

                    return typeof value==='number'&&Number.isFinite(value);
                }))
                throw new Error('Flightpath coordinates must be finite 3D points');
            return point.slice();
        });
    }

    function create(points,options) {

        var settings=options || {};
        var vertices=validate_points(points);
        var fps=numeric(settings.fps===undefined?24:settings.fps,{},'fps');
        var cycles=numeric(settings.cycles===undefined?1:settings.cycles,{},'cycles');
        var scale=numeric(settings.scale===undefined?1:settings.scale,{},'scale');
        var entropy=numeric(settings.entropy===undefined?0:settings.entropy,{},'entropy');
        if(!Number.isInteger(cycles)||cycles<1||cycles>16||
            fps<=0||fps>240||scale<=0||scale>100||
            entropy<0||entropy>1||vertices.length*cycles>4096)
            throw new Error('Invalid flightpath rate, cycle or expansion settings');
        var expansion=settings.expansion===undefined ?
            'scale*exp(entropy*cycleProgress)' : settings.expansion;
        if(typeof expansion!=='string'||expansion.length>240)
            throw new Error('Invalid flightpath expansion expression');
        var expression=rtdt_aetherore.compile_expression(expansion);
        return {points:vertices,fps:fps,cycles:cycles,scale:scale,
            entropy:entropy,expression:expression,formula:expansion,
            duration:vertices.length*cycles/fps};
    }

    function sample_at(path,time) {

        if(typeof time!=='number'||!Number.isFinite(time)||
            time<0||time>path.duration)
            throw new Error('Flightpath time outside duration');
        var step=time*path.fps;
        var phase=step%path.points.length;
        var index=Math.floor(phase);
        var fraction=phase-index;
        var first=path.points[index];
        var last=path.points[(index+1)%path.points.length];
        var progress=step/path.points.length;
        var envelope=rtdt_aetherore.evaluate_expression(path.expression,{
            t:time,phase:phase/path.points.length,
            cycle:Math.floor(progress),cycleProgress:progress,
            scale:path.scale,entropy:path.entropy
        });
        if(!Number.isFinite(envelope)||envelope<0||envelope>1000000)
            throw new Error('Flightpath expansion exceeds finite bounds');
        return first.map(function (value,axis) {

            var coordinate=(value+(last[axis]-value)*fraction)*envelope;
            if(!Number.isFinite(coordinate))
                throw new Error('Flightpath coordinate overflow');
            return coordinate;
        });
    }

    function to_keyframes(path) {

        var count=path.points.length*path.cycles,frames=[];
        for(var index=0;index<=count;index++) {

            var time=index/path.fps;
            frames.push({time:time,value:sample_at(path,time)});
        }
        return frames;
    }

    function to_phy(path,objectId) {

        var id=String(objectId===undefined?'0':objectId);
        if(!id||id==='__proto__'||id==='constructor')
            throw new Error('Invalid flightpath animation target');
        return {version:1,timeline:{fps:path.fps,duration:path.duration},
            objects:[{id:id,motion:{position:to_keyframes(path)}}]};
    }

    return {create:create,sample_at:sample_at,to_keyframes:to_keyframes,
        to_phy:to_phy};
}());
if(typeof module!=='undefined'&&module.exports)
    module.exports=rtdt_flightpath;
