import type { Plugin } from 'vite';

/** Hosted apps delegate optional analytics to their host and start without a CDN. */
export function hostedHtmlPolicy(): Plugin {
  let hosted = false;
  return {
    name: 'ocs-hosted-html-policy',
    configResolved(config) { hosted = config.mode === 'platform'; },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return hosted ? html.replace(/<script\b(?=[^>]*\bid=["']openaec-analytics-loader["'])[^>]*>[\s\S]*?<\/script\s*>/gi, '') : html;
      },
    },
  };
}
