//! Local REST API for Open Calc Studio.
//!
//! Runs an axum HTTP server on 127.0.0.1:9742 (the WS bridge uses 9741).
//! Anything the UI can do is reachable here:
//!   - GET endpoints serve a snapshot of the live state (the webview pushes
//!     state updates into a `Mutex<ApiSnapshot>` via `Manager::state()`).
//!   - POST/PATCH/PUT/DELETE endpoints emit the same `mcp-mutation` Tauri
//!     event used by the WebSocket bridge, so the existing mcpBridge.ts
//!     handler applies the change to the Zustand store.
//!
//! Auth: loopback-only binding + optional `Authorization: Bearer <token>`
//! header if the `OCS_API_TOKEN` env var is set. No TLS (loopback only).

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{delete, get, patch, post, put},
    Router,
};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Port the REST API listens on.
const API_PORT: u16 = 9742;

/// Snapshot of the live UI state. The webview pushes updates here via a
/// Tauri command (see `api_push_state` in lib.rs). GET endpoints read from
/// this snapshot; if empty, they return 503 with a hint to interact with
/// the UI first.
#[derive(Default)]
pub struct ApiSnapshot {
    pub schedule: Option<Value>,
    pub items: Vec<Value>,
    pub company_info: Option<Value>,
    pub sub_sheets: Vec<Value>,
    pub branches: Vec<Value>,
    pub branches_enabled: bool,
    pub active_branch_id: Option<String>,
    pub resource_library: Vec<Value>,
    pub documents: Vec<Value>,
    pub active_document_id: Option<String>,
    pub staart_breakdown: Option<Value>,
}

pub type SharedSnapshot = Arc<Mutex<ApiSnapshot>>;

#[derive(Clone)]
struct AppState {
    app: AppHandle,
    snapshot: SharedSnapshot,
    token: Option<String>,
}

/// Spawn the REST API server on a background tokio task.
pub fn start_api_server(app: AppHandle, snapshot: SharedSnapshot) {
    let token = std::env::var("OCS_API_TOKEN").ok().filter(|s| !s.is_empty());
    let state = AppState { app, snapshot, token };

    tauri::async_runtime::spawn(async move {
        let app = build_router(state);

        let addr = format!("127.0.0.1:{}", API_PORT);
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                info!("[REST API] Listening on http://{}", addr);
                if let Err(e) = axum::serve(listener, app).await {
                    error!("[REST API] Server crashed: {}", e);
                }
            }
            Err(e) => {
                error!("[REST API] Failed to bind to {}: {}", addr, e);
            }
        }
    });
}

fn build_router(state: AppState) -> Router {
    Router::new()
        // Meta
        .route("/api/v1/health", get(health))
        .route("/api/v1/openapi.json", get(openapi_spec))
        // Budget
        .route("/api/v1/budget", get(get_budget))
        .route("/api/v1/budget/summary", get(get_budget_summary))
        .route("/api/v1/budget/recalculate", post(post_recalculate))
        // Items
        .route("/api/v1/items", get(get_items).post(post_item))
        .route("/api/v1/items/:id", get(get_item).patch(patch_item).delete(delete_item))
        .route("/api/v1/items/:id/move", post(post_item_move))
        // Schedule
        .route("/api/v1/schedule", get(get_schedule).patch(patch_schedule))
        // Company info
        .route("/api/v1/company-info", get(get_company_info).put(put_company_info))
        // Staart
        .route("/api/v1/staart", get(get_staart).put(put_staart))
        // Sheets
        .route("/api/v1/sheets", get(get_sheets).post(post_sheet))
        .route("/api/v1/sheets/:id", patch(patch_sheet).delete(delete_sheet))
        .route("/api/v1/sheets/:id/cells", get(get_cells))
        .route("/api/v1/sheets/:id/cells/:cell_ref", put(put_cell))
        // Branches
        .route("/api/v1/branches", get(get_branches).post(post_branch))
        .route("/api/v1/branches/:id", delete(delete_branch))
        // Resources
        .route("/api/v1/resources", get(get_resources).post(post_resource))
        // Files
        .route("/api/v1/open", post(post_open))
        .route("/api/v1/save", post(post_save))
        // Exports
        .route("/api/v1/export/pdf", post(post_export_pdf))
        .route("/api/v1/export/ifc", post(post_export_ifc))
        // Imports
        .route("/api/v1/import/cuf", post(post_import_cuf))
        .route("/api/v1/import/wpcalc", post(post_import_wpcalc))
        .route("/api/v1/import/xtb", post(post_import_xtb))
        // Documents (tabs)
        .route("/api/v1/documents", get(get_documents).post(post_document))
        .route("/api/v1/documents/:id", delete(delete_document))
        .with_state(state)
}

