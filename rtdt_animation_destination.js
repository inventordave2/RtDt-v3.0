/* Common animation destination contract. Runtime-specific file access is injected.
 * The CLI and WebApp use this exact adapter for ZIP and folder exports.
 */
var rtdt_animation_destination = (function () {

    var MAX_ZIP_BYTES = 512 * 1024 * 1024;

    function create(options) {

        var kind = options.kind;
        if (kind !== 'zip' && kind !== 'folder')
            throw new Error('Destination must be zip or folder');
        if (kind === 'folder' && typeof options.write_file !== 'function')
            throw new Error('Folder writing is unavailable in this environment');
        if (kind === 'zip' && typeof options.output_archive !== 'function')
            throw new Error('ZIP download or writing is unavailable');
        var files = [], total = 0, seen = {};
        return {
            add: function (name, bytes) {

                if (!/^(frame-[0-9]{4,8}\.png|manifest\.json)$/.test(name) ||
                    Object.prototype.hasOwnProperty.call(seen,name))
                    throw new Error('Invalid or duplicate output filename: '+name);
                if (!(bytes instanceof Uint8Array))
                    throw new Error('Destination requires encoded Uint8Array bytes');
                if (kind === 'zip' && total+bytes.length > MAX_ZIP_BYTES)
                    throw new Error('ZIP limit exceeded (512 MiB); use folder output');
                seen[name] = true;
                total += bytes.length;
                if (kind === 'folder')
                    return Promise.resolve(options.write_file(name,bytes));
                files.push({name:name,bytes:bytes});
                return Promise.resolve();
            },
            finish: function () {

                if (kind === 'folder') return Promise.resolve(null);
                if (typeof rtdt_animation_export === 'undefined')
                    throw new Error('Shared ZIP builder is missing');
                var encoded = rtdt_animation_export.zip_archive(files);
                return Promise.resolve(options.output_archive(encoded));
            },
            bytes_written: function () { return total; }
        };
    }

    return {create:create};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_animation_destination;
