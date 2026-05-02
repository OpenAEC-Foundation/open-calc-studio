/**
 * Modal to pick a quantity value from another tab:
 * - Spreadsheet cell (e.g. Blad 1!A5)
 * - PDF measurement (length/area or sum)
 * - IFC element quantity (volume/area/length/count)
 */
import { useState } from 'react';
import { useAppStore } from '@/state/appStore';
import type { QuantityLink } from '@/types/costModel';

interface Props {
  onPick: (link: QuantityLink, value: number) => void;
  onClose: () => void;
}

export function QuantityPicker({ onPick, onClose }: Props) {
  const subSheets = useAppStore(s => s.subSheets);
  const pdfMeasurements = useAppStore(s => s.pdfMeasurements);
  const ifcQuantities = useAppStore(s => s.ifcQuantities);

  const [tab, setTab] = useState<'spreadsheet' | 'pdf' | 'ifc'>('spreadsheet');
  const [selectedSheet, setSelectedSheet] = useState<string>(subSheets[0]?.id ?? '');
  const [cellRef, setCellRef] = useState<string>('');

  const activeSheet = subSheets.find(s => s.id === selectedSheet);

  const pickSpreadsheet = () => {
    if (!activeSheet || !cellRef) return;
    const cell = activeSheet.cells[cellRef.toUpperCase()];
    const value = cell?.computed ?? parseFloat(cell?.value ?? '0');
    if (!isFinite(value)) { alert('Cel bevat geen geldig getal'); return; }
    onPick({ source: 'spreadsheet', sheetId: selectedSheet, cellRef: cellRef.toUpperCase() }, value);
    onClose();
  };

  const pickPdf = (m: typeof pdfMeasurements[0]) => {
    onPick({ source: 'pdf', measurementId: m.id, kind: m.type }, m.value);
    onClose();
  };

  const pickPdfSum = (kind: 'length' | 'area') => {
    const total = pdfMeasurements
      .filter(m => m.type === kind)
      .reduce((s, m) => s + m.value, 0);
    onPick({ source: 'pdf', measurementId: '__sum__', kind: kind === 'length' ? 'sum-length' : 'sum-area' }, total);
    onClose();
  };

  const pickIfc = (q: typeof ifcQuantities[0], kind: 'volume' | 'area' | 'length' | 'count') => {
    const value = q[kind] ?? 0;
    onPick({ source: 'ifc', fragmentId: q.fragmentId, quantity: kind }, value);
    onClose();
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modalStyle: React.CSSProperties = {
    background: 'var(--theme-bg)', borderRadius: 8, width: 520, maxHeight: '80vh',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 12px', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--theme-bg)' : 'var(--theme-surface)',
    color: active ? 'var(--theme-text)' : 'var(--theme-text-muted)',
    border: 'none', borderBottom: active ? '2px solid var(--theme-accent)' : '2px solid transparent',
    cursor: 'pointer',
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--theme-border)', fontWeight: 600 }}>
          🔗 Hoeveelheid linken
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--theme-border)' }}>
          <button style={tabBtnStyle(tab === 'spreadsheet')} onClick={() => setTab('spreadsheet')}>📊 Spreadsheet</button>
          <button style={tabBtnStyle(tab === 'pdf')} onClick={() => setTab('pdf')}>📄 PDF meting</button>
          <button style={tabBtnStyle(tab === 'ifc')} onClick={() => setTab('ifc')}>🏗️ IFC element</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, fontSize: 12 }}>
          {tab === 'spreadsheet' && (
            <>
              {subSheets.length === 0 ? (
                <div style={{ color: 'var(--theme-text-muted)' }}>Nog geen werkbladen. Maak eerst een spreadsheet aan.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Werkblad</div>
                    <select
                      value={selectedSheet}
                      onChange={e => setSelectedSheet(e.target.value)}
                      style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)', borderRadius: 4 }}
                    >
                      {subSheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Celreferentie (bijv. A5 of B12)</div>
                    <input
                      value={cellRef}
                      onChange={e => setCellRef(e.target.value)}
                      placeholder="A1"
                      style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)', borderRadius: 4 }}
                      autoFocus
                    />
                  </div>
                  {cellRef && activeSheet && (
                    <div style={{ padding: 8, background: 'var(--theme-surface)', borderRadius: 4, marginBottom: 12 }}>
                      Waarde: <b>{(() => {
                        const cell = activeSheet.cells[cellRef.toUpperCase()];
                        return cell?.computed ?? cell?.value ?? '(leeg)';
                      })()}</b>
                    </div>
                  )}
                  <button
                    onClick={pickSpreadsheet}
                    disabled={!cellRef}
                    style={{ padding: '8px 16px', background: 'var(--theme-accent)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >Link cel</button>
                </>
              )}
            </>
          )}
          {tab === 'pdf' && (
            <>
              {pdfMeasurements.length === 0 ? (
                <div style={{ color: 'var(--theme-text-muted)' }}>Nog geen PDF metingen. Open eerst een PDF in het PDF tabblad en maak metingen.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      onClick={() => pickPdfSum('length')}
                      style={{ flex: 1, padding: '8px', background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--theme-text)' }}
                    >Σ Alle lengtes</button>
                    <button
                      onClick={() => pickPdfSum('area')}
                      style={{ flex: 1, padding: '8px', background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--theme-text)' }}
                    >Σ Alle oppervlakken</button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 6 }}>Losse metingen:</div>
                  {pdfMeasurements.map(m => (
                    <div
                      key={m.id}
                      onClick={() => pickPdf(m)}
                      style={{
                        padding: 8, border: '1px solid var(--theme-border)', borderRadius: 4,
                        marginBottom: 4, cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                        background: 'var(--theme-surface)',
                      }}
                    >
                      <span>{m.type === 'length' ? '📏' : '⬛'} {m.label}</span>
                      <b>{m.value.toFixed(2)} {m.type === 'length' ? 'm' : 'm²'}</b>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {tab === 'ifc' && (
            <>
              {ifcQuantities.length === 0 ? (
                <div style={{ color: 'var(--theme-text-muted)' }}>Nog geen IFC elementen. Open een IFC in het 3D tabblad en selecteer een element.</div>
              ) : (
                ifcQuantities.map(q => (
                  <div key={q.fragmentId} style={{ padding: 8, border: '1px solid var(--theme-border)', borderRadius: 4, marginBottom: 4, background: 'var(--theme-surface)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{q.label}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(['volume', 'area', 'length', 'count'] as const).map(k => (
                        q[k] != null && (
                          <button
                            key={k}
                            onClick={() => pickIfc(q, k)}
                            style={{ padding: '4px 8px', fontSize: 11, background: 'var(--theme-accent)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                          >{k}: {q[k]?.toFixed(2)}</button>
                        )
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 14px', background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >Annuleren</button>
        </div>
      </div>
    </div>
  );
}
