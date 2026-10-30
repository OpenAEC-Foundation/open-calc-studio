pub mod accounts;
pub mod api;
pub mod reports;
pub mod wpcalc_export;
pub mod ws_bridge;
#[cfg(desktop)]
mod native_library;

use std::sync::{Arc, Mutex};
use tauri::Manager;

/// De webview meldt hier het resultaat van een export die via de REST API
/// is aangevraagd (zie `api::emit_and_await`).
#[tauri::command]
fn api_export_result(
    pending: tauri::State<'_, api::PendingResults>,
    request_id: String,
    result: serde_json::Value,
) {
    api::resolve_pending(&pending, &request_id, result);
}

/// Frontend pushes its current state snapshot here whenever it changes,
/// so REST GET endpoints can return live data.
#[tauri::command]
fn api_push_state(
    snapshot: tauri::State<'_, api::SharedSnapshot>,
    schedule: Option<serde_json::Value>,
    items: Option<Vec<serde_json::Value>>,
    company_info: Option<serde_json::Value>,
    sub_sheets: Option<Vec<serde_json::Value>>,
    branches: Option<Vec<serde_json::Value>>,
    branches_enabled: Option<bool>,
    active_branch_id: Option<String>,
    resource_library: Option<Vec<serde_json::Value>>,
    documents: Option<Vec<serde_json::Value>>,
    active_document_id: Option<String>,
    staart_breakdown: Option<serde_json::Value>,
) -> Result<(), String> {
    let mut guard = snapshot
        .lock()
        .map_err(|_| "snapshot lock poisoned".to_string())?;
    if let Some(v) = schedule { guard.schedule = Some(v); }
    if let Some(v) = items { guard.items = v; }
    if let Some(v) = company_info { guard.company_info = Some(v); }
    if let Some(v) = sub_sheets { guard.sub_sheets = v; }
    if let Some(v) = branches { guard.branches = v; }
    if let Some(v) = branches_enabled { guard.branches_enabled = v; }
    if active_branch_id.is_some() { guard.active_branch_id = active_branch_id; }
    if let Some(v) = resource_library { guard.resource_library = v; }
    if let Some(v) = documents { guard.documents = v; }
    if active_document_id.is_some() { guard.active_document_id = active_document_id; }
    if let Some(v) = staart_breakdown { guard.staart_breakdown = Some(v); }
    Ok(())
}

#[tauri::command]
fn open_new_window(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    // Percent-encode the file path for use in query string
    let encoded_path: String = file_path
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                (b as char).to_string()
            }
            _ => format!("%{:02X}", b),
        })
        .collect();

    // Store the file path in a temp file so the new window can read it
    let temp_path = std::env::temp_dir().join(format!("ocs-open-{}.txt", &label));
    std::fs::write(&temp_path, &file_path).map_err(|e| e.to_string())?;

    // Use the devUrl from tauri.conf.json (port 4200) in dev, tauri:// in production
    let url_str = if cfg!(debug_assertions) {
        format!("http://localhost:4200/?file={}&_t={}", encoded_path, label)
    } else {
        format!("tauri://localhost/?file={}&_t={}", encoded_path, label)
    };

    let url: tauri::Url = url_str.parse::<tauri::Url>().map_err(|e| e.to_string())?;

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url))
        .title(format!("Open Calc Studio - {}", file_path.split(['/', '\\']).last().unwrap_or(&file_path)))
        .inner_size(1400.0, 900.0)
        .decorations(false)
        .shadow(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Windows-gebruikersnaam (of $USER op unix) — gebruikt om wijzigingen aan
/// begrotingsregels toe te schrijven aan een persoon. Faalt nooit; valt terug
/// op "onbekend" als geen van beide omgevingsvariabelen bestaat.
#[tauri::command]
fn get_os_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "onbekend".to_string())
}

