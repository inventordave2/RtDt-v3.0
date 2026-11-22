'use strict';
/* Credential safety: mock OS keyring, restricted fallback, legacy migration.
 * Tests never access a real provider or system keychain.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const folder = fs.mkdtempSync(path.join(os.tmpdir(),'rtdt-credentials-test-'));
const oldHome = process.env.HOME;
const oldFallback = process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS;
process.env.HOME = folder;
delete process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS;
const originalLoad = Module._load;
const stored = new Map();
let keyringEnabled = false;
class MockEntry {

    constructor(service,provider) {

        assert.equal(service,'RtDt cloud storage');
        this.provider = provider;
    }

    setPassword(value) {

        stored.set(this.provider,value);
    }

    getPassword() {

        return stored.get(this.provider) || null;
    }

    deletePassword() {

        stored.delete(this.provider);
    }
}
Module._load = function (name,parent,isMain) {

    if (name === '@napi-rs/keyring') {

        if (keyringEnabled) return {Entry:MockEntry};
        const error = new Error("Cannot find module '@napi-rs/keyring'");
        error.code = 'MODULE_NOT_FOUND';
        throw error;
    }
    return originalLoad.call(this,name,parent,isMain);
};
try {

    const vault = require('../rtdt_credential_store_node');
    const cache = path.join(folder,'.config','rtdt','auth-fallback.json');
    const legacy = path.join(folder,'.config','rtdt','auth.json');
    const secret = {refresh_token:'sample-test-value',clientId:'public-id'};

    assert.throws(function () {

        vault.set_record('google-drive',secret);
    },/OS keyring required/);
    assert.equal(fs.existsSync(cache),false,
        'Credential writing must fail closed without OS keyring');

    process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS = '1';
    vault.set_record('dropbox',secret);
    assert.deepEqual(vault.get_record('dropbox'),secret);
    assert.equal(fs.statSync(cache).mode & 0o077,0,
        'Fallback file must not be accessible to other users');
    vault.delete_record('dropbox');
    assert.equal(fs.existsSync(cache),false);

    vault.set_record('dropbox',secret);
    assert.equal(fs.existsSync(cache),true,'Fallback file should exist temporarily');
    delete process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS;
    keyringEnabled = true;
    assert.deepEqual(vault.get_record('dropbox'),secret);
    assert.equal(fs.existsSync(cache),false,
        'Installing a usable OS keyring must migrate and remove fallback secrets');
    vault.delete_record('dropbox');
    vault.set_record('google-drive',secret);
    assert.deepEqual(vault.get_record('google-drive'),secret);
    assert.equal(fs.existsSync(cache),false,'Keyring must not write token files');
    assert.equal(vault.store_status('google-drive'),'OS keyring');
    vault.delete_record('google-drive');
    assert.equal(stored.size,0);

    fs.mkdirSync(path.dirname(legacy),{recursive:true,mode:0o700});
    fs.writeFileSync(legacy,JSON.stringify({'onedrive':secret}),{mode:0o600});
    assert.deepEqual(vault.get_record('onedrive'),secret);
    assert.equal(fs.existsSync(legacy),false,
        'Legacy plaintext file must be removed after successful migration');
    assert.equal(vault.store_status('onedrive'),'OS keyring');
    vault.delete_record('onedrive');
    console.log('OS keyring, restricted fallback and migration checks passed');
} finally {

    Module._load = originalLoad;
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldFallback === undefined)
        delete process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS;
    else process.env.RTDT_ALLOW_PLAINTEXT_CREDENTIALS = oldFallback;
    fs.rmSync(folder,{recursive:true,force:true});
}
