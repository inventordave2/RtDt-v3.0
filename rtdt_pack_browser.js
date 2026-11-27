/* Browser filesystem/network adapter for the shared .rdt pack grammar.
 * Contains no scene construction, raytracing, animation or PNG logic.
 */
var rtdt_pack_browser = (function () {

    function location(packPath,reference) {

        return rtdt_pack.relative_location(packPath,reference);
    }

    function path_from_file(file) {

        return String(file.webkitRelativePath || file.name).replace(/\\/g,'/');
    }

    function directory_entries(files) {

        var entries = {}, root = null;
        Array.prototype.forEach.call(files,function (file) {

            var path = path_from_file(file);
            var split = path.indexOf('/');
            if (split < 1)
                throw new Error('Choose a complete pack folder, not individual files');
            var prefix = path.slice(0,split);
            if (root !== null && root !== prefix)
                throw new Error('Select files from only one pack directory');
            root = prefix;
            var relative = path.slice(split+1);
            rtdt_pack.safe_path(relative,'pack file');
            if (entries[relative])
                throw new Error('Duplicate pack file: '+relative);
            entries[relative] = file;
        });
        return entries;
    }

    function find_root_manifest(entries) {

        var names = Object.keys(entries).filter(function (name) {

            return /^[^/]+\.rdt$/i.test(name);
        });
        if (names.length !== 1)
            throw new Error('Pack folder must contain exactly one root-level .rdt manifest');
        return names[0];
    }

    function scene_dependencies(scene) {

        return rtdt_scene_assets.definitions(scene);
    }

    async function resolve_pack(source,manifestPath,get_text,get_file,make_alias) {

        var pack = rtdt_pack.parse(source);
        var warnings = [], aliases = [];

        async function find_file(reference,kind,baseDir) {

            var candidates=[baseDir+reference];
            (pack.registries||[]).forEach(function(root) {

                candidates.push(location(manifestPath,root+'/'+reference));
            });
            var lastError=null;
            for(var candidateIndex=0;candidateIndex<candidates.length;candidateIndex++) {

                try {

                    return {path:candidates[candidateIndex],
                        file:await get_file(candidates[candidateIndex],kind)};
                } catch(error) {

                    lastError=error;
                }
            }
            throw new Error('Cannot find '+kind+' '+reference+
                ' in pack or registry directories: '+(lastError&&lastError.message));
        }

        var sceneResult=await find_file(pack.scene,'scene',
            location(manifestPath,'placeholder.scene').slice(0,-'placeholder.scene'.length));
        var scenePath=sceneResult.path;
        var sceneText=await rtdt_scene_assets.read_text(sceneResult.file);
        var sceneModel = rtdt_scene_browser.parse(sceneText);
        var sceneDir = scenePath.slice(0,scenePath.lastIndexOf('/')+1);
        async function inspect(reference,kind,required,relativeToScene) {

            var baseDir=relativeToScene ? sceneDir :
                location(manifestPath,'placeholder.scene').slice(0,-'placeholder.scene'.length);
            var requested=rtdt_scene_assets.check_path(reference);
            try {

                var result=await find_file(requested,kind,baseDir);
                if(relativeToScene&&make_alias)
                    aliases.push(make_alias(result.file,reference));
            } catch(error) {

                if(required)throw new Error('Required '+kind+' '+reference+': '+error.message);
                warnings.push('Optional '+kind+' not available: '+reference);
            }
        }

        var references = rtdt_pack.references(pack);
        for (var i = 1; i < references.length; i++) {

            var ref = references[i];
            await inspect(ref.path,ref.kind,ref.required,false);
        }
        var sceneAssets = scene_dependencies(sceneModel);
        for (var index = 0; index < sceneAssets.length; index++) {

            var asset = sceneAssets[index];
            await inspect(asset.path,asset.kind,asset.required,true);
        }
        var phyText = null;
        if (pack.phy) {

            var motion=await find_file(pack.phy,'animation',
                location(manifestPath,'placeholder.scene').slice(0,-'placeholder.scene'.length));
            phyText=await rtdt_scene_assets.read_text(motion.file);
        }
        return {pack:pack,sceneText:sceneText,scenePath:scenePath,
            phyText:phyText,localFiles:make_alias ? aliases : undefined,
            warnings:warnings};
    }

    async function load_hosted(packPath) {

        var pathname = rtdt_pack.safe_path(packPath,'hosted pack');
        if (!/\.rdt$/i.test(pathname))
            throw new Error('Expected a .rdt pack manifest');
        async function fetch_file(filename) {

            var response=await fetch(filename,{cache:'no-store'});
            if(!response.ok)throw new Error('HTTP '+response.status+' '+filename);
            var blob=await response.blob();
            return new File([blob],filename.split('/').pop(),{type:blob.type});
        }
        var manifest=await fetch_file(pathname);
        var source=await rtdt_scene_assets.read_text(manifest);
        function alias(file,reference) {

            var copy=new File([file],file.name,{type:file.type});
            Object.defineProperty(copy,'webkitRelativePath',{
                value:reference,configurable:true
            });
            return copy;
        }
        return resolve_pack(source,pathname,null,fetch_file,alias);
    }

    async function load_local(files) {

        var registry=rtdt_asset_registry.index(files);
        var entries=registry.entries;
        var manifestName=find_root_manifest(entries);
        async function get_file(filename) {

            var entry=entries[filename];
            if(!entry)throw new Error('File missing from selected directory: '+filename);
            return entry.file;
        }
        async function get_text(filename) {

            return rtdt_scene_assets.read_text(await get_file(filename));
        }
        function make_alias(file,reference) {

            var alias = new File([file],file.name,{type:file.type});
            Object.defineProperty(alias,'webkitRelativePath',{
                value:reference,configurable:true
            });
            return alias;
        }
        return resolve_pack(await get_text(manifestName),manifestName,
            get_text,get_file,make_alias);
    }

    return {load_hosted:load_hosted,load_local:load_local,
        directory_entries:directory_entries,find_root_manifest:find_root_manifest};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_pack_browser;
