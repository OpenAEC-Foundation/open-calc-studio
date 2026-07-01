// OpenAEC Accounts-integratie: "Sign in with OpenAEC" (OIDC Authorization
// Code + PKCE, RFC 8252) en de Accounts API (apps-catalogus + cloud-opslag).
// Contract: openaec-accounts/docs/integrations/open-calc-studio.md
//
// Flow: systeembrowser → Zitadel-login → redirect naar loopback
// http://localhost:53683/callback → token-exchange → tokens in de
// OS-keyring (Windows Credential Manager). Tokens komen nooit in de webview.

use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;

const KEYRING_SERVICE: &str = "open-calc-studio-openaec";
const LOGIN_TIMEOUT_SECS: u64 = 300;

// ── Config ──────────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsConfig {
    pub issuer: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub scopes: String,
    pub accounts_api_url: String,
}

impl Default for AccountsConfig {
    fn default() -> Self {
        // Dev-waarden uit het integratiecontract; productie krijgt later een
        // eigen issuer/API-domein (override via OPENAEC_ACCOUNTS_CONFIG).
        Self {
            issuer: "http://kubernetes.docker.internal:8088".into(),
            client_id: "376959313182261253".into(),
            redirect_uri: "http://localhost:53683/callback".into(),
            scopes: "openid profile email offline_access".into(),
            accounts_api_url: "http://localhost:4000".into(),
        }
    }
}

fn load_config() -> AccountsConfig {
    if let Ok(path) = std::env::var("OPENAEC_ACCOUNTS_CONFIG") {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<AccountsConfig>(&text) {
                return cfg;
            }
            log::warn!("[Accounts] Config op {} onleesbaar — dev-defaults gebruikt", path);
        }
    }
    AccountsConfig::default()
}

// ── Token-opslag (keyring) ──────────────────────────────────────────────
// Windows Credential Manager begrenst een blob tot ~2,5 KB; JWT's zijn al
// gauw 1-2 KB per stuk, dus elk token krijgt zijn eigen entry.

fn keyring_set(user: &str, value: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, user)
        .and_then(|e| e.set_password(value))
        .map_err(|e| format!("keyring ({user}): {e}"))
}

fn keyring_get(user: &str) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, user)
        .ok()
        .and_then(|e| e.get_password().ok())
}

fn keyring_delete(user: &str) {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, user) {
        let _ = e.delete_credential();
    }
}

fn store_tokens(access: &str, refresh: Option<&str>, id_token: Option<&str>) -> Result<(), String> {
    keyring_set("access_token", access)?;
    if let Some(r) = refresh {
        keyring_set("refresh_token", r)?;
    }
    if let Some(i) = id_token {
        keyring_set("id_token", i)?;
    }
    Ok(())
}

// ── OIDC types ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct UserInfo {
    pub sub: String,
    pub name: String,
    pub email: String,
}

