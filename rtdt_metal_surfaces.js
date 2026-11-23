/* Deterministic procedural RGB albedo maps for metal-look scene surfaces.
 * The existing RtDt Phong lighting model supplies highlights; these maps
 * describe colour/finish only, not physically based roughness or Fresnel.
 */
var rtdt_metal_surfaces = (function () {

    var supported = [
        'brushed-steel',
        'hammered-titanium',
        'copper-patina',
        'anodized-iridescence'
    ];

    function settings(spec) {

        if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
            supported.indexOf(spec.type) < 0)
            throw new Error('Unsupported procedural metal surface');
        Object.keys(spec).forEach(function (key) {

            if (['type','width','height','seed'].indexOf(key) < 0)
                throw new Error('Unknown metal surface option: '+key);
        });
        var width=spec.width === undefined ? 512 : spec.width;
        var height=spec.height === undefined ? 256 : spec.height;
        var seed=spec.seed === undefined ? 1 : spec.seed;
        if (!Number.isInteger(width) || !Number.isInteger(height) ||
            width < 2 || height < 2 || width*height > 1048576 ||
            !Number.isInteger(seed) || seed < 0 || seed > 2147483647)
            throw new Error('Invalid procedural metal surface dimensions or seed');
        return {type:spec.type,width:width,height:height,seed:seed};
    }

    function modulo(value, period) {

        return ((value%period)+period)%period;
    }

    function hash(x,y,seed) {

        var n=(Math.imul(x|0,0x1f123bb5)^Math.imul(y|0,0x5f356495)^
            Math.imul(seed|0,0x6c8e9cf5))|0;
        n=Math.imul(n^(n>>>15),1|n);
        n^=n+Math.imul(n^(n>>>7),61|n);
        return ((n^(n>>>14))>>>0)/4294967296;
    }

    function smooth(value) {

        return value*value*(3-2*value);
    }

    function interpolate(a,b,t) {

        return a+(b-a)*t;
    }

    function value_noise(u,v,cellsX,cellsY,seed) {

        var x=u*cellsX,y=v*cellsY;
        var ix=Math.floor(x),iy=Math.floor(y);
        var fx=smooth(x-ix),fy=smooth(y-iy);
        var x0=modulo(ix,cellsX),x1=modulo(ix+1,cellsX);
        var a=hash(x0,iy,seed),b=hash(x1,iy,seed);
        var c=hash(x0,iy+1,seed),d=hash(x1,iy+1,seed);
        return interpolate(interpolate(a,b,fx),interpolate(c,d,fx),fy);
    }

    function fbm(u,v,seed,baseX,baseY) {

        var total=0,weight=0,amplitude=0.5;
        for (var octave=0;octave<4;octave++) {

            total+=amplitude*value_noise(u,v,baseX*(1<<octave),
                baseY*(1<<octave),seed+octave*1013);
            weight+=amplitude;
            amplitude*=0.5;
        }
        return total/weight;
    }

    function cellular(u,v,columns,rows,seed) {

        var x=u*columns,y=v*rows;
        var ix=Math.floor(x),iy=Math.floor(y),nearest=Infinity;
        for (var dy=-1;dy<=1;dy++) {
            for (var dx=-1;dx<=1;dx++) {

                var cellX=modulo(ix+dx,columns),cellY=iy+dy;
                var centerX=ix+dx+0.2+0.6*hash(cellX,cellY,seed);
                var centerY=iy+dy+0.2+0.6*hash(cellX,cellY,seed+37);
                var distanceX=x-centerX,distanceY=y-centerY;
                nearest=Math.min(nearest,distanceX*distanceX+
                    distanceY*distanceY);
            }
        }
        return Math.sqrt(nearest);
    }

    function clamp(value) {

        return Math.max(0,Math.min(1,value));
    }

    function smoothstep(low,high,value) {

        return smooth(clamp((value-low)/(high-low)));
    }

    function palette(type,u,v,seed) {

        var noise=fbm(u,v,seed,5,4);
        if (type === 'brushed-steel') {

            var grain=0.5+0.5*Math.sin(2*Math.PI*
                (v*156+0.22*Math.sin(2*Math.PI*u*7+seed)));
            var tone=0.79+0.16*grain+0.12*(noise-0.5);
            return [0.57*tone,0.66*tone,0.74*tone];
        }
        if (type === 'hammered-titanium') {

            var cell=cellular(u,v,30,15,seed);
            var dimple=smoothstep(0.12,0.72,cell);
            var tone=0.42+0.43*dimple+0.12*(noise-0.5);
            return [0.48*tone,0.55*tone,0.64*tone];
        }
        if (type === 'copper-patina') {

            var warpedU=modulo(u+0.08*(noise-0.5),1);
            var patina=fbm(warpedU,v,seed+89,7,5);
            var amount=smoothstep(0.48,0.61,patina);
            var variation=0.88+0.2*noise;
            return [
                interpolate(0.72,0.07,amount)*variation,
                interpolate(0.25,0.55,amount)*variation,
                interpolate(0.075,0.42,amount)*variation
            ];
        }

        var phase=2*Math.PI*(v*2.7+0.18*(noise-0.5));
        return [
            0.18+0.68*(0.5+0.5*Math.cos(phase)),
            0.15+0.65*(0.5+0.5*Math.cos(phase-2*Math.PI/3)),
            0.22+0.68*(0.5+0.5*Math.cos(phase-4*Math.PI/3))
        ];
    }

    function texture(spec) {

        var config=settings(spec);
        var data=new Uint8Array(config.width*config.height*3);
        for (var y=0;y<config.height;y++) {

            var v=y/(config.height-1);
            for (var x=0;x<config.width;x++) {

                var u=x/(config.width-1);
                var rgb=palette(config.type,u,v,config.seed);
                var offset=3*(y*config.width+x);
                data[offset]=Math.round(255*clamp(rgb[0]));
                data[offset+1]=Math.round(255*clamp(rgb[1]));
                data[offset+2]=Math.round(255*clamp(rgb[2]));
            }
        }
        return {width:config.width,height:config.height,data:data,profile:'RGB',
            generator:config.type};
    }

    return {supported_types:supported,validate:settings,texture:texture};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_metal_surfaces;
