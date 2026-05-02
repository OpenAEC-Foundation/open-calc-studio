import { readFileSync } from 'fs';
import { createServer } from 'http';
import { resolve } from 'path';

const file = process.argv[2] || 'docs/superpowers/specs/2026-04-15-spraakgestuurde-begroting-design.md';
const md = readFileSync(resolve(file), 'utf-8');

// Simple markdown to HTML
const html = md
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/^- (.+)$/gm, '<li>$1</li>')
  .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  .replace(/\n\n/g, '<br><br>')
  .replace(/\|(.+)\|/g, (m) => {
    const cells = m.split('|').filter(c => c.trim()).map(c => `<td style="border:1px solid #ddd;padding:4px 8px">${c.trim()}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  });

const page = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:system-ui;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333;background:#fff}
h1{color:#d97706;border-bottom:2px solid #d97706;padding-bottom:8px}
h2{color:#444;margin-top:32px}
h3{color:#666;margin-top:24px}
code{background:#f3f4f6;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:12px 0}
td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}
tr:nth-child(even){background:#f9fafb}
li{margin:2px 0}
</style></head><body>${html}</body></html>`;

createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html'});
  res.end(page);
}).listen(3200, () => console.log('Preview on http://localhost:3200'));
