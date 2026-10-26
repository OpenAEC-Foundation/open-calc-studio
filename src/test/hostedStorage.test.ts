import { afterEach, expect, it, vi } from 'vitest';
import { localStore } from '@/utils/browserStorage';
import { publicAsset } from '@/utils/publicAsset';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('continues with in-memory preferences when an opaque origin denies browser storage', () => {
  vi.stubGlobal('localStorage', undefined);
  localStore.setItem('ocs-hosted-test', 'draft');
  expect(localStore.getItem('ocs-hosted-test')).toBe('draft');
  localStore.removeItem('ocs-hosted-test');
  expect(localStore.getItem('ocs-hosted-test')).toBeNull();
});
it('loads public assets beneath a configured Frappe subpath', () => {
  vi.stubEnv('BASE_URL', '/assets/tools/calc/');
  expect(publicAsset('/data/voorbeeld.ifcCalc')).toBe('/assets/tools/calc/data/voorbeeld.ifcCalc');
});
const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(readFileSync('index.html', 'utf8'))![1];
it('skips startup recovery when an opaque frame denies sessionStorage', () => {
  const timer = vi.fn();
  const frame = { get sessionStorage() { throw new DOMException('Blocked', 'SecurityError'); } };
  expect(() => runInNewContext(bootstrap, { window: frame, setInterval: timer })).not.toThrow();
  expect(timer).not.toHaveBeenCalled();
});
it('stops the startup poll even when storage becomes unavailable after mounting', () => {
  let poll!: () => void; const stop = vi.fn();
  const frame = { sessionStorage: { getItem: () => null, removeItem: () => { throw new Error('Blocked'); } }, addEventListener: vi.fn() };
  runInNewContext(bootstrap, { window: frame, document: { getElementById: () => ({ childElementCount: 1 }) },
    setInterval: (callback: () => void) => { poll = callback; return 1; }, clearInterval: stop });
  expect(() => poll()).not.toThrow(); expect(stop).toHaveBeenCalledWith(1);
});
