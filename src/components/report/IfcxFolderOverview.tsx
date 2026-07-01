import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/state/appStore';
import type { CloudFolderIfcx } from '@/hooks/useCloudFolderIfcx';
import { analyzeIfcxFolder } from '@/services/ifc/ifcxFolder';

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1);

/**
 * Mapoverzicht in de IFC-tab: alle bestanden die in dezelfde cloudmap staan als
 * de opgeslagen begroting. Per .ifcx-familiebestand de IFC-objecttypes (telling)
 * en de objecten die over bestanden heen gekoppeld zijn (gedeelde ifcGuid).
 * Klik een bestand om het uit te lezen in het objectenpaneel.
 */
export const IfcxFolderOverview: React.FC<{ data: CloudFolderIfcx; onOpenFile?: (name: string, content: string) => void }> = ({ data, onOpenFile }) => {
  const cloudRefresh = useAppStore(s => s.cloudRefresh);
  const { active, folder, ifcxFiles, otherFiles, busy } = data;
  const [open, setOpen] = useState(true);

  const analysis = useMemo(
    () => analyzeIfcxFolder([...ifcxFiles, ...otherFiles.map(name => ({ name }))]),
    [ifcxFiles, otherFiles],
  );
  const contentByName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of ifcxFiles) if (f.content != null) m[f.name] = f.content;
    return m;
  }, [ifcxFiles]);

  if (!active) return null;
  const folderLabel = folder === '' ? '/ (hoofdmap)' : `/${folder}`;

  return (
    <div className="ifcx-folder-overview">
      <div className="ifcx-folder-head" onClick={() => setOpen(o => !o)}>
        <span className="ifcx-folder-toggle">{open ? '▼' : '▶'}</span>
        <span className="ifcx-folder-title">Mapoverzicht — {folderLabel}</span>
        {busy && <span className="ifcx-folder-meta">laden…</span>}
        <button
          className="ifcx-folder-refresh"
          onClick={(e) => { e.stopPropagation(); cloudRefresh().catch(() => {}); }}
          title="Cloudmap vernieuwen"
        >↻</button>
      </div>

      {open && (
        <div className="ifcx-folder-body">
          {analysis.files.length === 0 && analysis.otherFiles.length === 0 && (
            <div className="ifcx-folder-empty">Nog geen bestanden in deze map. Sla begrotingen of .ifcx in dezelfde cloudmap op om ze hier gefedereerd te zien.</div>
          )}

          {analysis.links.length > 0 && (
            <div className="ifcx-folder-links">
              <div className="ifcx-folder-subhead">🔗 Gekoppelde objecten ({analysis.links.length})</div>
              {analysis.links.slice(0, 12).map(l => (
                <div key={l.ifcGuid} className="ifcx-link-row">
                  <code className="ifcx-guid">{l.ifcGuid.slice(0, 12)}…</code>
                  <span className="ifcx-link-files">{l.files.map(base).join('  ↔  ')}</span>
                </div>
              ))}
            </div>
          )}

          {analysis.files.map(f => {
            const canOpen = !!contentByName[f.name] && !!onOpenFile;
            return (
              <div
                key={f.name}
                className={`ifcx-file-card${canOpen ? ' ifcx-file-openable' : ''}`}
                onClick={canOpen ? () => onOpenFile!(f.name, contentByName[f.name]) : undefined}
                title={canOpen ? 'Klik om dit bestand uit te lezen' : undefined}
              >
                <div className="ifcx-file-name">📐 {base(f.name)}{canOpen && <span className="ifcx-file-open-hint">bekijk →</span>}</div>
                {f.error ? (
                  <div className="ifcx-folder-error">{f.error}</div>
                ) : (
                  <div className="ifcx-file-types">
                    <span className="ifcx-file-count">{f.objectCount} objecten</span>
                    {f.objectTypes.map(t => (
                      <span key={t.type} className="ifcx-type-chip">{t.type} <b>{t.count}</b></span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {analysis.otherFiles.length > 0 && (
            <div className="ifcx-folder-others">
              <div className="ifcx-folder-subhead">Overige bestanden</div>
              {analysis.otherFiles.map(n => <span key={n} className="ifcx-other-chip">📄 {base(n)}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