// ─── Auth ───────────────────────────────────────────────────────────────

fn check_auth(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(expected) = state.token.as_ref() else {
        return Ok(());
    };
    let provided = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));
    match provided {
        Some(t) if t == expected => Ok(()),
        _ => Err(ApiError::unauthorized()),
    }
}

// ─── Error helper ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(skip)]
    status: StatusCode,
}

impl ApiError {
    fn new(status: StatusCode, msg: impl Into<String>) -> Self {
        Self { error: msg.into(), detail: None, status }
    }
    fn with_detail(status: StatusCode, msg: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { error: msg.into(), detail: Some(detail.into()), status }
    }
    fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "missing or invalid Authorization header")
    }
    fn unavailable() -> Self {
        Self::with_detail(
            StatusCode::SERVICE_UNAVAILABLE,
            "no state snapshot available",
            "interact with the UI once so the snapshot is populated",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = self.status;
        (status, Json(self)).into_response()
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

fn emit_mutation(state: &AppState, action: &str, data: Value) -> Result<(), ApiError> {
    #[derive(Serialize, Clone)]
    struct Payload {
        action: String,
        data: Value,
    }
    state
        .app
        .emit("mcp-mutation", Payload { action: action.to_string(), data })
        .map_err(|e| {
            warn!("[REST API] emit failed for action {}: {}", action, e);
            ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, format!("emit failed: {}", e))
        })
}

fn snapshot_or_unavailable(state: &AppState) -> Result<std::sync::MutexGuard<'_, ApiSnapshot>, ApiError> {
    let guard = state
        .snapshot
        .lock()
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "snapshot poisoned"))?;
    if guard.schedule.is_none() && guard.items.is_empty() {
        return Err(ApiError::unavailable());
    }
    Ok(guard)
}

// ─── Meta handlers ──────────────────────────────────────────────────────

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "api": "v1",
    }))
}

async fn openapi_spec() -> Json<Value> {
    // Inline minimal OpenAPI 3.0 spec; the full doc lives in docs/api/openapi.json.
    Json(json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Open Calc Studio Local API",
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Loopback REST API. Companion to the MCP server (port 9741)."
        },
        "servers": [{ "url": "http://127.0.0.1:9742" }],
        "paths": openapi_paths()
    }))
}

fn openapi_paths() -> Value {
    json!({
        "/api/v1/health": { "get": { "summary": "Liveness probe", "responses": { "200": { "description": "OK" } } } },
        "/api/v1/budget": { "get": { "summary": "Full project (schedule + items + companyInfo)", "responses": { "200": { "description": "OK" } } } },
        "/api/v1/budget/summary": { "get": { "summary": "Chapter totals + staart breakdown", "responses": { "200": { "description": "OK" } } } },
        "/api/v1/items": {
            "get": { "summary": "List items (optional ?rowType= ?parentId=)" },
            "post": { "summary": "Create an item" }
        },
        "/api/v1/items/{id}": {
            "get": { "summary": "Get one item" },
            "patch": { "summary": "Update fields of an item" },
            "delete": { "summary": "Delete an item (+ descendants)" }
        },
        "/api/v1/items/{id}/move": { "post": { "summary": "Move item (body: targetId, position)" } },
        "/api/v1/budget/recalculate": { "post": { "summary": "Trigger recalculation" } },
        "/api/v1/schedule": { "get": {}, "patch": {} },
        "/api/v1/company-info": { "get": {}, "put": {} },
        "/api/v1/staart": { "get": {}, "put": {} },
        "/api/v1/sheets": { "get": {}, "post": {} },
        "/api/v1/sheets/{id}": { "patch": {}, "delete": {} },
        "/api/v1/sheets/{id}/cells": { "get": {} },
        "/api/v1/sheets/{id}/cells/{ref}": { "put": {} },
        "/api/v1/branches": { "get": {}, "post": {} },
        "/api/v1/branches/{id}": { "delete": {} },
        "/api/v1/resources": { "get": {}, "post": {} },
        "/api/v1/open": { "post": { "summary": "Open a file (body: { filePath })" } },
        "/api/v1/save": { "post": { "summary": "Save current budget (body: { filePath })" } },
        "/api/v1/export/pdf": { "post": {} },
        "/api/v1/export/ifc": { "post": {} },
        "/api/v1/import/cuf": { "post": {} },
        "/api/v1/import/wpcalc": { "post": {} },
        "/api/v1/import/xtb": { "post": {} },
        "/api/v1/documents": { "get": {}, "post": {} },
        "/api/v1/documents/{id}": { "delete": {} }
    })
}

