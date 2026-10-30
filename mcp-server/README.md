# Open Calc Studio MCP Server

MCP (Model Context Protocol) server for interacting with Open Calc Studio budget files.

The same MCP server now exposes the live desktop through `app_list_actions`,
`app_action`, `app_get_state`, `app_open_budget`, `app_save_budget`,
`app_open_pdf` and `app_open_ifc`. This includes 202 JSON-callable store actions,
plus file operations, PDF measurement editing and IFC-Lite selection/takeoff.
Use [the desktop MCP guide](../docs/mcp-desktop.md) for exact workflows.
The existing unprefixed tools operate on a separate in-memory file project;
use `app_*` consistently when working on the live desktop document.
Unsupported vendor formats and GAEB export remain unsupported.

## Setup

```bash
cd mcp-server
npm install
```

## Usage

```bash
npm start
```

Or via Claude Desktop / claude code config:

```json
{
  "mcpServers": {
    "open-calc-studio": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "<path-to-repo>/mcp-server"
    }
  }
}
```

## Tools

### Exchange files

- `get_capabilities`: machine-readable list of supported formats and gaps.
- `open_budget`: native `.ifcCalc`/`.ocs`/`.ifcx`/`.json`, IBIS `.xtb`,
  WpCalc `.calc`/`.mdb`, FIEBDC `.bc3`, CUF `.cuf`, RAW `.rsx`, ÖNORM
  `.onlv`/`.onlb`, and GAEB DA XML `.x81`/`.x82`/`.x83`/`.x86`/`.x87`.
- `apply_gaeb_x84`: apply prices from an X84 offer to matching positions in
  an open X83 budget; unmatched or ambiguous positions fail without edits.
- `export_exchange_file`: write a **new** `.bc3`, `.onlv`, `.cuf`, TRADXML or
  `.rsx` file. Existing output files are never overwritten.
- `save_budget`: save the working project as native JSON only. Opening an
  exchange file never causes a subsequent save to overwrite that source.

GAEB import currently covers the BoQ hierarchy, item descriptions, units,
quantities and unit prices. It warns about fields it cannot preserve; it is
not a certified GAEB round-trip implementation. X84 is a price-only overlay,
not a standalone budget. Proprietary `.ost`/`.osp`, `.dcf` and `.xpwe` files
are not supported.

### `export_pdf`

Generate a PDF report from the standalone server's current project. Call
`open_budget` first. This does not export the live desktop document.

**Input:**

| Parameter    | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `outputPath`| string | Yes      | Output PDF path, resolved against the server's working directory |
| `reportView`| string | No       | `werkbeschrijving`, `hoofdaanneming`, `onderaanneming`, `inschrijfstaat`, `nacalculatie`, `bouw1` (default), or `offerte` |

**Output:**

```json
{
  "success": true,
  "pdfPath": "/path/to/output.pdf"
}
```

**How it works:**

The tool looks for `gen_pdf` in this repository's `src-tauri/target/release`
or `debug` directory. Build it first:

```bash
cd src-tauri
cargo build --release --bin gen_pdf
```

The binary accepts: `gen_pdf <input.ifcx> <output.pdf>`

The standalone tool does not currently discover the generator from an installed
app or a relocated server bundle. For the running desktop document, use its
[`POST /api/v1/export/pdf`](../docs/api/README.md) endpoint. The separate
headless HTTP service provides calculation tools; it does not expose PDF export.

## Development

```bash
npm run build   # Compile TypeScript
npm start       # Run with tsx (dev)
```

## Shared calculation core

MCP now uses the application's calculator and native project reader, also
available as `@openaec/open-calc-studio/core`. This keeps markups, hourly rates,
rounding and VAT consistent between the UI and server.

From the repository root:

```sh
npm run build:lib
npm --prefix mcp-server ci
npm --prefix mcp-server run test:calculator
npm --prefix mcp-server run test:exchange
npm --prefix mcp-server run bundle
```

The integration test runs the real stdio server, edits temporary budgets, and
compares all line totals and the complete summary against the built library
for the sample, direct hourly rates and mixed VAT.
