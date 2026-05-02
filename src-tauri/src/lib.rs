pub mod reports;
pub mod wpcalc_export;
pub mod ws_bridge;

#[tauri::command]
fn open_new_window(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    use tauri::Manager;

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

/// Write MCP server configuration to ~/.claude/ so Claude Code can discover it
fn write_mcp_config(app: &tauri::App) {
    use std::io::Write;
    use tauri::Manager;
    let resource_dir = app.path().resource_dir().unwrap_or_default();
    let mcp_path = resource_dir.join("ocs-mcp.mjs");
    let mcp_path_str = mcp_path.to_string_lossy().replace('\\', "/");

    // Write to ~/.claude/open-calc-studio-mcp.json
    if let Some(home) = dirs::home_dir() {
        let claude_dir = home.join(".claude");
        let _ = std::fs::create_dir_all(&claude_dir);
        let config_path = claude_dir.join("open-calc-studio-mcp.json");
        let config = format!(
            "{{\"mcpServers\":{{\"open-calc-studio\":{{\"command\":\"node\",\"args\":[\"{}\"]}}}}}}", mcp_path_str
        );
        if let Ok(mut f) = std::fs::File::create(&config_path) {
            let _ = f.write_all(config.as_bytes());
            log::info!("[MCP Config] Written to {}", config_path.display());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
        reports::generate_pdf_report,
        reports::generate_pdf_preview,
        reports::generate_offerte_pdf,
        reports::generate_offerte_preview,
        wpcalc_export::export_wpcalc,
        open_new_window
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Start the WebSocket bridge server for MCP ↔ UI communication
      ws_bridge::start_ws_bridge(app.handle().clone());

      // Write MCP server config so Claude Code can discover it
      write_mcp_config(app);

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
