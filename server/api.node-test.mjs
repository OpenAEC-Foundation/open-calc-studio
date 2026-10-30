import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApi, executeTool } from '../dist-server/server.mjs';
// Compare the service with the public UI/library core built independently.
const coreBuild = await build({ entryPoints: ['src/lib/core.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const core = await import('data:text/javascript;base64,' + Buffer.from(coreBuild.outputFiles[0].text).toString('base64'));
const token = 'test-only-token-with-at-least-32-characters';
const logs = [];
const server = createApi({ keyHashes: [createHash('sha256').update(token).digest('hex')], log: record => logs.push(record) });
let base;
before(async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));
const project = JSON.parse(readFileSync(new URL('../public/data/voorbeeld.ifcCalc', import.meta.url), 'utf8'));
const calculate = body => fetch(base + '/v1/tools/calculate_project', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('health is public; calculations require authentication', async () => {
  assert.equal((await fetch(base + '/v1/health')).status, 200);
  assert.equal((await fetch(base + '/v1/tools/calculate_project', { method: 'POST' })).status, 401);
});
test('a real project is recalculated without a desktop or browser', async () => {
  const response = await calculate({ project }); assert.equal(response.status, 200);
  const result = await response.json(); assert.deepEqual(result, executeTool('calculate_project', { project })); assert.ok(result.totals.aanneemsomAfgerond > 0);
  const expected = core.calculateProject(project);
  assert.deepEqual(result.project, expected);
  assert.deepEqual(result.totals, core.getStaartBreakdown(expected.items));
  assert.equal(result.project.items.length, project.items.length);
  assert.ok(logs.every(record => !('headers' in record) && !('body' in record) && !('token' in record)));
});
test('invalid requests and cyclic trees are rejected with structured errors', async () => {
  assert.equal((await calculate({ project: {} })).status, 400);
  assert.equal((await calculate({ project: { schedule: [], items: [] } })).status, 400);
  const invalidParent = structuredClone(project); invalidParent.items[0].parentId = 123;
  assert.equal((await calculate({ project: invalidParent })).status, 400);
  const cyclic = structuredClone(project); cyclic.items[0].parentId = cyclic.items[0].id;
  const response = await calculate({ project: cyclic }); assert.equal(response.status, 400);
  assert.equal((await response.json()).error_code, 'INVALID_TREE');
});
test('requests cannot grow beyond the configured body limit', async () => {
  const response = await fetch(base + '/v1/tools/calculate_project', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: ' '.repeat(5 * 1024 * 1024 + 1) });
  assert.equal(response.status, 413);
});

test('OpenAPI and tool discovery expose the same input schemas', async () => {
  const spec = await (await fetch(base + '/v1/openapi.json')).json();
  const catalog = await (await fetch(base + '/v1/tools', { headers: { authorization: 'Bearer ' + token } })).json();
  assert.equal(spec.openapi, '3.1.0');
  for (const tool of catalog.tools) assert.deepEqual(spec.paths['/v1/tools/' + tool.name].post.requestBody.content['application/json'].schema, tool.inputSchema);
});
test('server paths and untrusted browser origins are refused', async () => {
  const response = await calculate({ project, path: '/etc/passwd' }); assert.equal(response.status, 400);
  const body = await response.json(); assert.ok(body.error_code && body.melding && body.remedie);
  assert.ok(!JSON.stringify(body).includes('/etc/passwd'));
  const denied = await fetch(base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, origin: 'https://untrusted.example' } });
  assert.equal(denied.status, 403);
});
test('an external MCP SDK client can initialize, discover and calculate without a desktop', async () => {
  const client = new Client({ name: 'cloud-parity', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + token } } });
  try {
    await client.connect(transport);
    const catalog = await client.listTools(); assert.equal(catalog.tools.length, 2);
    const result = await client.callTool({ name: 'calculate_project', arguments: { project } });
    assert.ok(!result.isError); assert.deepEqual(JSON.parse(result.content[0].text), executeTool('calculate_project', { project }));
  } finally { await client.close(); }
});
test('a full calculation slot returns 503 with Retry-After, and timeouts return 504', async () => {
  const hashes = [createHash('sha256').update(token).digest('hex')];
  const limited = createApi({ keyHashes: hashes, maxConcurrent: 1, log: () => {} });
  limited.listen(0, '127.0.0.1'); await once(limited, 'listening');
  const call = port => fetch(`http://127.0.0.1:${port}/v1/tools/calculate_project`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ project }) });
  try {
    const results = await Promise.all([call(limited.address().port), call(limited.address().port)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 503]);
    assert.equal(results.find(r => r.status === 503).headers.get('Retry-After'), '1');
  } finally { await new Promise(resolve => limited.close(resolve)); }
  const slow = createApi({ keyHashes: hashes, timeoutMs: 1, log: () => {} });
  slow.listen(0, '127.0.0.1'); await once(slow, 'listening');
  try { assert.equal((await call(slow.address().port)).status, 504); }
  finally { await new Promise(resolve => slow.close(resolve)); }
});
test('the service refuses to start without valid key digests', () => {
  assert.throws(() => createApi({ keyHashes: [] }), /OPENAEC_API_SLEUTELS/);
  assert.throws(() => createApi({ keyHashes: ['plain-text-key'] }), /OPENAEC_API_SLEUTELS/);
});