// ─── GET endpoints (read from snapshot) ─────────────────────────────────

async fn get_budget(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    Ok(Json(json!({
        "schedule": snap.schedule,
        "items": snap.items,
        "companyInfo": snap.company_info,
    })))
}

async fn get_budget_summary(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    let chapters: Vec<&Value> = snap.items.iter()
        .filter(|i| i.get("parentId").map(|v| v.is_null()).unwrap_or(false)
            && i.get("rowType").and_then(|v| v.as_str()) == Some("chapter"))
        .collect();
    Ok(Json(json!({
        "schedule": snap.schedule,
        "itemCount": snap.items.len(),
        "chapterCount": chapters.len(),
        "chapters": chapters,
        "staart": snap.staart_breakdown,
    })))
}

async fn get_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    let row_type_filter = params.get("rowType").cloned();
    let parent_id_filter = params.get("parentId").cloned();
    let filtered: Vec<Value> = snap.items.iter().filter(|i| {
        if let Some(rt) = &row_type_filter {
            if i.get("rowType").and_then(|v| v.as_str()) != Some(rt) {
                return false;
            }
        }
        if let Some(pid) = &parent_id_filter {
            if pid == "root" {
                if !i.get("parentId").map(|v| v.is_null()).unwrap_or(false) {
                    return false;
                }
            } else if i.get("parentId").and_then(|v| v.as_str()) != Some(pid) {
                return false;
            }
        }
        true
    }).cloned().collect();
    Ok(Json(json!({ "count": filtered.len(), "items": filtered })))
}

async fn get_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    snap.items
        .iter()
        .find(|i| i.get("id").and_then(|v| v.as_str()) == Some(&id))
        .cloned()
        .map(Json)
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, format!("item {} not found", id)))
}

async fn get_schedule(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    snap.schedule.clone().map(Json).ok_or_else(ApiError::unavailable)
}

async fn get_company_info(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    snap.company_info.clone().map(Json).ok_or_else(ApiError::unavailable)
}

async fn get_staart(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    let items: Vec<Value> = snap.items.iter()
        .filter(|i| i.get("rowType").and_then(|v| v.as_str())
            .map(|rt| rt.starts_with("staart_"))
            .unwrap_or(false))
        .cloned().collect();
    Ok(Json(json!({
        "staartItems": items,
        "breakdown": snap.staart_breakdown,
    })))
}

async fn get_sheets(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    Ok(Json(json!({ "count": snap.sub_sheets.len(), "sheets": snap.sub_sheets })))
}

async fn get_cells(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    let sheet = snap.sub_sheets.iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, format!("sheet {} not found", id)))?;
    Ok(Json(sheet.get("cells").cloned().unwrap_or(json!({}))))
}

async fn get_branches(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    Ok(Json(json!({
        "enabled": snap.branches_enabled,
        "activeBranchId": snap.active_branch_id,
        "count": snap.branches.len(),
        "branches": snap.branches,
    })))
}

async fn get_resources(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    Ok(Json(json!({ "count": snap.resource_library.len(), "items": snap.resource_library })))
}

async fn get_documents(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let snap = snapshot_or_unavailable(&state)?;
    Ok(Json(json!({
        "activeDocumentId": snap.active_document_id,
        "count": snap.documents.len(),
        "documents": snap.documents,
    })))
}

// ─── Write endpoints (emit `mcp-mutation`) ──────────────────────────────

async fn post_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "add_item", body.clone())?;
    Ok(Json(json!({ "success": true, "queued": body })))
}

async fn patch_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let mut data = body;
    if let Value::Object(ref mut m) = data {
        m.insert("id".into(), Value::String(id.clone()));
    } else {
        data = json!({ "id": id });
    }
    emit_mutation(&state, "update_item", data.clone())?;
    Ok(Json(json!({ "success": true, "id": id, "queued": data })))
}

async fn delete_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "remove_item", json!({ "id": id }))?;
    Ok(Json(json!({ "success": true, "id": id })))
}

