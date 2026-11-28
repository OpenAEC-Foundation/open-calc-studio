import { localStore } from '@/utils/browserStorage';
import { HOST_RECENT_PREFIX } from './siteHost';

/**
 * Naam en map van een recent bestand voor de lijsten onder Bestand > Openen en
 * op het startscherm. Een sitebestand (`ocs-host:…`) toont de naam die bij het
 * openen is onthouden, of `hostFile` als die er niet is (knownbug 69).
 */
export function recentFileLabel(filePath: string, hostFile: string): { name: string; dir: string; isHost: boolean } {
  if (filePath.startsWith(HOST_RECENT_PREFIX)) {
    const id = decodeURIComponent(filePath.slice(HOST_RECENT_PREFIX.length));
    return { name: localStore.getItem('ocs-host-name:' + id) || hostFile, dir: '', isHost: true };
  }
  const parts = filePath.replace(/\\/g, '/').split('/');
  const name = parts.pop()?.replace(/\.(ifcx|json|ocs|calc)$/i, '') || filePath;
  return { name, dir: parts.join('/'), isHost: false };
}
