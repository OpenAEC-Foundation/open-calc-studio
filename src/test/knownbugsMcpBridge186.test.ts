// Knownbug 186: met een tweede documentvenster open verwerkten beide vensters een
// API-wijziging (Tauri stuurt 'mcp-mutation' naar alle vensters).
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ label: 'main', listened: [] as string[], pushes: 0 }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string) => { m.listened.push(name); return () => {}; },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => { if (cmd === 'api_push_state') m.pushes++; return null; },
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: m.label }) }));

import { initMcpBridge } from '@/services/mcp/mcpBridge';

afterEach(() => { m.listened = []; m.pushes = 0; });

describe('MCP bridge per window (knownbug 186)', () => {
  it('listens for API mutations in the main window', async () => {
    m.label = 'main';
    const cleanup = await initMcpBridge();
    expect(m.listened).toEqual(['mcp-mutation']);
    expect(m.pushes).toBe(1);
    cleanup();
  });
  it('ignores API mutations in a second document window', async () => {
    m.label = 'window-1732540000000';
    const cleanup = await initMcpBridge();
    expect(m.listened).toEqual([]);
    expect(m.pushes).toBe(0);
    cleanup();
  });
});
