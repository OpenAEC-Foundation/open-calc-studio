# Open Calc Studio MCP Server

MCP (Model Context Protocol) server for interacting with Open Calc Studio budget files.

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

### `export_pdf`

Generate a PDF report from an Open Calc Studio budget file (`.ifcx` or `.ocs`).

**Input:**

| Parameter    | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `filePath`  | string | Yes      | Absolute path to the input budget file (.ifcx or .ocs) |
| `outputPath`| string | No       | Absolute path for the output PDF. Defaults to same directory as input with .pdf extension |
| `reportView`| string | No       | Report layout: `werkbeschrijving`, `hoofdaanneming`, `bouw1` (default), or `inschrijfstaat` |

**Output:**

```json
{
  "pdfPath": "/path/to/output.pdf",
  "pageCount": 5
}
```

**How it works:**

The tool uses the `gen_pdf` standalone binary (built from `src-tauri/src/bin/gen_pdf.rs`) to generate the PDF. The binary must be built first:

```bash
cd src-tauri
cargo build --release --bin gen_pdf
```

The binary accepts: `gen_pdf <input.ifcx> <output.pdf>`

## Development

```bash
npm run build   # Compile TypeScript
npm start       # Run with tsx (dev)
```
