'use strict';
/* Browser OAuth logic with fake window, PKCE redirect and HTTP responses.
 * No network, real account, persistence or browser UI required.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname,'..');
let currentTime = Date.now();
let popup = null;
let tokenCalls = 0;
let denyTokenExchange = false;
const listeners = {};
const fakeWindow = {
    isSecureContext:true,
    crypto:crypto.webcrypto,
    location:{href:'https://rtdt.example/webapp.html'},
    addEventListener:function (name,callback) {

        listeners[name] = callback;
    },
    removeEventListener:function (name) {

        delete listeners[name];
    },
    open:function () {

        popup = {location:{href:'about:blank'},closed:false,close:function () {

            this.closed = true;
        }};
        return popup;
    }
};
const TestDate = class extends Date {

    static now() {

        return currentTime;
    }
};
const sandbox = {
    console:console,
    window:fakeWindow,
    document:{},
    URL:URL,
    URLSearchParams:URLSearchParams,
    TextEncoder:TextEncoder,
    Uint8Array:Uint8Array,
    Date:TestDate,
    Promise:Promise,
    btoa:function (value) {

        return Buffer.from(value,'binary').toString('base64');
    },
    setTimeout:function () { return 1; },
    clearTimeout:function () {},
    setInterval:function () { return 2; },
    clearInterval:function () {},
    fetch:async function (url,options) {

        tokenCalls++;
        assert.equal(options.method,'POST');
        assert.equal(options.headers['Content-Type'],
            'application/x-www-form-urlencoded');
        if (denyTokenExchange)
            return new Response('secret-token-should-not-appear',{status:401});
        const body = new URLSearchParams(options.body);
        assert.ok(body.get('client_id'));
        if (body.get('grant_type') === 'authorization_code') {

            assert.equal(body.get('code'),'sample-code');
            assert.ok(body.get('code_verifier'));
            return new Response(JSON.stringify({
                access_token:'first-access',refresh_token:'long-lived-refresh',
                expires_in:3600
            }),{status:200,headers:{'Content-Type':'application/json'}});
        }
        assert.equal(body.get('grant_type'),'refresh_token');
        assert.equal(body.get('refresh_token'),'long-lived-refresh',
            'A later refresh must retain the original refresh token');
        return new Response(JSON.stringify({
            access_token:'refreshed-access-'+tokenCalls,expires_in:3600
        }),{status:200,headers:{'Content-Type':'application/json'}});
    }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'rtdt_cloud_auth_browser.js'),'utf8'),
    sandbox,{filename:'rtdt_cloud_auth_browser.js'});
const auth = sandbox.rtdt_cloud_auth_browser;

async function await_popup() {

    for(let n=0;n<100;n++) {

        if (popup && popup.location.href.startsWith('https://')) return;
        await new Promise(function (resolve) {

            setImmediate(resolve);
        });
    }
    throw new Error('PKCE popup did not navigate to provider authorization endpoint');
}

async function login_pkce(provider) {

    const pending = auth.connect(provider,'test-client-1234');
    await await_popup();
    const url = new URL(popup.location.href);
    const state = url.searchParams.get('state');
    assert.ok(state);
    assert.equal(url.searchParams.get('response_type'),'code');
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    if (provider === 'dropbox')
        assert.match(url.hostname,/dropbox/);
    else
        assert.match(url.hostname,/microsoftonline/);
    const tokenCallsBefore = tokenCalls;
    listeners.message({origin:'https://attacker.example',source:popup,
        data:{type:'rtdt-oauth-code',state:state,code:'sample-code'}});
    listeners.message({origin:'https://rtdt.example',source:popup,
        data:{type:'rtdt-oauth-code',state:'incorrect',code:'sample-code'}});
    assert.equal(tokenCalls,tokenCallsBefore,'Invalid origin and state must be ignored');
    listeners.message({origin:'https://rtdt.example',source:popup,
        data:{type:'rtdt-oauth-code',state:state,code:'sample-code'}});
    await pending;
    assert.equal(popup.closed,true);
    assert.equal(auth.connected(provider),true);
    assert.equal(await auth.get_access_token(provider),'first-access');

    currentTime += 4000*1000;
    const firstRefresh = await auth.get_access_token(provider);
    assert.match(firstRefresh,/^refreshed-access-/);
    currentTime += 4000*1000;
    const nextRefresh = await auth.get_access_token(provider);
    assert.match(nextRefresh,/^refreshed-access-/);
    assert.notEqual(nextRefresh,firstRefresh);
    auth.disconnect(provider);
    await assert.rejects(auth.get_access_token(provider),/Connect your/);
    currentTime += 1000;
}

async function main() {

    assert.equal(auth.connected('dropbox'),false);
    await assert.rejects(auth.connect('dropbox','short'),/client ID/);
    fakeWindow.isSecureContext = false;
    await assert.rejects(auth.connect('dropbox','test-client-1234'),/HTTPS/);
    fakeWindow.isSecureContext = true;
    await login_pkce('dropbox');
    await login_pkce('onedrive');

    fakeWindow.google = {
        accounts:{oauth2:{initTokenClient:function (settings) {

            assert.equal(settings.client_id,'google-client-1234');
            return {requestAccessToken:function () {

                settings.callback({access_token:'google-access',expires_in:3600});
            }};
        }}}
    };
    await auth.connect('google-drive','google-client-1234');
    assert.equal(await auth.get_access_token('google-drive'),'google-access');
    auth.disconnect('google-drive');

    denyTokenExchange = true;
    const blocked = auth.connect('dropbox','test-client-1234');
    await await_popup();
    const url = new URL(popup.location.href);
    listeners.message({origin:'https://rtdt.example',source:popup,
        data:{type:'rtdt-oauth-code',state:url.searchParams.get('state'),
            code:'sample-code'}});
    await assert.rejects(blocked,function (error) {

        assert.match(error.message,/HTTP 401/);
        assert.doesNotMatch(error.message,/secret-token-should-not-appear/);
        return true;
    });
    console.log('Browser OAuth PKCE state/origin, Google token, refresh and redaction passed');
}

main().catch(function (error) {

    console.error(error);
    process.exitCode = 1;
});
