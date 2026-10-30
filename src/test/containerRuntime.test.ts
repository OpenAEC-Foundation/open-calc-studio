import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { allowsExternalServices } from '@/services/buildFlags';
import { nativeDialogDefaultPath } from '@/services/file/nativeFileService';

afterEach(() => { delete window.__OCS_CONTAINER__; });
it('disables optional external services in a native container', () => {
  expect(allowsExternalServices()).toBe(true);
  window.__OCS_CONTAINER__ = true;
  expect(allowsExternalServices()).toBe(false);
});
it('starts container dialogs under the mounted user directory', () => {
  expect(nativeDialogDefaultPath('Estimate.pdf')).toBe('Estimate.pdf');
  window.__OCS_CONTAINER__ = true;
  expect(nativeDialogDefaultPath()).toBe('/openaec/');
  expect(nativeDialogDefaultPath('Estimate.pdf')).toBe('/openaec/Estimate.pdf');
  expect(nativeDialogDefaultPath('/openaec/project/Estimate.pdf')).toBe('/openaec/project/Estimate.pdf');
  expect(nativeDialogDefaultPath('../config/Estimate.pdf')).toBe('/openaec/Estimate.pdf');
});
it.each([true, false])('the startup analytics loader respects container=%s before creating any request', container => {
  const html = readFileSync('index.html', 'utf8');
  const source = /<script id="openaec-analytics-loader">([\s\S]*?)<\/script>/.exec(html)![1];
  const added: unknown[] = [];
  runInNewContext(source, { window: { __OCS_CONTAINER__: container }, document: { createElement: () => ({}), head: { appendChild: (node: unknown) => added.push(node) } } });
  expect(added).toHaveLength(container ? 0 : 1);
});
