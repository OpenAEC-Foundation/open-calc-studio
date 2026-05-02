//! WebSocket bridge server for MCP ↔ Tauri communication.
//!
//! Starts a tiny WebSocket server on port 9741. The MCP server connects as a
//! client and sends JSON mutation messages. Each message is forwarded to the
//! Tauri webview via `app.emit("mcp-mutation", payload)` so the frontend
//! Zustand store can apply changes in real time.

use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

/// Port the WebSocket bridge listens on.
const WS_PORT: u16 = 9741;

/// Envelope for every message sent over the WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMutation {
    /// The mutation action, e.g. "add_item", "remove_item", "update_item",
    /// "add_chapter", "set_items", "open_budget", "save_budget", "update_schedule".
    pub action: String,
    /// Arbitrary JSON payload — the frontend decides how to interpret it based
    /// on `action`.
    #[serde(default)]
    pub data: serde_json::Value,
}

/// Response sent back to the MCP client over the WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Echo the action back so the MCP client can correlate.
    pub action: String,
}

/// Spawn the WebSocket bridge server on a background tokio task.
///
/// This must be called from within a tokio runtime (Tauri 2 runs on tokio).
pub fn start_ws_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let addr = format!("127.0.0.1:{}", WS_PORT);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => {
                info!("[WS Bridge] Listening on ws://{}", addr);
                l
            }
            Err(e) => {
                error!("[WS Bridge] Failed to bind to {}: {}", addr, e);
                return;
            }
        };

        loop {
            match listener.accept().await {
                Ok((stream, peer)) => {
                    info!("[WS Bridge] New connection from {}", peer);
                    let app_handle = app.clone();
                    tokio::spawn(handle_connection(stream, app_handle));
                }
                Err(e) => {
                    warn!("[WS Bridge] Accept error: {}", e);
                }
            }
        }
    });
}

async fn handle_connection(stream: tokio::net::TcpStream, app: AppHandle) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("[WS Bridge] WebSocket handshake failed: {}", e);
            return;
        }
    };

    let (write, mut read) = ws_stream.split();
    let write = Arc::new(Mutex::new(write));

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let response = process_message(&text, &app);
                let reply = serde_json::to_string(&response).unwrap_or_default();
                let w = write.clone();
                let mut guard = w.lock().await;
                if let Err(e) = guard.send(Message::Text(reply.into())).await {
                    warn!("[WS Bridge] Failed to send response: {}", e);
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                info!("[WS Bridge] Client disconnected");
                break;
            }
            Ok(Message::Ping(data)) => {
                let w = write.clone();
                let mut guard = w.lock().await;
                let _ = guard.send(Message::Pong(data)).await;
            }
            Ok(_) => {} // ignore binary, pong, etc.
            Err(e) => {
                warn!("[WS Bridge] Read error: {}", e);
                break;
            }
        }
    }
}

fn process_message(text: &str, app: &AppHandle) -> McpResponse {
    let mutation: McpMutation = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            return McpResponse {
                success: false,
                error: Some(format!("Invalid JSON: {}", e)),
                action: "unknown".into(),
            };
        }
    };

    let action = mutation.action.clone();

    // Forward to the frontend via Tauri event system
    match app.emit("mcp-mutation", &mutation) {
        Ok(_) => {
            info!("[WS Bridge] Emitted mcp-mutation: {}", action);
            McpResponse {
                success: true,
                error: None,
                action,
            }
        }
        Err(e) => {
            error!("[WS Bridge] Failed to emit event: {}", e);
            McpResponse {
                success: false,
                error: Some(format!("Emit failed: {}", e)),
                action,
            }
        }
    }
}
