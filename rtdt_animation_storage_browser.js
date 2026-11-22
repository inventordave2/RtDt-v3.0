/* Browser file permissions and download adapters, never rendering/encoding. */
var rtdt_animation_storage_browser = (function () {

    function download(bytes,name) {

        var url = URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
        var link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); },15000);
    }

    async function create(kind,remotePath,archiveName) {

        var cloud = ['google-drive','dropbox','onedrive'].indexOf(kind) >= 0;
        if (kind !== 'zip' && kind !== 'folder' && !cloud)
            throw new Error('Unknown animation output destination');
        var directory = null;
        if (kind === 'folder') {

            if (!window.isSecureContext || !window.showDirectoryPicker)
                throw new Error('Direct folder export needs a Chromium browser on HTTPS or localhost. Choose ZIP instead.');
            directory = await window.showDirectoryPicker({mode:'readwrite'});
        }
        var writer = cloud ? await rtdt_cloud_storage.create_writer(kind,
            remotePath || 'RtDt/Animation',rtdt_cloud_auth_browser.get_access_token) : null;
        return rtdt_animation_destination.create({
            kind:cloud ? 'folder' : kind,
            output_archive:function (bytes) {

                download(bytes,archiveName || 'rtdt-animation.zip');
            },
            write_file:async function (name,bytes) {

                if (cloud) return writer(name,bytes);
                var handle = await directory.getFileHandle(name,{create:true});
                var stream = await handle.createWritable();
                try {

                    await stream.write(bytes);
                    await stream.close();
                } catch (error) {

                    await stream.abort();
                    throw error;
                }
            }
        });
    }

    return {create:create};
}());
