# Open Calc Studio — Local API

The desktop app exposes two local-only servers when running:

| Service       | Port  | Protocol      | Purpose                                 |
|---------------|-------|---------------|-----------------------------------------|
| MCP bridge    | 9741  | WebSocket     | MCP server ⇄ UI mutation channel        |
| REST API      | 9742  | HTTP/1.1      | Plain JSON REST for scripts / automations |

Both bind to `127.0.0.1` only. There is no CORS or TLS — the API is
intended for the local user. If you want to call the API from another
machine, use an SSH tunnel.

## MCP coverage

The MCP server (`mcp-server/src/index.ts`) is the most ergonomic entry
point for LLMs and Claude Code. It currently exposes:

### Budget CRUD
- `open_budget`, `save_budget`
- `get_budget_summary`, `get_items`
- `add_item`, `update_item`, `remove_item`, `add_chapter`
- `recalculate`
- `update_schedule`
- `set_staart`, `get_staart`
- `create_budget_structure`, `import_uittrekstaat`
- `lookup_reference_project`

### Exports
- `export_pdf`, `export_ifc`, `export_ifcx`
- `list_report_types`

### Spreadsheet (sub-sheets)
- `add_sheet`, `list_sheets`, `rename_sheet`, `remove_sheet`
- `set_cell`, `get_cell`, `set_cells_batch`

### Branches (budget variants)
- `list_branches`, `add_branch`, `remove_branch`, `rename_branch`
- `set_active_branch`, `toggle_branches_enabled`

### Company / Project info
- `get_company_info`, `update_company_info`
- `get_project_info`, `update_project_info`

### Resource library
- `list_resources`, `add_resource`, `update_resource`, `remove_resource`
- `bulk_set_resource_library`

### Tree manipulation
- `move_items`, `indent_item`, `outdent_item`, `toggle_collapse`

### Document tabs
- `list_documents`, `add_document`, `switch_document`, `remove_document`

### XML importers
- `import_cuf_xml`, `import_tradxml`, `import_rsx` (budget items)
- `import_zsx` (price list → resource library)
- `import_nsx` (norms)

## REST API authentication

Authentication is **off by default**. To require a bearer token, launch
the app with the `OCS_API_TOKEN` env var set:

```pwsh
$env:OCS_API_TOKEN = "your-long-random-secret"; npx tauri dev
```

Then every request must include:

```
Authorization: Bearer your-long-random-secret
```

## REST API quickstart

```bash
# Liveness probe (never requires auth)
curl http://127.0.0.1:9742/api/v1/health

# Full OpenAPI spec served by the running app
curl http://127.0.0.1:9742/api/v1/openapi.json

# Read budget summary
curl http://127.0.0.1:9742/api/v1/budget/summary

# List items (filtered)
curl "http://127.0.0.1:9742/api/v1/items?rowType=chapter"

# Create a new chapter via REST
curl -X POST http://127.0.0.1:9742/api/v1/items \
  -H "Content-Type: application/json" \
  -d '{"parentId": null, "rowType": "chapter", "description": "New chapter", "code": "10"}'

# Update an item
curl -X PATCH http://127.0.0.1:9742/api/v1/items/<id> \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated", "quantity": 12}'

# Delete an item (cascades to descendants)
curl -X DELETE http://127.0.0.1:9742/api/v1/items/<id>

# Move an item (drag/drop equivalent)
curl -X POST http://127.0.0.1:9742/api/v1/items/<id>/move \
  -H "Content-Type: application/json" \
  -d '{"targetId": "<other-id>", "position": "after"}'

# Trigger a recalculation
curl -X POST http://127.0.0.1:9742/api/v1/budget/recalculate

# Update schedule fields
curl -X PATCH http://127.0.0.1:9742/api/v1/schedule \
  -H "Content-Type: application/json" \
  -d '{"projectName": "Demo project", "author": "Jan Jansen"}'

# Replace company info (letterhead)
curl -X PUT http://127.0.0.1:9742/api/v1/company-info \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo BV", "postalCity": "Utrecht", "phone": "+31 30 123 4567"}'

# Set staart to standard Bouw 1 percentages
curl -X PUT http://127.0.0.1:9742/api/v1/staart \
  -H "Content-Type: application/json" \
  -d '{"preset": "bouw1"}'

# Create a new sub-sheet, then write A1
curl -X POST http://127.0.0.1:9742/api/v1/sheets \
  -H "Content-Type: application/json" \
  -d '{"name": "Hoeveelheden"}'

curl -X PUT http://127.0.0.1:9742/api/v1/sheets/<sheetId>/cells/A1 \
  -H "Content-Type: application/json" \
  -d '{"value": "=SUM(B1:B10)"}'

# Branches
curl http://127.0.0.1:9742/api/v1/branches
curl -X POST http://127.0.0.1:9742/api/v1/branches \
  -H "Content-Type: application/json" \
  -d '{"name": "alternative", "parentId": "main"}'

# Resources
curl http://127.0.0.1:9742/api/v1/resources
curl -X POST http://127.0.0.1:9742/api/v1/resources \
  -H "Content-Type: application/json" \
  -d '{"code": "BETON-C25", "description": "Beton C25/30", "unit": "m3", "resourceType": "materiaal", "defaultUnitPrice": 95}'

# Open a file from disk
curl -X POST http://127.0.0.1:9742/api/v1/open \
  -H "Content-Type: application/json" \
  -d '{"filePath": "C:/Users/me/Documents/project.ocs"}'

# Save current budget
curl -X POST http://127.0.0.1:9742/api/v1/save \
  -H "Content-Type: application/json" \
  -d '{"filePath": "C:/Users/me/Documents/project.ocs"}'

# Export a PDF (uses the standard Bouw 1 report layout)
curl -X POST http://127.0.0.1:9742/api/v1/export/pdf \
  -H "Content-Type: application/json" \
  -d '{"report_view": "bouw1", "output_path": "C:/Users/me/Documents/begroting.pdf"}'

# Export IFC
curl -X POST http://127.0.0.1:9742/api/v1/export/ifc \
  -H "Content-Type: application/json" -d '{}'

# Import a CUF-XML body
curl -X POST http://127.0.0.1:9742/api/v1/import/cuf \
  -H "Content-Type: application/xml" \
  --data-binary @"./mybudget.cuf"
```

