import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { getSiteHost, type HostVersion } from '@/services/file/siteHost';

type Choice = { id: string; version?: HostVersion };
let requestPicker: ((resolve: (choice: Choice | null) => void) => void) | undefined;
export function pickHostFile(): Promise<Choice | null> {
  return new Promise((resolve, reject) => requestPicker ? requestPicker(resolve) : reject(new Error('File picker is not ready.')));
}

export function HostFileDialog() {
  const { t } = useTranslation();
  const [resolve, setResolve] = useState<((value: Choice | null) => void) | null>(null);
  const [files, setFiles] = useState<Awaited<ReturnType<NonNullable<ReturnType<typeof getSiteHost>>['list']>>>([]);
  const [versions, setVersions] = useState<Awaited<ReturnType<NonNullable<ReturnType<typeof getSiteHost>>['versions']>>>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<((value: Choice | null) => void) | null>(null);
  useEffect(() => {
    requestPicker = callback => { pending.current?.(null); pending.current = callback; setResolve(() => callback); };
    return () => { requestPicker = undefined; pending.current?.(null); pending.current = null; };
  }, []);
  useEffect(() => {
    if (!resolve) return;
    let active = true;
    setError(''); setLoading(true); setFiles([]); setVersions([]); setSelected(undefined);
    Promise.resolve().then(() => { const host = getSiteHost(); if (!host) throw new Error('Site storage is unavailable.'); return host.list(); }).then(value => { if (active) setFiles(value); })
      .catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resolve]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setVersions([]);
    Promise.resolve().then(() => { const host = getSiteHost(); if (!host) throw new Error('Site storage is unavailable.'); return host.versions(selected); }).then(value => { if (active) setVersions(value); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [selected]);
  const finish = (value: Choice | null) => { pending.current?.(value); pending.current = null; setResolve(null); };
  return <Modal open={!!resolve} onClose={() => finish(null)} title={t('host.files')}>
    <div className="host-file-picker">
      {loading && <p role="status">{t('host.loading')}</p>}
      {error && <p role="alert" className="oa-field-message oa-field-message--error">{error}</p>}
      {!loading && !files.length && !error && <p>{t('host.empty')}</p>}
      <div className="host-file-list">{files.map(file => <button key={file.id} className="oa-button" aria-pressed={selected === file.id} onClick={() => setSelected(file.id)}>
        <span>{file.name}</span><small>{file.modified}</small>
      </button>)}</div>
      {selected && <><button className="oa-button oa-button--primary" onClick={() => finish({ id: selected })}>{t('host.openLatest')}</button>
        <h3>{t('host.versions')}</h3><div className="host-file-list">{versions.map(v => <button key={v.version} className="oa-button oa-button--quiet" onClick={() => finish({ id: selected, version: v.version })}>
          <span>{t('host.version', { version: v.version })}</span><small>{v.modified} {v.author}</small>
        </button>)}</div></>}
    </div>
  </Modal>;
}
