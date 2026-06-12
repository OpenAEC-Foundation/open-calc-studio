import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatCurrency, formatNumber, parseNlNumber } from '@/utils/formatting';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { createDefaultProjectProperties } from '@/types/costModel';
import { BranchTreeEditor } from './BranchTreeEditor';
import { createThumbnail } from '@/services/offerte/imageService';
import type { CompanyInfo } from '@/types/costModel';
import './panels.css';

const LogoUploaders: React.FC<{ companyInfo: CompanyInfo; setCompanyInfo: (ci: CompanyInfo) => void }> = ({ companyInfo, setCompanyInfo }) => {
  const logoLeftRef = useRef<HTMLInputElement>(null);
  const logoRightRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = async (side: 'logoLeft' | 'logoRight') => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, filters: [{ name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
      if (selected) {
        const { createOfferteImageFromPath } = await import('@/services/offerte/imageService');
        const img = await createOfferteImageFromPath(selected as string);
        setCompanyInfo({ ...companyInfo, [side]: img.thumbnail });
      }
    } catch {
      (side === 'logoLeft' ? logoLeftRef : logoRightRef).current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, side: 'logoLeft' | 'logoRight') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const thumbnail = await createThumbnail(file);
    setCompanyInfo({ ...companyInfo, [side]: thumbnail });
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {(['logoLeft', 'logoRight'] as const).map(side => (
        <div key={side} style={{ flex: 1 }}>
          <div className="prop-label">{side === 'logoLeft' ? 'Logo links' : 'Logo rechts'}</div>
          <div
            style={{
              height: 48, border: '1px dashed var(--theme-border)', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', background: 'var(--theme-surface)', overflow: 'hidden',
            }}
            onClick={() => handleLogoSelect(side)}
          >
            {companyInfo[side] ? (
              <img src={companyInfo[side]} alt={side} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
              <span style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Kies logo</span>
            )}
          </div>
          {companyInfo[side] && (
            <button
              style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--theme-danger, #dc2626)', cursor: 'pointer', marginTop: 2, padding: 0 }}
              onClick={(e) => { e.stopPropagation(); setCompanyInfo({ ...companyInfo, [side]: '' }); }}
            >Verwijder</button>
          )}
          <input
            ref={side === 'logoLeft' ? logoLeftRef : logoRightRef}
            type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e, side)}
          />
        </div>
      ))}
    </div>
  );
};


