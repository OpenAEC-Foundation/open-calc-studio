# Account sign-in: configuration and acceptance

Public desktop/web builds keep `VITE_OPENAEC_ENABLED=false`. In the hosted
platform the site owns authentication. Enabling the flag cannot enable native
login in an ordinary browser; both the UI and store require the Tauri runtime.

For an explicitly enabled native build, set `OPENAEC_ACCOUNTS_CONFIG` to the
path of an administrator-provided JSON file with a registered public OIDC
client. There is no client secret in this file. Placeholder example:

```json
{
  "issuer": "https://auth.example.com",
  "clientId": "registered-client-id",
  "redirectUri": "http://127.0.0.1:53683/callback",
  "scopes": "openid profile email offline_access",
  "accountsApiUrl": "https://accounts.example.com"
}
```

The issuer and API require HTTPS; explicit local development can use HTTP on
localhost/127.0.0.1. The registered callback must use localhost or 127.0.0.1,
an explicit port and exactly `/callback`. The old machine-specific Kubernetes
hostname and client ID are no longer compiled as fallback defaults. Missing,
unreadable or invalid configuration fails before opening a browser or listener.
Requests have a 30-second deadline, separate from the five-minute login deadline.

Tokens stay in the native OS keyring: Windows Credential Manager, macOS Keychain,
and Linux Secret Service. Linux requires a running provider such as
GNOME Keyring or KWallet (D-Bus); do not substitute plaintext storage in headless
containers. The graphical SuperCloud container disables external account services.

## Remaining acceptance for issue #42

The repository's published integration contract still describes a local developer
client, rather than a confirmed production Calc client. We have not guessed a
client ID or switched the public build to an unrelated identity provider.

Before closing #42, the account administrator must supply the registered issuer,
client ID, redirect and API. Then check on Windows, macOS and Linux: browser
sign-in, callback, profile, authenticated API request, restart/session restoration,
sign-out, denied consent and unavailable keyring. Unit tests and a successful
installer build do not prove a real account session.

References: [issue #42](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/42),
[account integration contract](https://github.com/OpenAEC-Foundation/openaec-accounts/blob/main/docs/integrations/open-calc-studio.md).
