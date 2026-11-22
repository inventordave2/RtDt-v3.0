/* Runtime-neutral cloud upload adapters. Credentials are injected by Node or browser. */
var rtdt_cloud_storage = (function () {

const PROVIDERS = ['google-drive','dropbox','onedrive'];
const GOOGLE_ROOT = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0/me/drive';

function split_path(value) {

    const path = String(value || 'RtDt/Animation').replace(/\\/g,'/');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || parts.length > 16 || parts.some(function (part) {

        return part === '..' || part === '.' || part.length > 120 ||
            !/^[\w .()\-]+$/.test(part);
    })) throw new Error('Cloud path must contain 1–16 safe folder names (letters, digits, spaces, . _ -)');
    return parts;
}

function encode_segments(parts) {

    return parts.map(encodeURIComponent).join('/');
}

async function request(url,token,options) {

    if (typeof fetch !== 'function')
        throw new Error('Cloud storage needs Node.js 18 or newer');
    const opts = options || {};
    const headers = Object.assign({Authorization:'Bearer '+token},opts.headers);
    const response = await fetch(url,Object.assign({},opts,{headers}));
    if (!response.ok) {

        const body = (await response.text()).slice(0,400);
        const error = new Error('Cloud request failed ('+response.status+'): '+body);
        error.status = response.status;
        throw error;
    }
    return response;
}

async function google_folder(token,parts) {

    let parent = 'root';
    for (const name of parts) {

        const escaped = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const query = "trashed = false and mimeType = 'application/vnd.google-apps.folder' "+
            "and name = '"+escaped+"' and '"+parent+"' in parents";
        const list = new URL(GOOGLE_ROOT);
        list.searchParams.set('q',query);
        list.searchParams.set('fields','files(id,name),nextPageToken');
        list.searchParams.set('pageSize','100');
        const data = await (await request(list.toString(),token)).json();
        if (data.files && data.files.length) {

            parent = data.files[0].id;
        } else {

            const response = await request(GOOGLE_ROOT+'?fields=id,name',token,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',
                    parents:[parent]})
            });
            parent = (await response.json()).id;
        }
    }
    return parent;
}

async function google_upload(token,folder,name,bytes) {

    const setup = await request(GOOGLE_UPLOAD+'?uploadType=resumable&fields=id,name',token,{
        method:'POST',
        headers:{'Content-Type':'application/json; charset=UTF-8',
            'X-Upload-Content-Type':name.endsWith('.png')?'image/png':'application/json',
            'X-Upload-Content-Length':String(bytes.length)},
        body:JSON.stringify({name,parents:[folder]})
    });
    const target = setup.headers.get('location');
    if (!target || !target.startsWith('https://www.googleapis.com/'))
        throw new Error('Google Drive did not provide a valid resumable upload URL');
    await request(target,token,{method:'PUT',
        headers:{'Content-Type':name.endsWith('.png')?'image/png':'application/json'},
        body:bytes});
}

async function dropbox_folder(token,parts) {

    let directory = '';
    for (const segment of parts) {

        directory += '/'+segment;
        const response = await fetch(DROPBOX_API+'/files/create_folder_v2',{
            method:'POST',
            headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
            body:JSON.stringify({path:directory,autorename:false})
        });
        if (response.status === 409) {

            // Dropbox reports a conflict if a folder already exists.
            continue;
        }
        if (!response.ok)
            throw new Error('Dropbox folder create failed ('+response.status+'): '+
                (await response.text()).slice(0,400));
    }
    return directory;
}

async function dropbox_upload(token,directory,name,bytes) {

    await request(DROPBOX_CONTENT+'/files/upload',token,{
        method:'POST',
        headers:{'Content-Type':'application/octet-stream',
            'Dropbox-API-Arg':JSON.stringify({
                path:directory+'/'+name,mode:'overwrite',autorename:false,mute:true
            })},
        body:bytes
    });
}

async function graph_folder(token,parts) {

    let parent = null;
    let pathParts = [];
    for (const segment of parts) {

        pathParts.push(segment);
        const lookup = GRAPH_ROOT+'/root:/'+encode_segments(pathParts);
        let data;
        const found = await fetch(lookup,{headers:{Authorization:'Bearer '+token}});
        if (found.ok) {

            data = await found.json();
            if (!data.folder) throw new Error('OneDrive path is a file, not a folder: '+segment);
        } else if (found.status === 404) {

            const parentUrl = parent ? GRAPH_ROOT+'/items/'+encodeURIComponent(parent)+'/children' :
                GRAPH_ROOT+'/root/children';
            const response = await request(parentUrl,token,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name:segment,folder:{},
                    '@microsoft.graph.conflictBehavior':'fail'})
            });
            data = await response.json();
        } else {

            throw new Error('OneDrive folder lookup failed ('+found.status+'): '+
                (await found.text()).slice(0,400));
        }
        parent = data.id;
    }
    return parent;
}

async function graph_upload(token,folder,name,bytes) {

    await request(GRAPH_ROOT+'/items/'+encodeURIComponent(folder)+':/'+
        encodeURIComponent(name)+':/content',token,{
            method:'PUT',
            headers:{'Content-Type':name.endsWith('.png')?'image/png':'application/json'},
            body:bytes
        });
}

async function create_writer(provider,remotePath,get_token) {

    if (!PROVIDERS.includes(provider))
        throw new Error('Unsupported cloud destination: '+provider);
    if (typeof get_token !== 'function') throw new Error('Cloud authentication is unavailable');
    const token = await get_token(provider);
    const segments = split_path(remotePath);
    if (provider === 'google-drive') {

        const folder = await google_folder(token,segments);
        return async function (name,bytes) {

            await google_upload(await get_token(provider),folder,name,bytes);
        };
    }
    if (provider === 'dropbox') {

        const folder = await dropbox_folder(token,segments);
        return async function (name,bytes) {

            await dropbox_upload(await get_token(provider),folder,name,bytes);
        };
    }
    const folder = await graph_folder(token,segments);
    return async function (name,bytes) {

        await graph_upload(await get_token(provider),folder,name,bytes);
    };
}

return {create_writer:create_writer,split_path:split_path};
}());
if (typeof module !== 'undefined' && module.exports)
    module.exports = rtdt_cloud_storage;
