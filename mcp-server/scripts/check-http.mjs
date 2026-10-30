import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const child = spawn(process.execPath, [new URL('../dist/ocs-mcp.mjs', import.meta.url).pathname], {
  env: { ...process.env, OCS_DISABLE_BRIDGE: '1', OCS_MCP_TRANSPORT: 'http', OCS_MCP_HOST: '127.0.0.1', OCS_MCP_PORT: String(port), OCS_MCP_TOKEN: 'integration-only-token' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let diagnostics = ''; child.stderr.on('data', data => { diagnostics += data; });
const url = new URL(`http://127.0.0.1:${port}/mcp`);
const clients = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).status === 401) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw Error(diagnostics);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, diagnostics);
  for (let i = 0; i < 2; i++) {
    const client = new Client({ name: 'container-http-check', version: '1' }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: 'Bearer integration-only-token' } } }));
    const tools = await client.listTools();
    assert.ok(tools.tools.some(tool => tool.name === 'app_action'));
    assert.ok(tools.tools.some(tool => tool.name === 'app_list_actions'));
    const result = await client.callTool({ name: 'get_capabilities', arguments: {} });
    assert.ok(!result.isError); assert.ok(JSON.parse(result.content[0].text).importFiles.includes('.bc3'));
  }
  const headers = { authorization: 'Bearer integration-only-token', 'content-type': 'application/json' };
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'bad json' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'mcp-session-id': 'unknown' }, body: '{}' })).status, 404);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{}' })).status, 400);
  console.log('PASS bundled HTTP MCP: two external SDK sessions, native tool discovery, capabilities, auth, origins, malformed JSON and unknown sessions');
} finally {
  for (const client of clients) await client.close();
  child.kill('SIGTERM');
  if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise((_, reject) => { const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('HTTP MCP did not shut down')); }, 3000); timer.unref(); })]);
}
