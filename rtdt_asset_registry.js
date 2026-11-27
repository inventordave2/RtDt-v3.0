/* RtDt asset registry: index browser-selected File objects without reading their bytes.
 * Each entry is a lightweight reference; no executable files are evaluated.
 */
var rtdt_asset_registry = (function () {

    var TYPES={
        '.rdt':'pack','.scene':'scene','.yaml':'scene','.yml':'scene',
        '.obj':'mesh','.png':'texture','.jpg':'texture','.jpeg':'texture',
        '.bmp':'texture','.ppm':'texture','.phy':'animation',
        '.wgsl':'shader','.json':'data'
    };

    function safe_path(value) {

        if(typeof value!=='string'||!value||value.length>240||
            value.charAt(0)==='/'||value.indexOf('\\')>=0||
            value.indexOf('//')>=0||value.indexOf(':')>=0||
            !/^[A-Za-z0-9_./() -]+$/.test(value)||
            value.split('/').some(function(part) {

                return !part||part==='.'||part==='..';
            }))
            throw new Error('Invalid registry path: '+value);
        return value;
    }

    function file_type(path) {

        var lower=path.toLowerCase();
        if(/\\.scene(?:\\.ya?ml)?$/.test(lower))return 'scene';
        var match=/\\.[a-z0-9]+$/.exec(lower);
        return match ? TYPES[match[0]]||'other' : 'other';
    }

    function index(files) {

        var entries=Object.create(null),counts=Object.create(null),root=null;
        if(!files||typeof files.length!=='number')
            throw new Error('Select a folder to index its assets');
        if(files.length>20000)
            throw new Error('Asset folder exceeds 20,000 files');
        for(var i=0;i<files.length;i++) {

            var file=files[i];
            var source=String(file.webkitRelativePath||file.name||'');
            var slash=source.indexOf('/');
            var relative=slash>=0 ? source.slice(slash+1) : source;
            if(slash>=0) {

                var prefix=source.slice(0,slash);
                if(root!==null&&root!==prefix)
                    throw new Error('Files must come from a single selected folder');
                root=prefix;
            }
            safe_path(relative);
            if(Object.prototype.hasOwnProperty.call(entries,relative))
                throw new Error('Duplicate registry entry: '+relative);
            var type=file_type(relative);
            entries[relative]={path:relative,type:type,file:file};
            counts[type]=(counts[type]||0)+1;
        }
        return {entries:entries,counts:counts,count:files.length,root:root};
    }

    function find(registry,reference,roots) {

        if(!registry)return null;
        var name=safe_path(reference);
        var candidates=[name];
        (roots||[]).forEach(function(root) {

            var dir=safe_path(root);
            candidates.push(dir+'/'+name);
        });
        for(var i=0;i<candidates.length;i++) {

            if(Object.prototype.hasOwnProperty.call(registry.entries,candidates[i]))
                return registry.entries[candidates[i]];
        }
        return null;
    }

    return {index:index,find:find,file_type:file_type,safe_path:safe_path};
}());
if(typeof module!=='undefined'&&module.exports)
    module.exports=rtdt_asset_registry;
