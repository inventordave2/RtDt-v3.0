# RtDt cloud credentials and output security

RtDt's Node CLI uses **one authentication adapter** for Google Drive, Dropbox and
OneDrive. Render/animation code never reads tokens, and shared cloud upload code
receives only a token-provider callback.

## Local export

`node cli.js --batch --destination zip` and
`node cli.js --batch --destination folder --output-dir renders/orbit` require
no sign-in and do not load cloud SDKs or the OS keyring.

## Optional secure OS keyring

For interactive cloud login install the optional keyring integration:

```sh
npm install --no-save @napi-rs/keyring
```

It uses the system's credential store where supported (macOS Keychain,
Windows credential facilities, and Linux keyring/Secret Service backends).
The keyring must be usable by the account running RtDt. A login refuses to
start if no usable persistent credential store is available.

Provider SDKs are loaded only when their login is selected:

```sh
npm install --no-save googleapis        # Google Drive
npm install --no-save dropbox           # Dropbox
npm install --no-save @azure/msal-node  # OneDrive
```

Register OAuth application identifiers with the providers, configure the
corresponding `RTDT_GOOGLE_CLIENT_ID`, `RTDT_GOOGLE_CLIENT_SECRET`,
`RTDT_DROPBOX_APP_KEY` or `RTDT_ONEDRIVE_CLIENT_ID` environment variables,
then run:

```sh
node cli.js auth login google-drive
node cli.js auth login dropbox
node cli.js auth login onedrive
node cli.js auth status
node cli.js auth logout google-drive
```

Login is interactive. Access and refresh tokens are persisted using the
keyring, while the authentication adapter handles refreshing tokens and
saving replacement credentials. No refresh-token management belongs to
the scene parser, renderer or storage destination.

## Fallback, migration, and CI

For headless CI, provide the selected provider's temporary access token
using a protected environment secret such as `RTDT_GOOGLE_ACCESS_TOKEN`,
`RTDT_DROPBOX_ACCESS_TOKEN` or `RTDT_ONEDRIVE_ACCESS_TOKEN`. Never print
these values or provide tokens as command-line arguments.

When the OS keyring is missing, **RtDt does not store tokens in plaintext
by default**. An administrator may expressly enable the less-secure
per-user fallback with `RTDT_ALLOW_PLAINTEXT_CREDENTIALS=1`. This creates
`~/.config/rtdt/auth-fallback.json` with restricted permissions. Prefer
the keyring or ephemeral CI tokens instead.

If an old `~/.config/rtdt/auth.json` exists, the vault attempts to migrate
the supported provider records into a working keyring, deleting the old
file only after the transfer succeeds. If migration fails, the old file
is preserved and a non-secret error is displayed. Remove old plaintext
backups after confirming migration; Git cannot erase secrets from
existing history simply because a path is added to `.gitignore`.

The repository ignores common local credential and environment files.
Never commit tokens, app secrets, local OAuth files or full provider
HTTP responses. If credentials have been committed, revoke/rotate
them immediately and review the repository history.

## Browser-specific security

The WebApp uses OAuth within the browser, holding access tokens in
session memory instead of passing them to the CLI. It never needs
Node.js keyring access. Dropbox and OneDrive use PKCE; Google uses
Google Identity Services. Each provider requires a properly registered
OAuth client ID and allowed redirect/origin configuration.

## Validation

```sh
node tests/credential-store.test.js
node tests/cloud-uploads.test.js
node tests/animation-export.test.js
```

The tests use mock OS keyring and HTTP requests; they do not certify live
cloud sign-in, platform-specific keyring availability or provider upload
permissions. Verify those on each supported OS before declaring production
readiness.
