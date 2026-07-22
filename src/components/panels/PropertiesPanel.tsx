import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatCurrency, formatNumber } from '@/utils/formatting';
import { isFooterRow } from '@/services/grid/gridRows';
import { BranchTreeEditor } from './BranchTreeEditor';
import type { FieldChange } from '@/types/costModel';
import './panels.css';


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

// ── Wijzigingshistorie ──

const FIELD_LABELS: Record<string, string> = {
  code: 'Code', description: 'Omschrijving', unit: 'Eenheid', quantity: 'Hoeveelheid',
  materialPrice: 'Materiaal', laborPrice: 'Arbeid/loon', notes: 'Notitie',
  normQuantity: 'Normhoeveelheid', normFactor: 'Normfactor', normDivisor: 'Normdeler',
  normUnitPrice: 'Norm-eenheidsprijs', resourceType: 'Middelsoort', tariefGroep: 'Tariefgroep',
  verrekenbaar: 'Verrekenbaar', staartPercentage: 'Percentage', nr: 'Nr',
};
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

const fmtHistVal = (v: string | number | boolean | null): string => {
  if (v === null || v === '') return '—';
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
};

const fmtHistDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** Toont de wijzigingshistorie van de geselecteerde regel: wat, oud→nieuw, wanneer, wie. */
const ItemHistoryView: React.FC<{ history?: FieldChange[] }> = ({ history }) => {
  const [open, setOpen] = useState(true);

  if (!history || history.length === 0) {
    return (
      <>
        <div style={sectionStyle}>Wijzigingshistorie</div>
        <div style={{ color: 'var(--theme-text-secondary)', fontStyle: 'italic' }}>
          Nog geen wijzigingen vastgelegd voor deze regel.
        </div>
      </>
    );
  }

  const entries = [...history].reverse(); // nieuwste bovenaan
  return (
    <>
      <div
        style={{ ...sectionStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Wijzigingshistorie ({history.length})</span>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((e, i) => (
            <div
              key={`${e.timestamp}-${i}`}
              style={{ borderLeft: '2px solid var(--theme-accent)', paddingLeft: 8, paddingTop: 1, paddingBottom: 3 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{fieldLabel(e.field)}</span>
                <span style={{ color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{fmtHistDate(e.timestamp)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ textDecoration: 'line-through', color: 'var(--theme-text-secondary)' }}>{fmtHistVal(e.oldValue)}</span>
                <span style={{ color: 'var(--theme-text-secondary)' }}>→</span>
                <span style={{ color: 'var(--theme-editable-text, var(--theme-text))', fontWeight: 500 }}>{fmtHistVal(e.newValue)}</span>
              </div>
              <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10 }}>
                <span title="Windows-gebruiker">👤 {e.user}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export const PropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeRow, activeItemId, items, getGridRows, updateItem,
  } = useAppStore();
  // Identiteit vóór index: activeItemId hoort gegarandeerd bij de
  // geselecteerde grid-rij. De rij-index alleen als fallback (bv. vlak na
  // laden), en dan via de gerenderde rijenlijst — een index in
  // getVisibleItems() wijst een ander item aan zodra er footerrijen zijn.
  const fromId = activeItemId ? items.find((i) => i.id === activeItemId) : undefined;
  const rowItem = fromId ? undefined : getGridRows()[activeRow];
  const item = fromId ?? (rowItem && !isFooterRow(rowItem.id) ? rowItem : undefined);

  return (
    <div style={{ padding: 12, fontSize: 11 }}>
      {/* Projectinformatie + kengetallen staan niet meer hier — die zitten in
          Begroting → Projectgegevens (lint-knop met dialoog). */}

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

          <ItemHistoryView history={item.history} />
        </>
      )}

      {/* Bedrijfsgegevens + Logo's staan niet meer hier — bedrijfsgegevens in
          Bestand → Bedrijfsgegevens, logo's in Rapportage → Logo's. */}

      {/* ── Begrotingsvarianten (in-/uitschakelen via Begroting → Varianten) ── */}
      <div style={sectionStyle}>Begrotingsvarianten</div>
      <BranchTreeEditor />
    </div>
  );
};
