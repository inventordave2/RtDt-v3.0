/* Portable ZIP builder for canonical RtDt animation frames, shared by CLI and WebApp. */
var rtdt_animation_export = (function () {

    var MAX_ZIP_BYTES = 512 * 1024 * 1024;
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

    function zip_archive(entries) {

        if (entries.length > 65535)
            throw new Error('Too many ZIP entries');
        var chunks = [], central = [], offset = 0;
        entries.forEach(function (entry) {

            var bytes = entry.bytes, filename = entry.name;
            if (!/^(frame-[0-9]{4,8}\.png|manifest\.json)$/.test(filename) ||
                !(bytes instanceof Uint8Array))
                throw new Error('Unsafe ZIP entry');
            var name = new Uint8Array(filename.length);
            for (var i = 0; i < name.length; i++)
                name[i] = filename.charCodeAt(i);
            var crc = crc32(bytes);
            var local = new Uint8Array(30+name.length);
            var view = new DataView(local.buffer);
            view.setUint32(0,0x04034b50,true);
            view.setUint16(4,20,true);
            view.setUint32(14,crc,true);
            view.setUint32(18,bytes.length,true);
            view.setUint32(22,bytes.length,true);
            view.setUint16(26,name.length,true);
            local.set(name,30);
            var record = new Uint8Array(46+name.length);
            var header = new DataView(record.buffer);
            header.setUint32(0,0x02014b50,true);
            header.setUint16(4,20,true);
            header.setUint16(6,20,true);
            header.setUint32(16,crc,true);
            header.setUint32(20,bytes.length,true);
            header.setUint32(24,bytes.length,true);
            header.setUint16(28,name.length,true);
            header.setUint32(42,offset,true);
            record.set(name,46);
            chunks.push(local,bytes);
            central.push(record);
            offset += local.length+bytes.length;
        });
        var directorySize = central.reduce(function (n,record) {

            return n+record.length;
        },0);
        if (offset+directorySize > 0xffffffff)
            throw new Error('Archive exceeds ZIP32 limits');
        var end = new Uint8Array(22);
        var footer = new DataView(end.buffer);
        footer.setUint32(0,0x06054b50,true);
        footer.setUint16(8,entries.length,true);
        footer.setUint16(10,entries.length,true);
        footer.setUint32(12,directorySize,true);
        footer.setUint32(16,offset,true);
        var output = new Uint8Array(offset+directorySize+end.length);
        var cursor = 0;
        chunks.concat(central,[end]).forEach(function (part) {

            output.set(part,cursor);
            cursor += part.length;
        });
        return output;
    }

    return {crc32:crc32,zip_archive:zip_archive};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_animation_export;
