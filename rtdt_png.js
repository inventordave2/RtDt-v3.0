/* Canonical portable PNG encoder used by CLI and browser; no Canvas or zlib.
 * PNG RGBA8, filter 0, deterministic zlib stored blocks (RFC 1950/1951).
 */
var rtdt_png = (function () {

    var crc_table = null;

    function crc32(bytes) {

        if (!crc_table) {

            crc_table = new Uint32Array(256);
            for (var i = 0; i < 256; i++) {

                var c = i;
                for (var j = 0; j < 8; j++)
                    c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
                crc_table[i] = c >>> 0;
            }
        }
        var crc = 0xffffffff;
        for (var n = 0; n < bytes.length; n++)
            crc = crc_table[(crc ^ bytes[n]) & 255] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function put32(bytes, offset, value) {

        bytes[offset] = (value >>> 24) & 255;
        bytes[offset + 1] = (value >>> 16) & 255;
        bytes[offset + 2] = (value >>> 8) & 255;
        bytes[offset + 3] = value & 255;
    }

    function adler32(bytes) {

        var a = 1, b = 0;
        for (var i = 0; i < bytes.length; i++) {

            a = (a + bytes[i]) % 65521;
            b = (b + a) % 65521;
        }
        return ((b << 16) | a) >>> 0;
    }

    function deflate_stored(raw) {

        var blocks = Math.max(1,Math.ceil(raw.length / 65535));
        var out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
        out[0] = 0x78;
        out[1] = 0x01;
        var src = 0, dst = 2;
        for (var i = 0; i < blocks; i++) {

            var len = Math.min(65535,raw.length-src);
            out[dst++] = i === blocks-1 ? 1 : 0;
            out[dst++] = len & 255;
            out[dst++] = len >>> 8;
            out[dst++] = (~len) & 255;
            out[dst++] = ((~len) >>> 8) & 255;
            out.set(raw.subarray(src,src+len),dst);
            src += len;
            dst += len;
        }
        put32(out,dst,adler32(raw));
        return out;
    }

    function chunk(name, payload) {

        var out = new Uint8Array(12+payload.length);
        put32(out,0,payload.length);
        for (var i = 0; i < 4; i++)
            out[4+i] = name.charCodeAt(i);
        out.set(payload,8);
        put32(out,8+payload.length,crc32(out.subarray(4,8+payload.length)));
        return out;
    }

    function encode_rgba(rgba, width, height) {

        if (!Number.isInteger(width) || !Number.isInteger(height) ||
            width < 1 || height < 1 || width * height > 4000000 ||
            !rgba || rgba.length !== width * height * 4)
            throw new Error('Invalid PNG dimensions or RGBA pixel count');

        var stride = width * 4, scanlines = new Uint8Array((stride+1)*height);
        for (var y = 0; y < height; y++)
            scanlines.set(rgba.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
        var header = new Uint8Array(13);
        put32(header,0,width);
        put32(header,4,height);
        header[8] = 8;
        header[9] = 6;

        var ihdr = chunk('IHDR',header);
        var idat = chunk('IDAT',deflate_stored(scanlines));
        var iend = chunk('IEND',new Uint8Array(0));
        var out = new Uint8Array(8+ihdr.length+idat.length+iend.length);
        out.set([137,80,78,71,13,10,26,10],0);
        out.set(ihdr,8);
        out.set(idat,8+ihdr.length);
        out.set(iend,8+ihdr.length+idat.length);
        return out;
    }

    function encode(pixels, width, height) {

        if (!pixels || pixels.length !== width * height)
            throw new Error('Invalid PNG pixel count');
        if (typeof rtdt_colour === 'undefined')
            throw new Error('RtDt colour module is required for PNG');
        var rgba = new Uint8Array(pixels.length * 4);
        for (var i = 0; i < pixels.length; i++) {

            var pixel = pixels[i];
            if (!pixel || ![pixel.r,pixel.g,pixel.b].every(Number.isFinite))
                throw new Error('Invalid PNG colour at pixel ' + i);
            rgba[i*4] = rtdt_colour.byte(pixel.r);
            rgba[i*4+1] = rtdt_colour.byte(pixel.g);
            rgba[i*4+2] = rtdt_colour.byte(pixel.b);
            rgba[i*4+3] = 255;
        }
        return encode_rgba(rgba,width,height);
    }

    return {encode:encode,encode_rgba:encode_rgba,crc32:crc32};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_png;
