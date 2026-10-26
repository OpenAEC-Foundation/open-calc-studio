import { afterEach, expect, it, vi } from 'vitest';
import { localStore } from '@/utils/browserStorage';
import { publicAsset } from '@/utils/publicAsset';
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
