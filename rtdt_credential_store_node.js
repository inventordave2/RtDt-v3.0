'use strict';
/* RtDt credential vault. OS keyring is primary; environment tokens are handled
 * by the OAuth adapter. Plaintext storage is disabled unless explicitly opted in.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const VAULT_SERVICE = 'RtDt cloud storage';
const CACHE_DIR = path.join(os.homedir(), '.config', 'rtdt');
const LEGACY_FILE = path.join(CACHE_DIR, 'auth.json');
const FALLBACK_FILE = path.join(CACHE_DIR, 'auth-fallback.json');
const ALLOW_PLAINTEXT = 'RTDT_ALLOW_PLAINTEXT_CREDENTIALS';
const PROVIDERS = ['google-drive', 'dropbox', 'onedrive'];

function validate_provider(provider) {

    if (!PROVIDERS.includes(provider))
        throw new Error('Unknown credential provider');
    return provider;
}

function optional_keyring() {

    try {

        return require('@napi-rs/keyring');
    } catch (error) {

        if (error.code === 'MODULE_NOT_FOUND' &&
            error.message.includes("'@napi-rs/keyring'")) return null;
        throw new Error('OS credential store is unavailable: '+error.code);
    }
}

function keyring_entry(provider) {

    const keyring = optional_keyring();
    if (!keyring) return null;
    return new keyring.Entry(VAULT_SERVICE, validate_provider(provider));
}

function permission_check(file) {

    if (process.platform === 'win32') return;
    const stat = fs.statSync(file);
    if ((stat.mode & 0o077) !== 0)
        throw new Error('Credential file permissions are too broad; use chmod 600');
}

function read_plaintext(file) {

    try {

        permission_check(file);
        const value = JSON.parse(fs.readFileSync(file,'utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Invalid credentials file');
        return value;
    } catch (error) {

        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

function save_plaintext(file, data) {

    fs.mkdirSync(CACHE_DIR,{recursive:true,mode:0o700});
    const temporary = path.join(CACHE_DIR,
        'credential-'+crypto.randomBytes(12).toString('hex'));
    try {

        fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',
            {mode:0o600,flag:'wx'});
        fs.chmodSync(temporary,0o600);
        fs.renameSync(temporary,file);
    } finally {

        try { fs.unlinkSync(temporary); } catch (error) {

            if (error.code !== 'ENOENT') throw error;
        }
    }
}

function allow_plaintext() {

    return process.env[ALLOW_PLAINTEXT] === '1';
}

function fallback_notice() {

    return 'OS keyring required. Install optional @napi-rs/keyring ('+
        'npm install --no-save @napi-rs/keyring), or explicitly enable the '+
        'less-secure mode with '+ALLOW_PLAINTEXT+'=1. Local ZIP/folder '+
        'rendering needs neither credential store nor cloud login.';
}

function migrate_legacy() {

    if (!fs.existsSync(LEGACY_FILE)) return;
    const keyring = optional_keyring();
    if (!keyring) {

        if (allow_plaintext()) return;
        throw new Error('Legacy plaintext credentials detected. '+fallback_notice());
    }
    const legacy = read_plaintext(LEGACY_FILE);
    try {

        for (const provider of PROVIDERS) {

            if (!legacy[provider]) continue;
            const entry = new keyring.Entry(VAULT_SERVICE,provider);
            if (!entry.getPassword())
                entry.setPassword(JSON.stringify(legacy[provider]));
        }
        // Delete only once all migrated records have been written successfully.
        fs.unlinkSync(LEGACY_FILE);
    } catch (error) {

        throw new Error('Could not migrate legacy credentials into the OS keyring. '+
            'The original file has been preserved. '+fallback_notice());
    }
}

function get_record(provider) {

    validate_provider(provider);
    migrate_legacy();
    const entry = keyring_entry(provider);
    if (entry) {

        try {

            const serialized = entry.getPassword();
            return serialized ? JSON.parse(serialized) : null;
        } catch (error) {

            throw new Error('Could not read OS credential store for '+provider);
        }
    }
    if (!allow_plaintext()) return null;
    return read_plaintext(FALLBACK_FILE)[provider] || 
        read_plaintext(LEGACY_FILE)[provider] || null;
}

function set_record(provider,credentials) {

    validate_provider(provider);
    if (!credentials || typeof credentials !== 'object')
        throw new Error('Credentials must be an object');
    migrate_legacy();
    const entry = keyring_entry(provider);
    if (entry) {

        try {

            entry.setPassword(JSON.stringify(credentials));
        } catch (error) {

            throw new Error('Could not write OS credential store for '+provider+
                '. '+fallback_notice());
        }
        return;
    }
    if (!allow_plaintext()) throw new Error(fallback_notice());
    const cache = read_plaintext(FALLBACK_FILE);
    cache[provider] = credentials;
    save_plaintext(FALLBACK_FILE,cache);
}

function delete_record(provider) {

    validate_provider(provider);
    const entry = keyring_entry(provider);
    if (entry) {

        try {

            if (entry.getPassword()) entry.deletePassword();
        } catch (error) {

            throw new Error('Could not remove OS credential for '+provider);
        }
    }
    for (const file of [FALLBACK_FILE,LEGACY_FILE]) {

        const cache = read_plaintext(file);
        if (!Object.prototype.hasOwnProperty.call(cache,provider)) continue;
        delete cache[provider];
        if (Object.keys(cache).length) save_plaintext(file,cache);
        else fs.unlinkSync(file);
    }
}

function store_status(provider) {

    validate_provider(provider);
    try {

        const entry = keyring_entry(provider);
        if (entry) return entry.getPassword() ? 'OS keyring' : 'not connected';
        if (allow_plaintext() &&
            (read_plaintext(FALLBACK_FILE)[provider] ||
                read_plaintext(LEGACY_FILE)[provider]))
            return 'plaintext fallback (explicitly enabled)';
        return 'not connected';
    } catch (error) {

        return 'credential store unavailable';
    }
}

module.exports = {PROVIDERS,get_record,set_record,delete_record,store_status,
    optional_keyring,migrate_legacy};
