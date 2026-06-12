import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { deserializeProject } from '@/services/file/fileService';
import type { CloudFile } from '@/state/slices/accountsSlice';

/**
 * Backstage-paneel "OpenAEC Cloud": bladeren door cloudbestanden (mappen via
 * "/" in namen zodra het platform dat toestaat), huidige begroting uploaden,
 * en het opslagverbruik tonen. Toont alléén bestanden die Open Calc Studio
 * kan openen; overige bestanden (pdf enz.) worden geteld maar verborgen.
 */

const OPENABLE = /\.(ifccalc|ocs|ifcx)$/i;

interface FolderView {
  folders: string[];
  files: Array<CloudFile & { displayName: string }>;
  hiddenCount: number;
}

function splitEntries(files: CloudFile[], path: string[]): FolderView {
  const prefix = path.length ? `${path.join('/')}/` : '';
  const folders = new Set<string>();
  const here: Array<CloudFile & { displayName: string }> = [];
  let hiddenCount = 0;
  for (const f of files) {
    if (!f.name.startsWith(prefix)) continue;
    const rest = f.name.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      folders.add(rest.slice(0, slash));
      continue;
    }
    if (OPENABLE.test(rest)) here.push({ ...f, displayName: rest });
    else hiddenCount++;
  }
  return { folders: [...folders].sort((a, b) => a.localeCompare(b)), files: here, hiddenCount };
}

