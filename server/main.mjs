import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, ApiError } from './tools.mjs';
export { executeTool } from './tools.mjs';

const VERSION = __APP_VERSION__;
export function apiDescription() {
  const responses = { 200: { description: 'Calculation result' }, 400: { description: 'Invalid inline input' }, 401: { description: 'Missing or invalid bearer key' }, 413: { description: 'Body exceeds the limit' }, 503: { description: 'Busy; retry after Retry-After' }, 504: { description: 'Calculation timeout' } };
  return { openapi: '3.1.0', info: { title: 'Open Calc Studio API', version: VERSION },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    paths: Object.fromEntries([
      ['/v1/health', { get: { security: [], responses: { 200: { description: 'Health and product version' } } } }],
      ['/v1/openapi.json', { get: { security: [], responses: { 200: { description: 'This schema, generated from the tool definitions' } } } }],
      ['/v1/tools', { get: { security: [{ bearer: [] }], responses: { 200: { description: 'Tools and their JSON input schemas' } } } }],
      ...tools.map(tool => ['/v1/tools/' + tool.name, { post: { operationId: tool.name, description: tool.description, security: [{ bearer: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: tool.inputSchema } } }, responses } }]),
      ['/mcp', { post: { description: 'Stateless MCP Streamable HTTP (JSON responses)', security: [{ bearer: [] }], responses: { 200: { description: 'MCP JSON-RPC response' }, 202: { description: 'MCP notification accepted' } } } }],
    ]),
  };
}
function authorized(header, hashes) {
  const bearer = /^Bearer (\S+)$/i.exec(header ?? '');
  if (!bearer) return false;
  const digest = createHash('sha256').update(bearer[1]).digest();
  return hashes.some(hash => timingSafeEqual(digest, Buffer.from(hash, 'hex')));
}
function errorBody(error, requestId) {
  return { error_code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
    melding: error instanceof ApiError ? error.message : 'Calculation failed.',
    remedie: error.status === 503 ? 'Retry after the Retry-After interval.' : error.status === 504 ? 'Use a smaller project or contact the host.' : 'Check the tool schema and request; contact the host if the error persists.',
    request_id: requestId };
}
async function readJson(request, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request exceeds the byte limit.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'INVALID_JSON', 'Request is not valid JSON.'); }
}

export function createApi({ keyHashes = process.env.OPENAEC_API_SLEUTELS, maxBytes = 5 * 1024 * 1024,
  maxConcurrent = 4, timeoutMs = 300000, allowedOrigins = [], log = record => console.log(JSON.stringify(record)) } = {}) {
  const hashes = Array.isArray(keyHashes) ? keyHashes : (keyHashes ?? '').split(/[\s,;]+/).filter(Boolean);
  if (!hashes.length || hashes.some(hash => !/^[a-f0-9]{64}$/i.test(hash))) throw new Error('OPENAEC_API_SLEUTELS must contain SHA-256 digests of the permitted bearer keys.');
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || maxBytes < 1) throw new Error('Invalid API limits.');
  const workers = new Set();
  function runTool(name, args) {
    if (workers.size >= maxConcurrent) return Promise.reject(new ApiError(503, 'BUSY', 'All calculation slots are occupied.'));
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { name, args } });
      workers.add(worker); let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new ApiError(504, 'TIMEOUT', 'Calculation exceeded its time limit.')); void worker.terminate(); } }, timeoutMs);
      worker.once('message', message => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (message.error) reject(new ApiError(message.error.status, message.error.code, message.error.message));
        else resolve(message.result);
      });
      worker.once('error', () => { if (!settled) { settled = true; clearTimeout(timer); reject(new ApiError(500, 'WORKER_FAILED', 'Calculation worker failed.')); } });
      worker.once('exit', () => { workers.delete(worker); clearTimeout(timer); if (!settled) reject(new ApiError(500, 'WORKER_EXITED', 'Calculation worker stopped.')); });
    });
  }
  const server = createServer(async (request, response) => {
    const requestId = randomUUID(); const path = (request.url ?? '').split('?')[0];
    response.setHeader('cache-control', 'no-store'); response.setHeader('x-content-type-options', 'nosniff'); response.setHeader('x-request-id', requestId);
    response.once('finish', () => log({ requestId, method: request.method, path, status: response.statusCode }));
    const reply = (status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
    try {
      if (request.method === 'GET' && path === '/v1/health') return reply(200, { status: 'ok', version: VERSION });
      if (request.method === 'GET' && path === '/v1/openapi.json') return reply(200, apiDescription());
      if (!authorized(request.headers.authorization, hashes)) throw new ApiError(401, 'UNAUTHORIZED', 'A valid bearer key is required.');
      if (request.headers.origin && !allowedOrigins.includes(request.headers.origin)) throw new ApiError(403, 'ORIGIN_DENIED', 'This browser origin is not permitted.');
      if (request.method === 'GET' && path === '/v1/tools') return reply(200, { tools });
      if (request.method !== 'POST') throw new ApiError(404, 'NOT_FOUND', 'Unknown route or method.');
      if (!String(request.headers['content-type']).toLowerCase().startsWith('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
      const payload = await readJson(request, maxBytes);
      if (path === '/mcp') {
        const mcp = new Server({ name: 'open-calc-studio', version: VERSION }, { capabilities: { tools: {} } });
        mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
        mcp.setRequestHandler(CallToolRequestSchema, async message => {
          try { const result = await runTool(message.params.name, message.params.arguments); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; }
          catch (error) { if (error.status === 503 && !response.headersSent) response.setHeader('Retry-After', '1'); return { isError: true, content: [{ type: 'text', text: JSON.stringify(errorBody(error, requestId)) }] }; }
        });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        response.once('close', () => { void mcp.close(); });
        await mcp.connect(transport); await transport.handleRequest(request, response, payload);
        return;
      }
      const match = /^\/v1\/tools\/([a-z_]+)$/.exec(path);
      if (!match) throw new ApiError(404, 'NOT_FOUND', 'Unknown route.');
      reply(200, await runTool(match[1], payload));
    } catch (error) {
      if (error.status === 503 && !response.headersSent) response.setHeader('Retry-After', '1');
      if (!response.headersSent) reply(error instanceof ApiError ? error.status : 500, errorBody(error, requestId));
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close', () => { for (const worker of workers) void worker.terminate(); });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApi({ maxConcurrent: Number(process.env.OPENAEC_API_MAX_CONCURRENT || 4), timeoutMs: Number(process.env.OPENAEC_API_TIMEOUT_MS || 300000),
    allowedOrigins: (process.env.OPENAEC_ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0');
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => server.closeAllConnections(), 30000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
