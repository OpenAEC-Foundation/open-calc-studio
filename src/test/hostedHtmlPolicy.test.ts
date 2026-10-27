// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { hostedHtmlPolicy } from '../../build/hostedHtmlPolicy';

describe('hosted startup HTML', () => {
  it.each(['platform', 'production'])('applies the analytics policy only in %s mode', async mode => {
    const server = await createServer({ configFile: false, mode, plugins: [hostedHtmlPolicy()], server: { middlewareMode: true, hmr: false } });
    try {
      const source = '<html><head><script id="openaec-analytics-loader" defer src="https://open-aec.com/shared/analytics.js?v=20261026"></script></head><body><div id="root"></div></body></html>';
      const result = await server.transformIndexHtml('/index.html', source);
      expect(result).toContain('id="root"');
      if (mode === 'platform') expect(result).not.toContain('https://open-aec.com');
      else expect(result).toContain('https://open-aec.com/shared/analytics.js');
    } finally { await server.close(); }
  });
});