export function CloudPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const accountsUser = useAppStore((s) => s.accountsUser);
  const accountsBusy = useAppStore((s) => s.accountsBusy);
  const accountsSignIn = useAppStore((s) => s.accountsSignIn);
  const cloudFiles = useAppStore((s) => s.cloudFiles);
  const storageInfo = useAppStore((s) => s.storageInfo);
  const cloudRefresh = useAppStore((s) => s.cloudRefresh);
  const cloudUploadCurrent = useAppStore((s) => s.cloudUploadCurrent);
  const cloudDownload = useAppStore((s) => s.cloudDownload);
  const cloudDelete = useAppStore((s) => s.cloudDelete);

  const [path, setPath] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Bestandsnaam voor "Opslaan op OpenAEC Cloud" — vooringevuld met de
  // huidige begrotingsnaam, door de gebruiker aanpasbaar.
  const scheduleName = useAppStore((s) => (s.schedule?.name || s.schedule?.projectName || 'begroting'));
  const [uploadName, setUploadName] = useState('');
  useEffect(() => {
    setUploadName(String(scheduleName).replace(/\.(ifcCalc|ocs|json)$/i, ''));
  }, [scheduleName]);

  useEffect(() => {
    if (accountsUser) {
      cloudRefresh().catch((e) => setError(String(e)));
    }
  }, [accountsUser, cloudRefresh]);

  const view = useMemo(() => splitEntries(cloudFiles, path), [cloudFiles, path]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  // Net geüpload bestand kort uitlichten in de lijst
  const [justUploaded, setJustUploaded] = useState<string | null>(null);

  const handleUpload = () =>
    run('upload', async () => {
      await cloudUploadCurrent(path, uploadName);
      const cleanName = `${uploadName.trim().replace(/\.(ifcCalc|ocs|json)$/i, '')}.ifcCalc`;
      setJustUploaded(cleanName);
      window.setTimeout(() => setJustUploaded(null), 6000);
      // Na succesvol opslaan sluit het menu — terug naar de begroting.
      onClose();
    });

  const handleOpen = (id: string, name: string) =>
    run(id, async () => {
      const content = await cloudDownload(id);
      const project = deserializeProject(content) as any;
      const store = useAppStore.getState() as any;
      store.addDocument({ fileName: name });
      if (project.schedule) store.setSchedule(project.schedule);
      if (Array.isArray(project.items)) store.setItems(project.items);
      store.recalculate();
      onClose();
    });

  const fmtBytes = (n: number) => {
    if (!Number.isFinite(n)) return '-';
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(0)} kB`;
    return `${n} B`;
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  const FolderIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(217,119,6,0.25)" stroke="var(--theme-accent)" strokeWidth="1.8">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
  const FileIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--theme-text-secondary)" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
    </svg>
  );

  if (!accountsUser) {
    return (
      <div className="bs-panel">
        <h2 className="bs-panel-title">OpenAEC Cloud</h2>
        <p style={{ color: 'var(--theme-text-secondary)', fontSize: 13, marginBottom: 12 }}>
          {t('accounts.notSignedIn')}
        </p>
        <button
          className="bs-action-btn"
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--theme-accent)',
            background: 'var(--theme-accent)', color: 'var(--theme-accent-text, #fff)',
            fontSize: 13, fontWeight: 600,
          }}
          disabled={accountsBusy}
          onClick={() => void accountsSignIn().catch((e) => setError(String(e)))}
        >
          {accountsBusy ? t('accounts.signingIn') : t('accounts.signIn')}
        </button>
        {error && <p style={{ color: 'var(--theme-danger-color)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  const used = storageInfo?.usedBytes ?? 0;
  const quota = storageInfo?.quotaBytes ?? 0;
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  const crumbBtn: React.CSSProperties = {
    border: 'none', background: 'transparent', padding: '2px 4px', borderRadius: 4,
    color: 'var(--theme-accent)', fontSize: 12, fontWeight: 600,
  };

  return (
    <div className="bs-panel">
      <h2 className="bs-panel-title">OpenAEC Cloud</h2>

      {/* Opslagmeter */}
      <div style={{ marginBottom: 14, maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--theme-text-secondary)', marginBottom: 4 }}>
          <span>{t('accounts.storage')}</span>
          <span>{fmtBytes(used)} / {fmtBytes(quota)}</span>
        </div>
        <div style={{ height: 8, borderRadius: 9999, background: 'var(--theme-border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: 'var(--theme-accent)', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={uploadName}
          onChange={(e) => setUploadName(e.target.value)}
          placeholder={t('accounts.fileName')}
          title={t('accounts.fileName')}
          style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--theme-border)',
            background: 'var(--theme-bg)', color: 'var(--theme-editable-text, var(--theme-text))',
            fontSize: 12, minWidth: 220,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--theme-text-secondary)' }}>.ifcCalc</span>
        <button
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--theme-accent)',
            background: 'var(--theme-accent)', color: 'var(--theme-accent-text, #fff)', fontSize: 12, fontWeight: 600,
          }}
          disabled={busy !== null || !uploadName.trim()}
          onClick={handleUpload}
        >
          {busy === 'upload' ? '…' : t('accounts.saveToCloud')}
        </button>
        <button
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--theme-border)',
            background: 'transparent', color: 'var(--theme-text)', fontSize: 12,
          }}
          disabled={busy !== null}
          onClick={() => run('refresh', () => cloudRefresh())}
        >
          {t('accounts.refresh')}
        </button>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, fontSize: 12, flexWrap: 'wrap' }}>
        <button style={crumbBtn} onClick={() => setPath([])}>OpenAEC Cloud</button>
        {path.map((seg, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ color: 'var(--theme-text-secondary)' }}>/</span>
            <button style={crumbBtn} onClick={() => setPath(path.slice(0, i + 1))}>{seg}</button>
          </span>
        ))}
      </div>

      {notice && <p style={{ color: 'var(--theme-accent)', fontSize: 12, marginBottom: 8 }}>{notice}</p>}
      {error && <p style={{ color: 'var(--theme-danger-color)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {view.folders.length === 0 && view.files.length === 0 ? (
        <p style={{ color: 'var(--theme-text-secondary)', fontSize: 13 }}>{t('accounts.noFiles')}</p>
      ) : (
        <div className="cloud-browser">
          <div className="cloud-browser-header">
            <span className="cloud-icon" style={{ width: 15 }} />
            <span className="cloud-name">{t('description')}</span>
            <span className="cloud-meta">Grootte</span>
            <span className="cloud-meta date">Gewijzigd</span>
            <span style={{ width: 118, flexShrink: 0 }} />
          </div>
          {view.folders.map((folder) => (
            <div
              key={`dir-${folder}`}
              className="cloud-row is-folder"
              onClick={() => setPath([...path, folder])}
              onDoubleClick={() => setPath([...path, folder])}
              role="button"
            >
              <span className="cloud-icon">{FolderIcon}</span>
              <span className="cloud-name">{folder}</span>
              <span className="cloud-meta"></span>
              <span className="cloud-meta date"></span>
              <span style={{ width: 118, flexShrink: 0, textAlign: 'right', color: 'var(--theme-text-secondary)' }}>›</span>
            </div>
          ))}
          {view.files.map((f) => (
            <div
              key={f.id}
              className={`cloud-row${justUploaded === f.displayName ? ' just-uploaded' : ''}`}
              onDoubleClick={() => handleOpen(f.id, f.displayName)}
            >
              <span className="cloud-icon">{FileIcon}</span>
              <span className="cloud-name" title={f.displayName}>{f.displayName}</span>
              <span className="cloud-meta">{fmtBytes(f.size)}</span>
              <span className="cloud-meta date">{fmtDate(f.createdAt)}</span>
              <span style={{ display: 'flex', gap: 6, flexShrink: 0, width: 118, justifyContent: 'flex-end' }}>
                <button
                  className="cloud-row-btn"
                  disabled={busy !== null}
                  onClick={(e) => { e.stopPropagation(); handleOpen(f.id, f.displayName); }}
                >
                  {busy === f.id ? '…' : t('accounts.openFromCloud')}
                </button>
                <button
                  className="cloud-row-btn danger"
                  disabled={busy !== null}
                  onClick={(e) => { e.stopPropagation(); run(`del-${f.id}`, () => cloudDelete(f.id)); }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {view.hiddenCount > 0 && (
        <p style={{ color: 'var(--theme-text-secondary)', fontSize: 11, marginTop: 8 }}>
          {t('accounts.hiddenFiles', { count: view.hiddenCount })}
        </p>
      )}
    </div>
  );
}
