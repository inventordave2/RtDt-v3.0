'use strict';
/* Optional provider sign-in for the Node CLI. Never imported by local rendering.
 * OAuth credentials stay outside the repo, with user-only filesystem permissions.
 */
const credential_store = require('./rtdt_credential_store_node');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const PROVIDERS = ['google-drive','dropbox','onedrive'];
const CLOUD_SCOPES = {
    'google-drive':['https://www.googleapis.com/auth/drive.file'],
    'dropbox':['files.content.write','files.content.read'],
    'onedrive':['Files.ReadWrite','offline_access']
};

function optional_dependency(name) {

    try {

        return require(name);
    } catch (error) {

        if (error.code !== 'MODULE_NOT_FOUND' ||
            !error.message.includes("'" + name + "'")) throw error;
        throw new Error('Cloud login requires optional package '+name+
            '. Install with: npm install --no-save '+name);
    }
}

function save_credentials(provider,credentials) {

    credential_store.set_record(provider,credentials);
}

function remove_credentials(provider) {

    credential_store.delete_record(provider);
}

function open_browser(url) {

    const platform = process.platform;
    const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
    const args = platform === 'win32' ? ['/c','start','',url] : [url];
    const processHandle = spawn(command,args,{stdio:'ignore',detached:true});
    processHandle.on('error',function () {

        console.log('Open the link above in your browser.');
    });
    processHandle.unref();
}

async function loopback_authorization(build_url) {

    const state = crypto.randomBytes(24).toString('hex');
    return new Promise(function (resolve,reject) {

        let timer = null, settled = false;
        const server = http.createServer(function (request,response) {

            const url = new URL(request.url,'http://127.0.0.1');
            if (url.pathname !== '/oauth/callback') {

                response.writeHead(404).end('Not found');
                return;
            }
            if (url.searchParams.get('state') !== state) {

                response.writeHead(400).end('OAuth state mismatch');
                fail(new Error('OAuth state mismatch'));
                return;
            }
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (!code || error) {

                response.writeHead(400).end('OAuth was cancelled or denied');
                fail(new Error('OAuth denied: '+(error || 'authorization code missing')));
                return;
            }
            response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).
                end('<!doctype html><title>RtDt connected</title>'+
                    '<p>RtDt has received your authorisation. You can close this tab.</p>');
            finish(null,{code,redirectUri:redirect});
        });
        let redirect;
        function finish(error,value) {

            if (settled) return;
            settled = true;
            clearTimeout(timer);
            server.close();
            if (error) reject(error);
            else resolve(value);
        }
        function fail(error) { finish(error); }
        server.on('error',fail);
        server.listen(0,'127.0.0.1',async function () {

            try {

                redirect = 'http://127.0.0.1:'+server.address().port+'/oauth/callback';
                const address = await build_url(redirect,state);
                console.log('Authorise RtDt by opening this address:\n'+address);
                open_browser(address);
                timer = setTimeout(function () {

                    fail(new Error('OAuth sign-in timed out after five minutes'));
                },300000);
            } catch (error) {

                fail(error);
            }
        });
    });
}

async function login_google_drive() {

    const {google} = optional_dependency('googleapis');
    const clientId = process.env.RTDT_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.RTDT_GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret)
        throw new Error('Set RTDT_GOOGLE_CLIENT_ID and RTDT_GOOGLE_CLIENT_SECRET from a Google Desktop OAuth client');
    const oauth = new google.auth.OAuth2(clientId,clientSecret);
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const result = await loopback_authorization(function (redirect,state) {

        oauth.redirectUri = redirect;
        return oauth.generateAuthUrl({access_type:'offline',prompt:'consent',
            scope:CLOUD_SCOPES['google-drive'],state:state,
            code_challenge_method:'S256',code_challenge:challenge});
    });
    const tokens = (await oauth.getToken({code:result.code,
        codeVerifier:verifier,redirect_uri:result.redirectUri})).tokens;
    if (!tokens.refresh_token)
        throw new Error('Google did not issue an offline refresh token');
    save_credentials('google-drive',{clientId,clientSecret,tokens});
}

async function login_dropbox() {

    const sdk = optional_dependency('dropbox');
    const clientId = process.env.RTDT_DROPBOX_APP_KEY;
    if (!clientId) throw new Error('Set RTDT_DROPBOX_APP_KEY to your Dropbox OAuth app key');
    const auth = new sdk.DropboxAuth({clientId});
    const result = await loopback_authorization(function (redirect,state) {

        return auth.getAuthenticationUrl(redirect,state,'code','offline',
            CLOUD_SCOPES.dropbox,undefined,true,true);
    });
    const response = await auth.getAccessTokenFromCode(result.redirectUri,result.code);
    const tokens = response.result || response;
    if (!tokens.refresh_token)
        throw new Error('Dropbox did not issue an offline refresh token');
    save_credentials('dropbox',{clientId,tokens});
}

