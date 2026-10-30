import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { captureRecovery, listRecovery, removeRecovery, restoreRecovery, writeRecovery, recoveryWindowId, type RecoveryRecord } from '@/services/file/recovery';
import { uiText } from '@/i18n/uiText';
import { completeLegacyDraftMigration } from '@/components/mobile/mobileDraft';

/** One journal per live window; an old journal is removed only by explicit choice. */
export function RecoveryBar() {
  const [id] = useState(recoveryWindowId);
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, pendingSince = 0;
    void listRecovery().then(result => { if (!disposed) setRecords(result.filter(record => record.id !== id)); }).catch(e => { if (!disposed) setError(String(e)); });
    const flush = () => {
      if (timer) clearTimeout(timer); pendingSince = 0;
      // Capture now, then serialize commits so an older write cannot win a race.
      let record: RecoveryRecord | null;
      try { record = captureRecovery(id); } catch (e) { setError(String(e)); return; }
      pending.current = pending.current.then(async () => {
        if (record) { await writeRecovery(record); completeLegacyDraftMigration(); } else await removeRecovery(id);
        if (!disposed) { setError(''); setSavedAt(record?.savedAt ?? ''); }
      }).catch(e => { if (!disposed) setError(String(e)); });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!pendingSince) pendingSince = Date.now();
      timer = setTimeout(flush, Math.min(800, Math.max(0, 5000 - (Date.now() - pendingSince))));
    };
    const unsubscribe = useAppStore.subscribe((s, p) => {
      if (s.items !== p.items || s.schedule !== p.schedule || s.documents !== p.documents || s.subSheets !== p.subSheets || s.offerte !== p.offerte || s.companyInfo !== p.companyInfo || s.projectInfo !== p.projectInfo || s.snapshots !== p.snapshots) schedule();
    });
    schedule(); window.addEventListener('pagehide', flush);
    return () => { disposed = true; if (timer) clearTimeout(timer); unsubscribe(); window.removeEventListener('pagehide', flush); };
  }, [id]);
  async function choose(record: RecoveryRecord, restore: boolean) {
    try {
      if (restore) restoreRecovery(record);
      pending.current = pending.current.then(async () => {
        if (restore) {
          const checkpoint = captureRecovery(id);
          if (!checkpoint) throw Error('No recovery checkpoint was captured.');
          await writeRecovery(checkpoint);
        }
        await removeRecovery(record.id);
      });
      await pending.current;
      setRecords(current => current.filter(r => r.id !== record.id)); setError('');
    } catch (e) { pending.current = Promise.resolve(); setError(String(e)); }
  }
  if (!error && !savedAt && !records.length) return null;
  return <aside className="oa-banner" aria-label={uiText('recovery.title', 'Recovery')}>
    {error && <div role="alert">{uiText('recovery.failed', 'Recovery could not be saved. Save your estimate to a file.')} {error}</div>}
    {records.map(record => <div key={record.id}>
      {uiText('recovery.available', 'Recoverable estimates:')} {record.documents.map(d => d.fileName).join(', ')} · {new Date(record.savedAt).toLocaleString()}
      <button onClick={() => void choose(record, true)}>{uiText('recovery.restore', 'Restore as new estimates')}</button>
      <button onClick={() => void choose(record, false)}>{uiText('recovery.discard', 'Discard recovery')}</button>
    </div>)}
    {!error && savedAt && <small role="status">{uiText('recovery.saved', 'Recovery saved')} · {new Date(savedAt).toLocaleTimeString()}</small>}
  </aside>;
}
