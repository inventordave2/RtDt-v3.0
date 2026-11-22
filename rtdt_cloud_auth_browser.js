/* Browser OAuth: Google Identity Services and native standards-based PKCE.
 * Token material is held in memory only, never placed in URLs, localStorage or logs.
 * An OAuth application ID is supplied by the user; no client secrets in browser.
 */
var rtdt_cloud_auth_browser = (function () {

    var sessions = {};
    var app_clients = {};
    var GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    var GRAPH_SCOPE = 'Files.ReadWrite offline_access';
    var DROPBOX_SCOPE = 'files.content.write files.content.read';

    function redirect_uri() {

        return new URL('rtdt_oauth_callback.html',window.location.href).href;
    }

    function random_url_safe(size) {

        var bytes = new Uint8Array(size);
        window.crypto.getRandomValues(bytes);
        var output = '';
        for (var i = 0; i < bytes.length; i++)
            output += String.fromCharCode(bytes[i]);
        return btoa(output).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }

    async function challenge(verifier) {

        var input = new TextEncoder().encode(verifier);
        var digest = await window.crypto.subtle.digest('SHA-256',input);
        var bytes = new Uint8Array(digest);
        var binary = '';
        for (var i = 0; i < bytes.length; i++)
            binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }

    function popup_authorization(popup,url,state) {

        return new Promise(function (resolve,reject) {

            var finished = false, timer = null, poll = null;
            function cleanup() {

                clearTimeout(timer);
                clearInterval(poll);
                window.removeEventListener('message',receive);
                if (popup && !popup.closed) popup.close();
            }
            function complete(error,code) {

                if (finished) return;
                finished = true;
                cleanup();
                if (error) reject(error);
                else resolve(code);
            }
            function receive(event) {

                if (event.origin !== window.location.origin || event.source !== popup)
                    return;
                var data = event.data;
                if (!data || data.type !== 'rtdt-oauth-code' || data.state !== state)
                    return;
                if (data.error) complete(new Error('Cloud sign-in denied: '+data.error));
                else if (data.code) complete(null,data.code);
                else complete(new Error('OAuth response did not include an authorization code'));
            }
            window.addEventListener('message',receive);
            timer = setTimeout(function () {

                complete(new Error('Cloud sign-in timed out after five minutes'));
            },300000);
            poll = setInterval(function () {

                if (popup.closed) complete(new Error('Cloud sign-in window was closed'));
            },500);
            popup.location.href = url;
        });
    }

    async function json_token(endpoint,body) {

        var response = await fetch(endpoint,{
            method:'POST',
            headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body:new URLSearchParams(body).toString()
        });
        if (!response.ok) throw new Error('OAuth token exchange failed (HTTP '+
            response.status+'). Check the OAuth client and redirect configuration.');
        var token = await response.json();
        if (!token.access_token) throw new Error('OAuth did not return an access token');
        token.expires_at = Date.now() + (Number(token.expires_in) || 3600) * 1000;
        return token;
    }

    async function connect_pkce(provider,clientId,popup) {

        var state = random_url_safe(24);
        var verifier = random_url_safe(64);
        var proof = await challenge(verifier);
        var redirect = redirect_uri(), authorize, tokenEndpoint, scope;
        if (provider === 'dropbox') {

            authorize = 'https://www.dropbox.com/oauth2/authorize';
            tokenEndpoint = 'https://api.dropboxapi.com/oauth2/token';
            scope = DROPBOX_SCOPE;
        } else {

            authorize = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
            tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
            scope = GRAPH_SCOPE;
        }
        var params = new URLSearchParams({
            client_id:clientId,redirect_uri:redirect,response_type:'code',
            state:state,scope:scope,code_challenge:proof,code_challenge_method:'S256'
        });
        if (provider === 'dropbox') params.set('token_access_type','offline');
        else params.set('response_mode','query');
        var code = await popup_authorization(popup,authorize+'?'+params,state);
        var token = await json_token(tokenEndpoint,{
            grant_type:'authorization_code',client_id:clientId,code:code,
            redirect_uri:redirect,code_verifier:verifier
        });
        sessions[provider] = token;
        app_clients[provider] = clientId;
    }

    function google_script() {

        if (window.google && window.google.accounts && window.google.accounts.oauth2)
            return Promise.resolve();
        return new Promise(function (resolve,reject) {

            var script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = resolve;
            script.onerror = function () {

                reject(new Error('Google Identity Services could not load'));
            };
            document.head.appendChild(script);
        });
    }

    async function connect_google(clientId) {

        await google_script();
        return new Promise(function (resolve,reject) {

            var client = window.google.accounts.oauth2.initTokenClient({
                client_id:clientId,scope:GOOGLE_SCOPE,
                callback:function (token) {

                    if (token.error || !token.access_token) {

                        reject(new Error('Google sign-in failed: '+(token.error || 'no token')));
                        return;
                    }
                    sessions['google-drive'] = {
                        access_token:token.access_token,
                        expires_at:Date.now()+(Number(token.expires_in) || 3600)*1000
                    };
                    app_clients['google-drive'] = clientId;
                    resolve();
                }
            });
            client.requestAccessToken({prompt:'consent'});
        });
    }

    async function connect(provider,clientId) {

        if (!/^(google-drive|dropbox|onedrive)$/.test(provider))
            throw new Error('Unknown cloud account provider');
        if (!clientId || !/^[a-zA-Z0-9._:-]{8,250}$/.test(clientId))
            throw new Error('Enter your registered OAuth application client ID / app key');
        if (!window.isSecureContext || !window.crypto || !window.crypto.subtle)
            throw new Error('Cloud OAuth requires HTTPS or a secure localhost origin');

        if (provider === 'google-drive')
            return connect_google(clientId);
        // Reserve the popup synchronously from the Connect button click.
        var popup = window.open('about:blank','rtdt-cloud-login',
            'popup,width=550,height=700');
        if (!popup) throw new Error('Your browser blocked the sign-in window');
        try {

            await connect_pkce(provider,clientId,popup);
        } catch (error) {

            if (!popup.closed) popup.close();
            throw error;
        }
    }

    async function get_access_token(provider) {

        var token = sessions[provider];
        if (!token)
            throw new Error('Connect your '+provider+' account before starting export');
        if (token.expires_at > Date.now()+90000) return token.access_token;
        if (provider === 'google-drive')
            throw new Error('Google access token expired. Connect your account again.');
        if (!token.refresh_token)
            throw new Error('Cloud token expired. Reconnect your account.');
        var endpoint = provider === 'dropbox' ?
            'https://api.dropboxapi.com/oauth2/token' :
            'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        var params = {grant_type:'refresh_token',
            client_id:app_clients[provider],refresh_token:token.refresh_token};
        if (provider === 'onedrive') params.scope = GRAPH_SCOPE;
        var refreshed = await json_token(endpoint,params);
        // Refresh responses need not repeat the long-lived refresh token.
        sessions[provider] = Object.assign({},token,refreshed);
        return refreshed.access_token;
    }

    function connected(provider) {

        return Boolean(sessions[provider] &&
            sessions[provider].expires_at > Date.now()+90000);
    }

    function disconnect(provider) {

        delete sessions[provider];
        delete app_clients[provider];
    }

    return {connect:connect,connected:connected,disconnect:disconnect,
        preload_google:google_script,
        get_access_token:get_access_token,redirect_uri:redirect_uri};
}());
