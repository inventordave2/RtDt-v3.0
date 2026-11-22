'use strict';
/* Provider uploads share one cloud adapter. Mock HTTP; no real credentials. */
const assert = require('node:assert/strict');
const cloud = require('../rtdt_cloud_storage');
const auth = require('../rtdt_cloud_auth_node');
const bytes = new Uint8Array([137,80,78,71]);
const previous = global.fetch;

async function exercise(provider) {

    const operations = [];
    let folderNumber = 0;
    let tokenRequests = 0;
    const token = async function (name) {

        assert.equal(name,provider);
        tokenRequests++;
        return 'test-token';
    };
    global.fetch = async function (url,options) {

        const opts = options || {};
        operations.push({url:String(url),method:opts.method || 'GET',
            headers:opts.headers,body:opts.body});
        if (provider === 'google-drive') {

            if (String(url).includes('uploadType=resumable'))
                return new Response('',{status:200,
                    headers:{location:'https://www.googleapis.com/upload/mock-id'}});
            if (String(url).endsWith('/upload/mock-id'))
                return new Response('{}',{status:200});
            if ((opts.method || 'GET') === 'GET')
                return new Response('{"files":[]}',{status:200});
            return new Response(JSON.stringify({id:'folder-'+(++folderNumber)}),
                {status:200});
        }
        if (provider === 'dropbox') return new Response('{}',{status:200});
        if ((opts.method || 'GET') === 'GET')
            return new Response('{"error":"itemNotFound"}',{status:404});
        if (opts.method === 'POST')
            return new Response(JSON.stringify({id:'folder-'+(++folderNumber),folder:{}}),
                {status:201});
        return new Response('{}',{status:201});
    };
    const writer = await cloud.create_writer(provider,'RtDt/Orbit',token);
    await writer('frame-0000.png',bytes);
    await writer('manifest.json',new TextEncoder().encode('{}'));
    assert.ok(tokenRequests >= 3,'Token should be requested again for later uploads');
    const uploads = operations.filter(function (call) {

        return call.method === 'PUT' ||
            provider === 'dropbox' && call.url.includes('/files/upload');
    });
    assert.equal(uploads.length,2,'Expected one upload per output file');
    assert.ok(operations.every(function (call) {

        return call.headers && call.headers.Authorization === 'Bearer test-token';
    }),'All API calls must use the supplied bearer token');
}

async function main() {

    assert.deepEqual(cloud.split_path('RtDt/Orbit'),['RtDt','Orbit']);
    assert.throws(function () { cloud.split_path('../secrets'); },/safe folder/);
    assert.deepEqual(auth.PROVIDERS,['google-drive','dropbox','onedrive']);
    const prior = process.env.RTDT_DROPBOX_ACCESS_TOKEN;
    process.env.RTDT_DROPBOX_ACCESS_TOKEN = 'environment-token';
    try {

        assert.equal(await auth.get_access_token('dropbox'),'environment-token');
    } finally {

        if (prior === undefined) delete process.env.RTDT_DROPBOX_ACCESS_TOKEN;
        else process.env.RTDT_DROPBOX_ACCESS_TOKEN = prior;
    }
    for (const provider of auth.PROVIDERS) await exercise(provider);
    console.log('Cloud upload adapters and optional token fallback verified with mock HTTP');
}

main().catch(function (error) {

    console.error(error);
    process.exitCode = 1;
}).finally(function () {

    global.fetch = previous;
});