async function login_onedrive() {

    const msal = optional_dependency('@azure/msal-node');
    const clientId = process.env.RTDT_ONEDRIVE_CLIENT_ID;
    if (!clientId) throw new Error('Set RTDT_ONEDRIVE_CLIENT_ID to your Microsoft public-client application ID');
    const app = new msal.PublicClientApplication({
        auth:{clientId,authority:'https://login.microsoftonline.com/common'}
    });
    await app.acquireTokenByDeviceCode({
        scopes:CLOUD_SCOPES.onedrive,
        deviceCodeCallback:function (response) {

            console.log(response.message);
        }
    });
    save_credentials('onedrive',{clientId,tokenCache:app.getTokenCache().serialize()});
}

async function get_access_token(provider) {

    const tokenKeys = {
        'google-drive':'RTDT_GOOGLE_ACCESS_TOKEN',
        'dropbox':'RTDT_DROPBOX_ACCESS_TOKEN',
        'onedrive':'RTDT_ONEDRIVE_ACCESS_TOKEN'
    };
    if (!PROVIDERS.includes(provider)) throw new Error('Unsupported cloud provider: '+provider);
    const environmentToken = process.env[tokenKeys[provider]];
    if (environmentToken) return environmentToken;
    const record = credential_store.get_record(provider);
    if (!record)
        throw new Error('Not connected to '+provider+'. Run: node cli.js auth login '+provider+
            ' (or supply '+tokenKeys[provider]+' for CI)');
    try {

        if (provider === 'google-drive') {
    
            const {google} = optional_dependency('googleapis');
            const oauth = new google.auth.OAuth2(record.clientId,record.clientSecret);
            oauth.setCredentials(record.tokens);
            const result = await oauth.getAccessToken();
            if (!result || !result.token) throw new Error('Could not refresh Google OAuth token');
            const refreshed = Object.assign({},record.tokens,oauth.credentials);
            if (refreshed.access_token !== record.tokens.access_token ||
                refreshed.expiry_date !== record.tokens.expiry_date) {
    
                save_credentials(provider,Object.assign({},record,{tokens:refreshed}));
            }
            return result.token;
        }
        if (provider === 'dropbox') {
    
            const sdk = optional_dependency('dropbox');
            const auth = new sdk.DropboxAuth({clientId:record.clientId});
            auth.setRefreshToken(record.tokens.refresh_token);
            await auth.checkAndRefreshAccessToken();
            const token = auth.getAccessToken();
            if (!token) throw new Error('Could not refresh Dropbox OAuth token');
            const rotated = typeof auth.getRefreshToken === 'function' ?
                auth.getRefreshToken() : null;
            if (rotated && rotated !== record.tokens.refresh_token)
                save_credentials(provider,Object.assign({},record,{
                    tokens:Object.assign({},record.tokens,{refresh_token:rotated})
                }));
            return token;
        }
        const msal = optional_dependency('@azure/msal-node');
        const app = new msal.PublicClientApplication({
            auth:{clientId:record.clientId,authority:'https://login.microsoftonline.com/common'}
        });
        app.getTokenCache().deserialize(record.tokenCache);
        const accounts = await app.getTokenCache().getAllAccounts();
        if (!accounts.length) throw new Error('OneDrive login expired. Run auth login onedrive');
        const result = await app.acquireTokenSilent({scopes:CLOUD_SCOPES.onedrive,
            account:accounts[0]});
        record.tokenCache = app.getTokenCache().serialize();
        save_credentials('onedrive',record);
        return result.accessToken;
    } catch (error) {

        if (/^(Cloud login requires optional package|Could not refresh Google OAuth token|Could not refresh Dropbox OAuth token|OneDrive login expired|Could not read OS credential store|OS keyring required|Could not write OS credential store)/.test(error.message))
            throw error;
        throw new Error('Could not refresh '+provider+
            ' credentials. Run: node cli.js auth login '+provider);
    }
}

async function auth_command(args) {

    const action = args[0], provider = args[1];
    if (action === 'status') {

        PROVIDERS.forEach(function (name) {

            const envNames = {'google-drive':'RTDT_GOOGLE_ACCESS_TOKEN',
                'dropbox':'RTDT_DROPBOX_ACCESS_TOKEN',
                'onedrive':'RTDT_ONEDRIVE_ACCESS_TOKEN'};
            const status = process.env[envNames[name]] ?
                'temporary environment credential' : credential_store.store_status(name);
            console.log(name+': '+status);
        });
        return;
    }
    if (!PROVIDERS.includes(provider))
        throw new Error('Use auth login|logout google-drive|dropbox|onedrive, or auth status');
    if (action === 'logout') {

        remove_credentials(provider);
        console.log('Disconnected '+provider);
    } else if (action === 'login') {

        credential_store.ensure_available();
        try {

            if (provider === 'google-drive') await login_google_drive();
            else if (provider === 'dropbox') await login_dropbox();
            else await login_onedrive();
        } catch (error) {

            // Avoid surfacing raw OAuth SDK errors, which can include token responses.
            if (/^(Cloud login requires optional package|Set RTDT_|Google did not issue|Dropbox did not issue|OAuth sign-in timed out|OAuth denied:)/.test(error.message))
                throw error;
            throw new Error('Could not connect '+provider+
                '. Check provider application settings, callback and permissions.');
        }
        console.log('Connected '+provider);
    } else {

        throw new Error('Unknown auth command: '+action);
    }
}

module.exports = {PROVIDERS,auth_command,get_access_token,
    save_credentials,remove_credentials,optional_dependency};