fn b64url(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Decodeer de payload van een JWT (zonder handtekeningverificatie — het
/// token komt rechtstreeks van het token-endpoint en dient hier alleen om
/// naam/e-mail te tonen).
fn decode_id_token(id_token: &str) -> Option<UserInfo> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    Some(UserInfo {
        sub: claims.get("sub")?.as_str()?.to_string(),
        name: claims
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        email: claims
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

async fn fetch_discovery(client: &reqwest::Client, issuer: &str) -> Result<Discovery, String> {
    client
        .get(format!("{issuer}/.well-known/openid-configuration"))
        .send()
        .await
        .map_err(|e| format!("OIDC-discovery onbereikbaar ({issuer}): {e}"))?
        .json::<Discovery>()
        .await
        .map_err(|e| format!("OIDC-discovery onleesbaar: {e}"))
}

// ── Loopback-callback ──────────────────────────────────────────────────

/// Wacht op de OAuth-redirect en geef (code, state) terug.
///
/// Niet-blokkerend met een harde deadline: zo blijft deze thread NOOIT
/// eeuwig hangen op `accept()` (anders blijft de callback-poort bezet en
/// de login-knop "bezig" hangen als de gebruiker de browser-login niet
/// afmaakt). Bij het verstrijken van de deadline keert de functie terug en
/// wordt de listener gedropt → poort vrij, knop reset.
fn wait_for_callback(listener: TcpListener) -> Result<(String, String), String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("loopback non-blocking: {e}"))?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(LOGIN_TIMEOUT_SECS);
    loop {
        if std::time::Instant::now() >= deadline {
            return Err("inloggen verlopen (geen callback ontvangen)".into());
        }
        let (mut stream, _) = match listener.accept() {
            Ok(pair) => pair,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(200));
                continue;
            }
            Err(e) => return Err(format!("loopback accept: {e}")),
        };
        // Geaccepteerde socket kan non-blocking erven (Windows) → terug naar
        // blocking + leestimeout, zodat een half-open verbinding niet hangt.
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..n]);
        let first_line = request.lines().next().unwrap_or("");
        // Verwacht: GET /callback?code=...&state=... HTTP/1.1
        let path = first_line.split_whitespace().nth(1).unwrap_or("");
        if !path.starts_with("/callback") {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
            continue;
        }
        let query = path.splitn(2, '?').nth(1).unwrap_or("");
        let mut code = None;
        let mut state = None;
        let mut error = None;
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            match (kv.next(), kv.next()) {
                (Some("code"), Some(v)) => code = Some(v.to_string()),
                (Some("state"), Some(v)) => state = Some(v.to_string()),
                (Some("error"), Some(v)) => error = Some(v.to_string()),
                _ => {}
            }
        }
        let body = if code.is_some() {
            "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:80px\">\
             <h2>Ingelogd bij OpenAEC</h2><p>Je kunt dit venster sluiten en teruggaan naar Open Calc Studio.</p></body></html>"
        } else {
            "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:80px\">\
             <h2>Inloggen geannuleerd</h2><p>Je kunt dit venster sluiten.</p></body></html>"
        };
        let _ = stream.write_all(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .as_bytes(),
        );
        if let Some(err) = error {
            return Err(format!("inloggen geweigerd: {err}"));
        }
        match (code, state) {
            (Some(c), Some(s)) => return Ok((c, s)),
            _ => return Err("callback zonder code/state".into()),
        }
    }
}

// ── Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn accounts_sign_in(app: tauri::AppHandle) -> Result<UserInfo, String> {
    use tauri_plugin_opener::OpenerExt;

    let cfg = load_config();
    let client = reqwest::Client::new();
    let disco = fetch_discovery(&client, &cfg.issuer).await?;

    // PKCE-verifier + challenge (S256) en state
    let mut raw = [0u8; 48];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    let verifier = b64url(&raw);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let mut raw_state = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut raw_state);
    let state = b64url(&raw_state);

    // Loopback-listener vóór het openen van de browser (fail-fast bij bezet)
    let port = cfg
        .redirect_uri
        .rsplit(':')
        .next()
        .and_then(|s| s.split('/').next())
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(53683);
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("poort {port} niet beschikbaar voor login-callback: {e}"))?;

    let mut auth_url = reqwest::Url::parse(&disco.authorization_endpoint)
        .map_err(|e| format!("authorization_endpoint ongeldig: {e}"))?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &cfg.client_id)
        .append_pair("redirect_uri", &cfg.redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &cfg.scopes)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");

    app.opener()
        .open_url(auth_url.as_str(), None::<String>)
        .map_err(|e| format!("kan systeembrowser niet openen: {e}"))?;
    log::info!("[Accounts] Browser geopend voor login; wacht op callback op poort {port}");

    // wait_for_callback bewaakt zelf de deadline (niet-blokkerend), dus géén
    // extra tokio::time::timeout: die zou de blocking-thread laten doorlopen
    // en de poort bezet houden. Nu keert de thread altijd terug → poort vrij.
    let (code, returned_state) = tokio::task::spawn_blocking(move || wait_for_callback(listener))
        .await
        .map_err(|e| format!("callback-taak mislukt: {e}"))??;

    if returned_state != state {
        return Err("state-mismatch in OAuth-callback (mogelijke spoof) — login afgebroken".into());
    }

    let token: TokenResponse = client
        .post(&disco.token_endpoint)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", cfg.redirect_uri.as_str()),
            ("client_id", cfg.client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("token-exchange mislukt: {e}"))?
        .json()
        .await
        .map_err(|e| format!("token-respons onleesbaar: {e}"))?;

    store_tokens(
        &token.access_token,
        token.refresh_token.as_deref(),
        token.id_token.as_deref(),
    )?;

    let user = token
        .id_token
        .as_deref()
        .and_then(decode_id_token)
        .ok_or_else(|| "id_token ontbreekt of onleesbaar".to_string())?;
    log::info!("[Accounts] Ingelogd als {} <{}>", user.name, user.email);
    Ok(user)
}

#[tauri::command]
pub fn accounts_get_user() -> Option<UserInfo> {
    keyring_get("id_token").as_deref().and_then(decode_id_token)
}