/// Write MCP server configuration to ~/.claude/ so Claude Code can discover it
fn write_mcp_config(app: &tauri::App) {
    if std::env::var("OCS_SKIP_MCP_CONFIG").as_deref() == Ok("1") { return; }
    use std::io::Write;
    use sha2::{Digest, Sha256};
    use tauri::Manager;
    let resource_dir = app.path().resource_dir().unwrap_or_default();
    // Tauri maps a bundled resource outside src-tauri (`../mcp-server/...`)
    // under `_up_` in the installed resource directory.
    let mcp_path = [
        resource_dir.join("_up_").join("mcp-server").join("dist").join("ocs-mcp.mjs"),
        resource_dir.join("ocs-mcp.mjs"),
        std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("ocs-mcp.mjs"))).unwrap_or_default(),
    ]
    .into_iter()
    .find(|path| path.is_file());
    let Some(mcp_path) = mcp_path else {
        log::warn!("[MCP Config] Bundled ocs-mcp.mjs not found in {}", resource_dir.display());
        return;
    };
    let node_command = std::env::var("OPEN_CALC_NODE").unwrap_or_else(|_| "node".to_string());

    // Write to ~/.claude/open-calc-studio-mcp.json
    if let Some(home) = dirs::home_dir() {
        // AppImage resources are extracted into a temporary directory. Copy the
        // bundled server to a content-addressed, persistent user path first.
        let bytes = match std::fs::read(&mcp_path) {
            Ok(bytes) => bytes,
            Err(e) => {
                log::warn!("[MCP Config] Cannot read bundled server: {}", e);
                return;
            }
        };
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let data_dir = dirs::data_local_dir().unwrap_or_else(|| home.join(".local").join("share"));
        let mcp_dir = data_dir.join("open-calc-studio").join("mcp");
        if let Err(e) = std::fs::create_dir_all(&mcp_dir) {
            log::warn!("[MCP Config] Cannot create {}: {}", mcp_dir.display(), e);
            return;
        }
        let installed_mcp = mcp_dir.join(format!("ocs-mcp-{}.mjs", hash));
        if !installed_mcp.is_file() {
            if let Err(e) = std::fs::write(&installed_mcp, &bytes) {
                log::warn!("[MCP Config] Cannot install server at {}: {}", installed_mcp.display(), e);
                return;
            }
        }
        let mcp_path_str = installed_mcp.to_string_lossy().replace('\\', "/");
        let claude_dir = home.join(".claude");
        let _ = std::fs::create_dir_all(&claude_dir);
        let config_path = claude_dir.join("open-calc-studio-mcp.json");
        let config = serde_json::json!({
            "mcpServers": {
                "open-calc-studio": {
                    "command": node_command,
                    "args": [mcp_path_str],
                    "env": {
                        "OCS_DESKTOP_API_URL": format!("http://127.0.0.1:{}", std::env::var("OCS_API_PORT").unwrap_or_else(|_| "9742".into())),
                        "OCS_DISABLE_BRIDGE": "1"
                    }
                }
            }
        }).to_string();
        if let Ok(mut f) = std::fs::File::create(&config_path) {
            let _ = f.write_all(config.as_bytes());
            log::info!("[MCP Config] Written to {}", config_path.display());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  run_return().expect("error while running tauri application");
}

/// Shared entry for the executable and C ABI. Closing the window returns to
/// the caller; it must not terminate a program that loaded our DLL.
pub fn run_return() -> Result<i32, tauri::Error> {
  #[cfg(target_os = "windows")]
  if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
    std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "--disable-gpu --disable-features=CalculateNativeWinOcclusion",
    );
  }
  tauri::Builder::default()
    .append_invoke_initialization_script(if std::env::var("OCS_CONTAINER").as_deref() == Ok("1") {
      "window.__OCS_CONTAINER__ = true;"
    } else { "" })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_opener::init())
    // Platformdetectie: zonder deze registratie faalde platform() in de
    // frontend stil, waardoor de titelbalk op macOS geen ruimte vrijhield
    // voor de stoplichtknoppen van het systeem.
    .plugin(tauri_plugin_os::init())
    .invoke_handler(tauri::generate_handler![
        reports::generate_pdf_report,
        reports::generate_pdf_preview,
        reports::generate_ibis_report,
        reports::generate_ibis_preview,
        reports::generate_offerte_pdf,
        reports::generate_offerte_preview,
        wpcalc_export::export_wpcalc,
        open_new_window,
        get_os_username,
        api_push_state,
        api_export_result,
        accounts::accounts_sign_in,
        accounts::accounts_get_user,
        accounts::accounts_sign_out,
        accounts::accounts_fetch,
        accounts::accounts_upload_file,
        accounts::accounts_download_file
    ])
    .setup(|app| {
      if std::env::var("OCS_CONTAINER").as_deref() == Ok("1") {
        if let Some(window) = app.get_webview_window("main") {
          window.set_fullscreen(true)?;
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Start the WebSocket bridge server for MCP ↔ UI communication
      ws_bridge::start_ws_bridge(app.handle().clone());

      // Initialize shared API snapshot and start the local REST API server.
      let snapshot: api::SharedSnapshot = Arc::new(Mutex::new(api::ApiSnapshot::default()));
      app.manage(snapshot.clone());
      let pending: api::PendingResults = Arc::new(Mutex::new(std::collections::HashMap::new()));
      app.manage(pending.clone());
      api::start_api_server(app.handle().clone(), snapshot, pending);

      // Write MCP server config so Claude Code can discover it
      write_mcp_config(app);

      // File-association: if launched with a file path argument, emit it to the frontend.
      // Windows passes "C:\path\to\file.ifcCalc" as argv[1] when the user double-clicks an associated file.
      {
        use tauri::Emitter;
        let args: Vec<String> = std::env::args().collect();
        if args.len() > 1 {
          let file_arg = args[1].clone();
          if !file_arg.starts_with('-') && std::path::Path::new(&file_arg).exists() {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
              std::thread::sleep(std::time::Duration::from_millis(800));
              let _ = handle.emit("file-association-open", file_arg);
            });
          }
        }
      }

      Ok(())
    })
    // Diagnose: log wie het afsluiten initieert. Zien we vóór een "stille dood"
    // een CloseRequested in het log → venster is bewust gesloten (gebruiker/OS);
    // zien we niets → proces is extern beëindigd.
    .on_window_event(|window, event| match event {
      tauri::WindowEvent::CloseRequested { .. } => {
        log::info!("[WindowEvent] CloseRequested op '{}'", window.label());
      }
      tauri::WindowEvent::Destroyed => {
        log::info!("[WindowEvent] Destroyed '{}'", window.label());
      }
      _ => {}
    })
    .build(tauri::generate_context!())
    .map(|app| app.run_return(|_, _| {}))
}