/** Inline editable number cell */
const EditableNumberCell: React.FC<{
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStart = () => {
    setText(value != null ? String(value).replace('.', ',') : '');
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    const parsed = parseNlNumber(text);
    onChange(parsed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="prop-input"
        style={{ padding: '2px 4px', fontSize: 11, width: '100%' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommit();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={handleStart}
      style={{
        cursor: 'pointer',
        padding: '2px 4px',
        minHeight: 18,
        color: value != null ? 'var(--theme-editable-text, var(--theme-text))' : 'var(--theme-text-secondary)',
        borderBottom: '1px dashed var(--theme-border)',
      }}
    >
      {value != null ? formatNumber(value) : (placeholder ?? '-')}
    </div>
  );
};

/** Inline editable text cell */
const EditableTextCell: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStart = () => {
    setText(value);
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    onChange(text);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="prop-input"
        style={{ padding: '2px 4px', fontSize: 11, width: '100%' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommit();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={handleStart}
      style={{
        cursor: 'pointer',
        padding: '2px 4px',
        minHeight: 18,
        color: value ? 'var(--theme-editable-text, var(--theme-text))' : 'var(--theme-text-secondary)',
        borderBottom: '1px dashed var(--theme-border)',
      }}
    >
      {value || (placeholder ?? '-')}
    </div>
  );
};

// OpenAEC section label style (JetBrains Mono, uppercase, amber on light)
const sectionStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--theme-accent)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginTop: 20,
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: '1px solid var(--theme-border)',
};

export const PropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeRow, getVisibleItems, schedule, setSchedule, updateItem, items,
    updateProjectProperty, addProjectProperty, removeProjectProperty,
    companyInfo, setCompanyInfo,
  } = useAppStore();
  const visibleItems = getVisibleItems();
  const item = visibleItems[activeRow];

  const projectProperties = schedule.projectProperties ?? createDefaultProjectProperties();
  // Aanneemsom both excl. and incl. btw — used to derive the price-per-unit for each
  // project metric (e.g. € per m² BVO), shown in two columns. (Computing a total here
  // was previously omitted, which threw `grandTotal is not defined` and crashed the
  // panel as soon as any metric had a value > 0.)
  const staart = getStaartBreakdown(items);
  const totalExcl = staart.aanneemsomExcl;
  const totalIncl = staart.aanneemsomAfgerond;

  const handleCompanyChange = (key: keyof typeof companyInfo, value: string) => {
    setCompanyInfo({ ...companyInfo, [key]: value });
  };

  return (
    <div style={{ padding: 12, fontSize: 11 }}>
      {/* ── Projectinformatie (bovenaan) ── */}
      <div style={{ ...sectionStyle, marginTop: 0 }}>Projectinformatie</div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">{t('project')}</div>
        <input
          className="prop-input"
          value={schedule.projectName}
          onChange={(e) => setSchedule({ projectName: e.target.value })}
          placeholder={t('projectName')}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">{t('projectNumber')}</div>
        <input
          className="prop-input"
          value={schedule.projectNumber}
          onChange={(e) => setSchedule({ projectNumber: e.target.value })}
          placeholder={t('projectNumber')}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">{t('client')}</div>
        <input
          className="prop-input"
          value={schedule.client}
          onChange={(e) => setSchedule({ client: e.target.value })}
          placeholder={t('clientPlaceholder')}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Rapportdatum</div>
        <input
          className="prop-input"
          type="date"
          value={schedule.reportDate ?? ''}
          onChange={(e) => setSchedule({ reportDate: e.target.value || undefined })}
        />
      </div>

      {/* ── Project Metrics Table ── */}
      <div className="prop-separator">
        <div className="prop-label" style={{ fontWeight: 600, marginBottom: 6 }}>
          Projectkengetallen
        </div>
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
                  <td>
                    {prop.isDefault ? (
                      <span>{prop.name}</span>
                    ) : (
                      <EditableTextCell
                        value={prop.name}
                        onChange={(v) => updateProjectProperty(prop.id, 'name', v)}
                        placeholder="Naam..."
                      />
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <EditableNumberCell
                      value={prop.value}
                      onChange={(v) => updateProjectProperty(prop.id, 'value', v)}
                      placeholder="0"
                    />
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--theme-text-secondary)' }}>
                    {prop.isDefault ? (
                      prop.unit
                    ) : (
                      <EditableTextCell
                        value={prop.unit}
                        onChange={(v) => updateProjectProperty(prop.id, 'unit', v)}
                        placeholder="eenh."
                      />
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--theme-text-secondary)' }}>
                    {perExcl != null ? formatCurrency(perExcl) : '-'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>
                    {perIncl != null ? formatCurrency(perIncl) : '-'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!prop.isDefault && (
                      <button
                        className="metrics-delete-btn"
                        onClick={() => removeProjectProperty(prop.id)}
                        title="Verwijderen"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          className="metrics-add-btn"
          onClick={addProjectProperty}
          title="Kengetal toevoegen"
        >
          + Kengetal toevoegen
        </button>
      </div>

      {item && (
        <>
          <div style={sectionStyle}>Geselecteerd item</div>
          <div style={{ marginBottom: 8 }}>
            <div className="prop-label">{t('selectedItem')}</div>
            <div className="prop-value" style={{ fontWeight: 600 }}>{item.description || t('noDescription')}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div className="prop-label">Type</div>
            {(() => {
              const typeInfo: Record<string, { label: string; bg: string; fg: string }> = {
                chapter: { label: 'Hoofdstuk', bg: 'rgba(22,163,74,0.15)', fg: '#16a34a' },
                begrotingspost: { label: 'Begrotingspost', bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
                bewakingspost: { label: 'Bewakingspost', bg: 'rgba(217,119,6,0.15)', fg: '#d97706' },
                regel: { label: 'Rekenregel', bg: 'rgba(120,120,128,0.15)', fg: 'var(--theme-text-secondary)' },
                tekstregel: { label: 'Tekstregel', bg: 'rgba(120,120,128,0.12)', fg: 'var(--theme-text-secondary)' },
                witregel: { label: 'Witregel', bg: 'rgba(120,120,128,0.12)', fg: 'var(--theme-text-secondary)' },
              };
              const info = item.rowType.startsWith('staart_')
                ? { label: 'Staartregel', bg: 'rgba(120,120,128,0.12)', fg: 'var(--theme-text-secondary)' }
                : typeInfo[item.rowType] ?? { label: item.rowType, bg: 'rgba(120,120,128,0.12)', fg: 'var(--theme-text-secondary)' };
              return (
                <span style={{
                  display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
                  background: info.bg, color: info.fg, fontSize: 11, fontWeight: 600,
                }}>{info.label}</span>
              );
            })()}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div className="prop-label">{t('code')}</div>
            <div className="prop-value">{item.code || '-'}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div className="prop-label">{t('notes')}</div>
            <textarea
              className="prop-textarea"
              value={item.notes}
              onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
              placeholder={t('notesPlaceholder')}
            />
          </div>
          <div style={{ marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div className="prop-label">{t('unitPrice')}</div>
              <div className="prop-value">{formatCurrency(item.unitPrice)}</div>
            </div>
            <div>
              <div className="prop-label">{t('total')}</div>
              <div className="prop-value" style={{ fontWeight: 600 }}>{formatCurrency(item.total)}</div>
            </div>
          </div>
        </>
      )}

      {/* ── Bedrijfsgegevens ── */}
      <div style={sectionStyle}>Bedrijfsgegevens</div>
      {([
        { key: 'name', label: 'Bedrijfsnaam' },
        { key: 'postalAddress', label: 'Postadres' },
        { key: 'postalCity', label: 'Plaats (post)' },
        { key: 'visitAddress', label: 'Bezoekadres' },
        { key: 'visitCity', label: 'Plaats (bezoek)' },
        { key: 'phone', label: 'Telefoon' },
        { key: 'fax', label: 'Fax' },
        { key: 'email', label: 'E-mail' },
      ] as const).map(({ key, label }) => (
        <div style={{ marginBottom: 8 }} key={key}>
          <div className="prop-label">{label}</div>
          <input
            className="prop-input"
            type={key === 'email' ? 'email' : 'text'}
            value={companyInfo[key] || ''}
            onChange={(e) => handleCompanyChange(key, e.target.value)}
          />
        </div>
      ))}

      {/* ── Logo's rapportage ── */}
      <div style={sectionStyle}>Logo's rapportage (Bouw 1)</div>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">Rapport-logo</div>
        <select
          className="prop-input"
          value={schedule.reportLogoPreset ?? 'bouw1'}
          onChange={(e) => setSchedule({ reportLogoPreset: e.target.value as 'bouw1' | 'custom' })}
        >
          <option value="bouw1">Standaard</option>
          <option value="custom">Eigen logo (upload)</option>
        </select>
      </div>
      <LogoUploaders companyInfo={companyInfo} setCompanyInfo={setCompanyInfo} />

      {/* ── Begrotingsvarianten ── */}
      <div style={sectionStyle}>Begrotingsvarianten</div>
      <BranchTreeEditor />
    </div>
  );
};