## Endpoint reference

The authoritative reference is `docs/api/openapi.json`. The running app
also serves a minimal inline spec at `/api/v1/openapi.json`.

| Method  | Path                                  | Purpose                                |
|---------|---------------------------------------|----------------------------------------|
| GET     | /api/v1/health                        | Liveness probe                         |
| GET     | /api/v1/openapi.json                  | Inline OpenAPI spec                    |
| GET     | /api/v1/budget                        | Schedule + items + companyInfo         |
| GET     | /api/v1/budget/summary                | Chapter totals + staart breakdown      |
| POST    | /api/v1/budget/recalculate            | Trigger a recalculation                |
| GET     | /api/v1/items                         | List items (filters: rowType, parentId)|
| POST    | /api/v1/items                         | Create item                            |
| GET     | /api/v1/items/:id                     | Read one item                          |
| PATCH   | /api/v1/items/:id                     | Update item fields                     |
| DELETE  | /api/v1/items/:id                     | Delete item + descendants              |
| POST    | /api/v1/items/:id/move                | Move item (targetId, position)         |
| GET     | /api/v1/schedule                      | Project metadata                       |
| PATCH   | /api/v1/schedule                      | Update project metadata                |
| GET     | /api/v1/company-info                  | Company info / letterhead              |
| PUT     | /api/v1/company-info                  | Replace company info                   |
| GET     | /api/v1/staart                        | Staart items + breakdown               |
| PUT     | /api/v1/staart                        | Replace staart configuration           |
| GET     | /api/v1/sheets                        | List sub-sheets                        |
| POST    | /api/v1/sheets                        | Create sub-sheet                       |
| PATCH   | /api/v1/sheets/:id                    | Rename sub-sheet                       |
| DELETE  | /api/v1/sheets/:id                    | Remove sub-sheet                       |
| GET     | /api/v1/sheets/:id/cells              | Read all cells                         |
| PUT     | /api/v1/sheets/:id/cells/:ref         | Set one cell (A1)                      |
| GET     | /api/v1/branches                      | List branches                          |
| POST    | /api/v1/branches                      | Add a branch                           |
| DELETE  | /api/v1/branches/:id                  | Remove branch                          |
| GET     | /api/v1/resources                     | Resource library                       |
| POST    | /api/v1/resources                     | Add a resource                         |
| POST    | /api/v1/open                          | Open a file from disk                  |
| POST    | /api/v1/save                          | Save current budget                    |
| POST    | /api/v1/export/pdf                    | Generate a PDF report                  |
| POST    | /api/v1/export/ifc                    | IFC4X3 export                          |
| POST    | /api/v1/import/cuf                    | CUF-XML import                         |
| POST    | /api/v1/import/wpcalc                 | WpCalc binary upload (use /open instead for large files) |
| POST    | /api/v1/import/xtb                    | XTB binary upload (use /open instead for large files) |
| GET     | /api/v1/documents                     | List document tabs                     |
| POST    | /api/v1/documents                     | New tab                                |
| DELETE  | /api/v1/documents/:id                 | Close tab                              |

## How read endpoints work

GET endpoints serve a snapshot pushed by the webview. The frontend
calls the `api_push_state` Tauri command whenever store state changes
(currently triggered from `mcpBridge.ts` after applying every mutation
plus on mount). If the snapshot is still empty you get a 503 with a
hint to interact with the UI once. Write endpoints emit the same
`mcp-mutation` event used by the WebSocket bridge, so writes are
applied in-process by the existing `handleMutation` switch.

## Limitations (v1)

- Writes are fire-and-forget over the Tauri event bus. The HTTP
  response acknowledges the request was queued, not that it was
  applied. To verify, re-GET the resource.
- File-upload import endpoints (`/import/wpcalc`, `/import/xtb`) only
  acknowledge the upload size today. Prefer `POST /api/v1/open` with a
  file path; the existing WpCalc/XTB importer wakes up automatically.
- No pagination on `/items` — but the data set is small enough that
  this rarely matters.
- No CORS, no TLS, loopback-only. Do not expose port 9742 publicly.