#[tauri::command]
pub fn accounts_sign_out() {
    for entry in ["access_token", "refresh_token", "id_token"] {
        keyring_delete(entry);
    }
    log::info!("[Accounts] Uitgelogd (tokens gewist)");
}

// ── Geauthenticeerde API-calls met refresh-retry ───────────────────────

async fn refresh_tokens(client: &reqwest::Client, cfg: &AccountsConfig) -> Result<String, String> {
    let refresh = keyring_get("refresh_token").ok_or("geen refresh_token — log opnieuw in")?;
    let disco = fetch_discovery(client, &cfg.issuer).await?;
    let token: TokenResponse = client
        .post(&disco.token_endpoint)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", cfg.client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("token-refresh mislukt: {e}"))?
        .json()
        .await
        .map_err(|e| format!("refresh-respons onleesbaar: {e}"))?;
    store_tokens(
        &token.access_token,
        token.refresh_token.as_deref(),
        token.id_token.as_deref(),
    )?;
    Ok(token.access_token)
}

enum ApiBody {
    None,
    Json(serde_json::Value),
    File { name: String, bytes: Vec<u8> },
}

async fn api_request(
    method: &str,
    path: &str,
    body: ApiBody,
) -> Result<(u16, String), String> {
    let cfg = load_config();
    let client = reqwest::Client::new();
    let mut access = keyring_get("access_token").ok_or("niet ingelogd")?;

    for attempt in 0..2 {
        let url = format!("{}{}", cfg.accounts_api_url, path);
        let mut req = match method {
            "GET" => client.get(&url),
            "POST" => client.post(&url),
            "DELETE" => client.delete(&url),
            other => return Err(format!("onbekende methode {other}")),
        };
        req = req.bearer_auth(&access);
        req = match &body {
            ApiBody::None => req,
            ApiBody::Json(v) => req.json(v),
            ApiBody::File { name, bytes } => {
                let part = reqwest::multipart::Part::bytes(bytes.clone())
                    .file_name(name.clone())
                    .mime_str("application/json")
                    .map_err(|e| format!("mime: {e}"))?;
                // Pad (incl. mappen) gaat als apart `path`-veld mee: multer
                // aan de serverkant stript slashes uit de bestandsnaam, dus
                // alleen via dit veld komt een submap-pad heelhuids aan.
                let form = reqwest::multipart::Form::new()
                    .text("path", name.clone())
                    .part("file", part);
                req.multipart(form)
            }
        };
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Accounts API onbereikbaar ({url}): {e}"))?;
        let status = resp.status().as_u16();
        if status == 401 && attempt == 0 {
            log::info!("[Accounts] 401 — token verversen en opnieuw proberen");
            access = refresh_tokens(&client, &cfg).await?;
            continue;
        }
        let text = resp.text().await.unwrap_or_default();
        return Ok((status, text));
    }
    unreachable!()
}

fn parse_api_result(status: u16, text: String) -> Result<serde_json::Value, String> {
    if status == 413 {
        return Err("cloud-opslag vol (quota bereikt) — beheer je opslag in de OpenAEC-portal".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!("Accounts API gaf {status}: {text}"));
    }
    if text.is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(&text).or(Ok(serde_json::Value::String(text)))
}

/// Generieke geauthenticeerde call — `GET /me/apps`, `POST /me/apps` enz.
#[tauri::command]
pub async fn accounts_fetch(
    path: String,
    method: Option<String>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let method = method.unwrap_or_else(|| "GET".into());
    let body = body.map(ApiBody::Json).unwrap_or(ApiBody::None);
    let (status, text) = api_request(&method, &path, body).await?;
    parse_api_result(status, text)
}

/// Upload van een begroting (.ifcCalc-JSON) naar de cloud-opslag.
#[tauri::command]
pub async fn accounts_upload_file(file_name: String, content: String) -> Result<serde_json::Value, String> {
    let (status, text) = api_request(
        "POST",
        "/me/files",
        ApiBody::File { name: file_name, bytes: content.into_bytes() },
    )
    .await?;
    parse_api_result(status, text)
}

/// Download van een cloudbestand; geeft de tekstinhoud (.ifcCalc-JSON) terug.
#[tauri::command]
pub async fn accounts_download_file(id: String) -> Result<String, String> {
    let (status, text) = api_request("GET", &format!("/me/files/{id}"), ApiBody::None).await?;
    if !(200..300).contains(&status) {
        return Err(format!("download mislukt ({status}): {text}"));
    }
    Ok(text)
}
