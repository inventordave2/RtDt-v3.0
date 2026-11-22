/* Browser-only destinations for canonical RtDt animation frames.
 * No image transformation: inputs are bytes from rtdt_png.encode().
 */
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
        return new Blob(chunks.concat(central,[end]),{type:'application/zip'});
    }

    function download_blob(blob, filename) {

        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { URL.revokeObjectURL(url); },10000);
    }

    function create_sink(kind, directory) {

        if (kind !== 'zip' && kind !== 'folder')
            throw new Error('Select ZIP or local folder');
        if (kind === 'folder' && !directory)
            throw new Error('No writable output folder selected');
        var files = [], written = 0, seen = {};
        return {
            add: function (name, bytes) {

                if (!/^(frame-[0-9]{4,8}\.png|manifest\.json)$/.test(name) || seen[name])
                    return Promise.reject(new Error('Invalid or duplicated frame: '+name));
                if (!(bytes instanceof Uint8Array))
                    return Promise.reject(new Error('Expected encoded bytes'));
                if (kind === 'zip' && written+bytes.length > MAX_ZIP_BYTES)
                    return Promise.reject(new Error('ZIP exceeds 512 MiB; use a local folder instead'));
                seen[name] = true;
                written += bytes.length;
                if (kind === 'zip') {

                    files.push({name:name,bytes:bytes});
                    return Promise.resolve();
                }
                return directory.getFileHandle(name,{create:true}).then(function (handle) {

                    return handle.createWritable();
                }).then(function (stream) {

                    return stream.write(bytes).then(function () {

                        return stream.close();
                    },function (error) {

                        return stream.abort().then(function () { throw error; });
                    });
                });
            },
            finish: function () {

                return kind === 'zip' ? zip_archive(files) : null;
            },
            bytes_written: function () { return written; }
        };
    }

    return {crc32:crc32,zip_archive:zip_archive,download_blob:download_blob,
        create_sink:create_sink};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_animation_export;
