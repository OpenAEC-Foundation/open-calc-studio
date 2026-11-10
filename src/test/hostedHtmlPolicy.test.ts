// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { IndexHtmlTransformContext, ResolvedConfig } from 'vite';
import { hostedHtmlPolicy } from '../../build/hostedHtmlPolicy';

type Hook = (this: unknown, ...args: never[]) => unknown;
const handlerOf = (hook: unknown) => (typeof hook === 'function' ? hook : (hook as { handler: Hook }).handler) as Hook;

/** Runs the plugin's own hooks instead of a Vite dev server, which scans the whole repo for HTML. */
async function transform(mode: string, html: string) {
  const plugin = hostedHtmlPolicy();
  await (handlerOf(plugin.configResolved) as (config: ResolvedConfig) => unknown).call({}, { mode } as ResolvedConfig);
  const transformHook = handlerOf(plugin.transformIndexHtml) as (html: string, ctx: IndexHtmlTransformContext) => unknown;
  const result = await transformHook.call({}, html, { path: '/index.html', filename: 'index.html' } as IndexHtmlTransformContext);
  expect(typeof result).toBe('string');
  return result as string;
}

describe('hosted startup HTML', () => {
  it.each(['platform', 'production'])('applies the analytics policy only in %s mode', async mode => {
    const source = '<html><head><script id="openaec-analytics-loader" defer src="https://open-aec.com/shared/analytics.js?v=20261026"></script></head><body><div id="root"></div></body></html>';
    const result = await transform(mode, source);
    expect(result).toContain('id="root"');
    if (mode === 'platform') expect(result).not.toContain('https://open-aec.com');
    else expect(result).toContain('https://open-aec.com/shared/analytics.js');
  });
});
