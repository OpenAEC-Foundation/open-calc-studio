import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { companionChannelName, type CompanionSnapshot } from '@/services/workspaces/companion';
import { PdfViewer } from '@/components/viewers/PdfViewer';
import { QuantityOriginCard } from '@/components/common/QuantityOriginCard';
import { changeLanguage } from '@/i18n/config';
import { applyTheme } from '@/components/settings/SettingsDialog';
import { uiText } from '@/i18n/uiText';

export function CompanionWindow({ id }: { id: string }) {
  useTranslation();
  const [connected, setConnected] = useState(false), [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'drawing' | 'origin'>('drawing');
  const name = useAppStore(s => s.documents[0]?.fileName ?? '');
  const item = useAppStore(s => s.items.find(item => item.id === s.activeItemId));
  useEffect(() => {
    const channel = new BroadcastChannel(companionChannelName(id));
    let lastSeen = 0, previousSelection = '', previousDocument = '';
    channel.onmessage = event => {
      if (!['alive', 'snapshot'].includes(event.data?.type)) return;
      lastSeen = Date.now(); setConnected(true);
      if (event.data.type !== 'snapshot') return;
      const snapshot = event.data.snapshot as CompanionSnapshot;
      if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.schedule) return;
      const state = useAppStore.getState();
      const pdf = snapshot.schedule.pdfWorkspace;
      const localSource = previousDocument === snapshot.documentId ? state.schedule.pdfWorkspace?.activeSourceId : null;
      let sourceId = pdf?.sources.some(source => source.id === localSource) ? localSource : pdf?.activeSourceId;
      const selected = snapshot.items.find(item => item.id === snapshot.activeItemId);
      const focusChanged = previousSelection !== snapshot.activeItemId || previousDocument !== snapshot.documentId;
      let targetId = state.pdfTargetMeasurementId;
      if (focusChanged && selected?.quantityLink?.source === 'pdf') {
        const link = selected.quantityLink;
        const source = pdf?.sources.find(source => source.measurements.some(measurement => measurement.id === link.measurementId));
        if (source) { sourceId = source.id; targetId = link.measurementId; }
      }
      useAppStore.setState({ items: snapshot.items, schedule: { ...snapshot.schedule, ...(pdf ? { pdfWorkspace: { ...pdf, activeSourceId: sourceId ?? null } } : {}) }, subSheets: snapshot.subSheets,
        activeDocumentId: snapshot.documentId, activeItemId: snapshot.activeItemId, pdfTargetMeasurementId: targetId,
        documents: snapshot.documentId ? [{ id: snapshot.documentId, fileName: snapshot.name, filePath: null, isModified: false, items: snapshot.items, schedule: snapshot.schedule }] : [] });
      previousSelection = snapshot.activeItemId ?? ''; previousDocument = snapshot.documentId;
      applyTheme(snapshot.theme);
      if (snapshot.locale && snapshot.locale !== 'auto') void changeLanguage(snapshot.locale);
      setLoaded(true);
    };
    channel.postMessage({ type: 'ready' });
    const heartbeat = setInterval(() => { setConnected(Date.now() - lastSeen < 12000); if (!lastSeen) channel.postMessage({ type: 'ready' }); }, 4000);
    const leave = () => channel.postMessage({ type: 'bye' });
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('beforeunload', leave); clearInterval(heartbeat); channel.close(); };
  }, [id]);
  return <div className="oa-app companion-workspace">
    <header><div><h1 className="oa-heading oa-heading--dialog">{name || uiText('companion.title', 'Open Calc Studio — Second screen')}</h1><span>{uiText('companion.readOnly', 'Read-only · follows the active estimate')}</span></div>
      <span role="status">{connected ? uiText('companion.connected', 'Connected') : uiText('companion.disconnected', 'Disconnected — showing the last received data')}</span>
      <button className="oa-button" aria-pressed={view === 'drawing'} onClick={() => setView('drawing')}>{uiText('companion.drawing', 'PDF drawing')}</button><button className="oa-button" aria-pressed={view === 'origin'} onClick={() => setView('origin')}>{uiText('origin.title', 'Quantity origin')}</button>
    </header>
    {!loaded ? <p role="status">{uiText('companion.waiting', 'Waiting for the main window…')}</p> : view === 'drawing' ? <PdfViewer readOnly /> : <div className="companion-origin">{item ? <QuantityOriginCard item={item} allowNavigate={false} /> : <p>{uiText('companion.select', 'Select an estimate row in the main window.')}</p>}</div>}
  </div>;
}
