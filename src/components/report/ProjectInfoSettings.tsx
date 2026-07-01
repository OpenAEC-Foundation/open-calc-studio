import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { formatCurrency, formatNumber, parseNlNumber } from '@/utils/formatting';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { createDefaultProjectProperties } from '@/types/costModel';

/**
 * Projectgegevens (naam/nummer/opdrachtgever/rapportdatum) + projectkengetallen.
 * Zelfstandig (leest/schrijft de store) zodat het in een dialoog vanaf het lint
 * getoond kan worden. Voorheen stond dit bovenaan het eigenschappen-paneel.
 */

const EditableNumberCell: React.FC<{ value: number | null; onChange: (v: number | null) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  if (editing) {
    return (
      <input ref={inputRef} className="prop-input" style={{ padding: '2px 4px', fontSize: 11, width: '100%' }}
        value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { setEditing(false); onChange(parseNlNumber(text)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(parseNlNumber(text)); } if (e.key === 'Escape') setEditing(false); }}
        placeholder={placeholder} />
    );
  }
  return (
    <div onClick={() => { setText(value != null ? String(value).replace('.', ',') : ''); setEditing(true); }}
      style={{ cursor: 'pointer', padding: '2px 4px', minHeight: 18, color: value != null ? 'var(--theme-editable-text, var(--theme-text))' : 'var(--theme-text-secondary)', borderBottom: '1px dashed var(--theme-border)' }}>
      {value != null ? formatNumber(value) : (placeholder ?? '-')}
    </div>
  );
};

const EditableTextCell: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  if (editing) {
    return (
      <input ref={inputRef} className="prop-input" style={{ padding: '2px 4px', fontSize: 11, width: '100%' }}
        value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { setEditing(false); onChange(text); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(text); } if (e.key === 'Escape') setEditing(false); }}
        placeholder={placeholder} />
    );
  }
  return (
    <div onClick={() => { setText(value); setEditing(true); }}
      style={{ cursor: 'pointer', padding: '2px 4px', minHeight: 18, color: value ? 'var(--theme-editable-text, var(--theme-text))' : 'var(--theme-text-secondary)', borderBottom: '1px dashed var(--theme-border)' }}>
      {value || (placeholder ?? '-')}
    </div>
  );
};

export const ProjectInfoSettings: React.FC = () => {
  const schedule = useAppStore(s => s.schedule);
  const setSchedule = useAppStore(s => s.setSchedule);
  const items = useAppStore(s => s.items);
  const updateProjectProperty = useAppStore(s => s.updateProjectProperty);
  const addProjectProperty = useAppStore(s => s.addProjectProperty);
  const removeProjectProperty = useAppStore(s => s.removeProjectProperty);

  const projectProperties = schedule.projectProperties ?? createDefaultProjectProperties();
  const staart = getStaartBreakdown(items);
  const totalExcl = staart.aanneemsomExcl;
  const totalIncl = staart.aanneemsomAfgerond;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Project</div>
        <input className="prop-input" value={schedule.projectName} onChange={(e) => setSchedule({ projectName: e.target.value })} placeholder="Projectnaam" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Projectnummer</div>
        <input className="prop-input" value={schedule.projectNumber} onChange={(e) => setSchedule({ projectNumber: e.target.value })} placeholder="Projectnummer" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Opdrachtgever</div>
        <input className="prop-input" value={schedule.client} onChange={(e) => setSchedule({ client: e.target.value })} placeholder="Opdrachtgever" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Rapportdatum</div>
        <input className="prop-input" type="date" value={schedule.reportDate ?? ''} onChange={(e) => setSchedule({ reportDate: e.target.value || undefined })} />
      </div>

      <div className="prop-separator">
        <div className="prop-label" style={{ fontWeight: 600, marginBottom: 6 }}>Projectkengetallen</div>
        <table className="project-metrics-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Eigenschap</th>
              <th style={{ textAlign: 'right', width: 70 }}>Waarde</th>
              <th style={{ textAlign: 'center', width: 40 }}>Eenh.</th>
              <th style={{ textAlign: 'right', width: 68 }}>€/eh. excl.</th>
              <th style={{ textAlign: 'right', width: 68 }}>€/eh. incl.</th>
              <th style={{ width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {projectProperties.map((prop) => {
              const hasVal = prop.value != null && prop.value > 0;
              const perExcl = hasVal && totalExcl > 0 ? totalExcl / prop.value! : null;
              const perIncl = hasVal && totalIncl > 0 ? totalIncl / prop.value! : null;
              return (
                <tr key={prop.id}>
                  <td>{prop.isDefault ? <span>{prop.name}</span> : <EditableTextCell value={prop.name} onChange={(v) => updateProjectProperty(prop.id, 'name', v)} placeholder="Naam..." />}</td>
                  <td style={{ textAlign: 'right' }}><EditableNumberCell value={prop.value} onChange={(v) => updateProjectProperty(prop.id, 'value', v)} placeholder="0" /></td>
                  <td style={{ textAlign: 'center', color: 'var(--theme-text-secondary)' }}>{prop.isDefault ? prop.unit : <EditableTextCell value={prop.unit} onChange={(v) => updateProjectProperty(prop.id, 'unit', v)} placeholder="eenh." />}</td>
                  <td style={{ textAlign: 'right', color: 'var(--theme-text-secondary)' }}>{perExcl != null ? formatCurrency(perExcl) : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{perIncl != null ? formatCurrency(perIncl) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {!prop.isDefault && (
                      <button className="metrics-delete-btn" onClick={() => removeProjectProperty(prop.id)} title="Verwijderen">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" /></svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="metrics-add-btn" onClick={addProjectProperty} title="Kengetal toevoegen">+ Kengetal toevoegen</button>
      </div>
    </div>
  );
};
