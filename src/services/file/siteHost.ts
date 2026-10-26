/** Optional SuperCloud contract. The host owns transport, authentication and versions. */
export type HostVersion = string | number;
export interface HostFileRef { id: string; name: string; version: HostVersion }
export interface SiteHost {
  initialFileId?: string;
  open(id: string, version?: HostVersion): Promise<HostFileRef & { readOnly: boolean; bytes: Uint8Array | ArrayBuffer }>;
  save(bytes: Uint8Array, options: { id?: string; name?: string; expectedVersion?: HostVersion }): Promise<HostFileRef>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
  versions(id: string): Promise<{ version: HostVersion; modified: string; author?: string }[]>;
}
declare global { interface Window { openaecHost?: SiteHost } }

export function getSiteHost(): SiteHost | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.openaecHost;
  return host && ['open', 'save', 'list', 'versions'].every(key => typeof host[key as keyof SiteHost] === 'function') ? host : undefined;
}

/** Supports hosts installed before or after the application, without a network request. */
export function observeSiteHost(changed: (host: SiteHost | undefined) => void): () => void {
  let current = getSiteHost();
  changed(current);
  const check = () => { const next = getSiteHost(); if (next !== current) { current = next; changed(next); } };
  const timer = window.setInterval(check, 250);
  window.addEventListener('openaec-host-ready', check);
  return () => { window.clearInterval(timer); window.removeEventListener('openaec-host-ready', check); };
}

export const HOST_RECENT_PREFIX = 'ocs-host:';
export const hostRecentPath = (id: string) => HOST_RECENT_PREFIX + encodeURIComponent(id);