async fn post_item_move(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let target = body.get("targetId").and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "targetId required"))?;
    let position = body.get("position").and_then(|v| v.as_str()).unwrap_or("after");
    emit_mutation(&state, "move_items", json!({
        "ids": [id.clone()], "targetId": target, "position": position,
    }))?;
    Ok(Json(json!({ "success": true, "id": id })))
}

async fn post_recalculate(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "recalculate", json!({}))?;
    Ok(Json(json!({ "success": true })))
}

async fn patch_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "update_schedule", body)?;
    Ok(Json(json!({ "success": true })))
}

async fn put_company_info(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "update_company_info", body)?;
    Ok(Json(json!({ "success": true })))
}

async fn put_staart(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    // body: { preset?: "bouw1"|"custom", items?: [...] }
    emit_mutation(&state, "set_staart", body)?;
    Ok(Json(json!({ "success": true })))
}

async fn post_sheet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let name = body.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
    emit_mutation(&state, "add_sheet", json!({ "name": name }))?;
    Ok(Json(json!({ "success": true })))
}

async fn patch_sheet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    if let Some(name) = body.get("name").and_then(|v| v.as_str()) {
        emit_mutation(&state, "rename_sheet", json!({ "id": id, "name": name }))?;
    }
    Ok(Json(json!({ "success": true, "id": id })))
}

async fn delete_sheet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "remove_sheet", json!({ "id": id }))?;
    Ok(Json(json!({ "success": true, "id": id })))
}

async fn put_cell(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((sheet_id, cell_ref)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string();
    emit_mutation(&state, "set_cell", json!({
        "sheetId": sheet_id, "ref": cell_ref.to_uppercase(), "value": value,
    }))?;
    Ok(Json(json!({ "success": true })))
}

async fn post_branch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let name = body.get("name").and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "name required"))?;
    let parent_id = body.get("parentId").and_then(|v| v.as_str());
    emit_mutation(&state, "add_branch", json!({
        "name": name, "parentId": parent_id,
    }))?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_branch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "remove_branch", json!({ "id": id }))?;
    Ok(Json(json!({ "success": true, "id": id })))
}

async fn post_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "add_resource", json!({ "item": body }))?;
    Ok(Json(json!({ "success": true })))
}

async fn post_open(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let file_path = body.get("filePath").and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "filePath required"))?;
    emit_mutation(&state, "open_file_request", json!({ "filePath": file_path }))?;
    Ok(Json(json!({ "success": true, "filePath": file_path })))
}

async fn post_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    let file_path = body.get("filePath").and_then(|v| v.as_str());
    emit_mutation(&state, "save_file_request", json!({ "filePath": file_path }))?;
    Ok(Json(json!({ "success": true })))
}

#[derive(Deserialize)]
struct ExportPdfBody {
    #[serde(default = "default_report_view")]
    report_view: String,
    output_path: Option<String>,
    #[serde(default)]
    page_size: Option<String>,
    #[serde(default)]
    page_orientation: Option<String>,
}
fn default_report_view() -> String { "bouw1".to_string() }

async fn post_export_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ExportPdfBody>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "export_pdf_request", json!({
        "reportView": body.report_view,
        "outputPath": body.output_path,
        "pageSize": body.page_size,
        "pageOrientation": body.page_orientation,
    }))?;
    Ok(Json(json!({ "success": true })))
}

async fn post_export_ifc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "export_ifc_request", body)?;
    Ok(Json(json!({ "success": true })))
}

async fn post_import_cuf(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "import_cuf_xml", json!({ "xmlContent": body }))?;
    Ok(Json(json!({ "success": true, "bytes": body.len() })))
}

async fn post_import_wpcalc(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "import_wpcalc_binary", json!({ "size": body.len() }))?;
    Ok(Json(json!({ "success": true, "bytes": body.len(), "note": "binary streaming through MCP bridge is not yet wired; please post a filePath via /open instead" })))
}

async fn post_import_xtb(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "import_xtb_binary", json!({ "size": body.len() }))?;
    Ok(Json(json!({ "success": true, "bytes": body.len(), "note": "binary streaming through MCP bridge is not yet wired; please post a filePath via /open instead" })))
}

async fn post_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "add_document", body)?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    check_auth(&state, &headers)?;
    emit_mutation(&state, "remove_document", json!({ "id": id }))?;
    Ok(Json(json!({ "success": true, "id": id })))
}
