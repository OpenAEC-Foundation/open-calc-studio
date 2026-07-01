import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { OPENAEC_ENABLED } from '@/services/buildFlags';
import { isIfcxFamily } from '@/services/ifc/ifcxFolder';

function dirOf(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(0, i) : '';
}

export interface CloudFolderIfcx {
  /** of de cloudmap-context actief is (ingelogd + opgeslagen in cloud) */
  active: boolean;
  folder: string | null;
  /** ifcx-familiebestanden in de map, met inhoud (undefined = laden mislukt) */
  ifcxFiles: { name: string; content?: string }[];
  /** overige bestanden (pdf/tekening) — alleen namen */
  otherFiles: string[];
  busy: boolean;
}

/**
 * Laadt de ifcx-familiebestanden uit dezelfde cloudmap als de laatst
 * opgeslagen begroting. Gedeeld door het mapoverzicht én de structuurweergave
 * in de IFC-tab, zodat de bestanden maar één keer gedownload worden.
 */
export function useCloudFolderIfcx(): CloudFolderIfcx {
  const accountsUser = useAppStore(s => s.accountsUser);
  const cloudFiles = useAppStore(s => s.cloudFiles);
  const lastCloudFolder = useAppStore(s => s.lastCloudFolder);
  const cloudDownload = useAppStore(s => s.cloudDownload);

  const active = OPENAEC_ENABLED && !!accountsUser && lastCloudFolder != null;

  const siblings = useMemo(
    () => (lastCloudFolder == null ? [] : cloudFiles.filter(f => dirOf(f.name) === lastCloudFolder)),
    [cloudFiles, lastCloudFolder],
  );
  const key = siblings.map(f => `${f.id}:${f.size}`).join('|');

  const [ifcxFiles, setIfcxFiles] = useState<{ name: string; content?: string }[]>([]);
  const [otherFiles, setOtherFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) { setIfcxFiles([]); setOtherFiles([]); return; }
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const ifcxSibs = siblings.filter(f => isIfcxFamily(f.name));
        const loaded = await Promise.all(ifcxSibs.map(async (f) => {
          try { return { name: f.name, content: await cloudDownload(f.id) }; }
          catch { return { name: f.name }; }
        }));
        const others = siblings.filter(f => !isIfcxFamily(f.name)).map(f => f.name);
        if (!cancelled) { setIfcxFiles(loaded); setOtherFiles(others); }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, lastCloudFolder]);

  return { active, folder: lastCloudFolder, ifcxFiles, otherFiles, busy };
}
