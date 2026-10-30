import { createServer, type Server } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Stateful SDK transport for the private container network. Stdio stays default. */
export function createHttpMcp(factory: () => McpServer, token = process.env.OCS_MCP_TOKEN): Server {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer; used: number }>();
  const dispose = async (id: string) => { const session = sessions.get(id); sessions.delete(id); await session?.server.close(); };
  const timer = setInterval(() => {
    for (const [id, entry] of sessions) if (Date.now() - entry.used > 30 * 60_000) void dispose(id);
  }, 60_000);
  timer.unref();
  const http = createServer(async (req, res) => {
    const fail = (status: number, message: string) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message })); };
    if (req.headers.origin) return fail(403, 'Browser origins are not allowed on the private MCP endpoint');
    if (token) {
      const actual = Buffer.from(req.headers.authorization ?? '');
      const expected = Buffer.from('Bearer ' + token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return fail(401, 'Unauthorized');
    }
    if (req.url !== '/mcp') return fail(404, 'Not found');
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) return fail(405, 'Method not allowed');
    try {
      let body: unknown;
      if (req.method === 'POST') {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) return fail(413, 'MCP request is too large');
          chunks.push(Buffer.from(chunk));
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return fail(400, 'Invalid JSON'); }
      }
      const id = req.headers['mcp-session-id'];
      let session = typeof id === 'string' ? sessions.get(id) : undefined;
      if (id && !session) return fail(404, 'Unknown MCP session');
      if (!session) {
        if (req.method !== 'POST' || !body || typeof body !== 'object' || !('method' in body) || body.method !== 'initialize') return fail(400, 'Initialize an MCP session first');
        if (sessions.size >= 16) return fail(503, 'Too many MCP sessions');
        const server = factory();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: id => { sessions.set(id, { transport, server, used: Date.now() }); },
          enableJsonResponse: true,
        });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        session = { transport, server, used: Date.now() };
        try { await transport.handleRequest(req, res, body); }
        finally { if (!transport.sessionId || !sessions.has(transport.sessionId)) await server.close(); }
        return;
      }
      session.used = Date.now();
      await session.transport.handleRequest(req, res, body);
    } catch (error) {
      console.error('MCP HTTP request failed', error instanceof Error ? error.message : 'Unknown error');
      if (!res.headersSent) fail(500, 'MCP request failed'); else res.end();
    }
  });
  http.on('close', () => { clearInterval(timer); for (const id of sessions.keys()) void dispose(id); });
  return http;
}
