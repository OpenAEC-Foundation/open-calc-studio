import React, { useMemo, useRef, useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useAppStore } from '@/state/appStore';
import type { CodeEntry, CodeScheme } from '@/data/codeLibrary';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Aangeroepen met de gekozen codering. */
  onPick: (entry: CodeEntry) => void;
}

const SCHEME_LABEL: Record<CodeScheme, string> = { stabu: 'STABU', nlsfb: 'NL-SfB' };

type Filter = 'all' | CodeScheme;

/**
 * Coderingskiezer (STABU / NL-SfB) voor het Nr-veld. Toont de ingebouwde lijst
 * plus eigen coderingen, met zoekfilter en een formuliertje om zelf een
 * codering toe te voegen. Dubbelklik/Enter kiest een codering.
 */
export const CodePickerModal: React.FC<Props> = ({ open, onClose, onPick }) => {
  const getAllCodes = useAppStore((s) => s.getAllCodes);
  const customCodes = useAppStore((s) => s.customCodes);
  const addCustomCode = useAppStore((s) => s.addCustomCode);
  const removeCustomCode = useAppStore((s) => s.removeCustomCode);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newScheme, setNewScheme] = useState<CodeScheme>('stabu');
  const searchRef = useRef<HTMLInputElement>(null);

  // customCodes meenemen als dependency zodat een toegevoegde code direct verschijnt.
  const all = useMemo(() => getAllCodes(), [getAllCodes, customCodes]);
  const customKeys = useMemo(
    () => new Set(customCodes.map((e) => `${e.scheme}:${e.code}`)),
    [customCodes],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => {
      if (filter !== 'all' && e.scheme !== filter) return false;
      if (!q) return true;
      return e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    });
  }, [all, query, filter]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setShowAdd(false);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const pick = (e: CodeEntry) => { onPick(e); onClose(); };

  const handleAdd = () => {
    const code = newCode.trim();
    if (!code) return;
    const entry: CodeEntry = { code, description: newDesc.trim(), scheme: newScheme };
    addCustomCode(entry);
    setNewCode('');
    setNewDesc('');
    setShowAdd(false);
    setQuery(code);
  };

  return (
    <Modal open={open} onClose={onClose} title="Codering kiezen (STABU / NL-SfB)" className="code-picker-modal">
      <div style={{ fontSize: 12, minWidth: 460 }}>
        {/* Zoek + filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            ref={searchRef}
            className="prop-input"
            style={{ flex: 1 }}
            placeholder="Zoek op code of omschrijving…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length > 0) pick(results[0]);
            }}
          />
          <div style={{ display: 'flex', gap: 2 }}>
            {(['all', 'stabu', 'nlsfb'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid var(--theme-border)',
                  background: filter === f ? 'var(--theme-accent)' : 'var(--theme-surface)',
                  color: filter === f ? '#fff' : 'var(--theme-text)',
                }}
              >
                {f === 'all' ? 'Alle' : SCHEME_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Resultatenlijst */}
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--theme-border)', borderRadius: 4 }}>
          {results.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--theme-text-secondary)', fontStyle: 'italic' }}>
              Geen coderingen gevonden. Voeg er hieronder zelf één toe.
            </div>
          ) : (
            results.map((e) => {
              const isCustom = customKeys.has(`${e.scheme}:${e.code}`);
              return (
                <div
                  key={`${e.scheme}:${e.code}`}
                  onClick={() => pick(e)}
                  onDoubleClick={() => pick(e)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                    cursor: 'pointer', borderBottom: '1px solid var(--theme-border-subtle, var(--theme-border))',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--theme-hover, rgba(125,125,125,0.12))')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, minWidth: 72 }}>{e.code}</span>
                  <span style={{ flex: 1 }}>{e.description}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 9999,
                    background: e.scheme === 'stabu' ? 'rgba(59,130,246,0.15)' : 'rgba(22,163,74,0.15)',
                    color: e.scheme === 'stabu' ? '#3b82f6' : '#16a34a',
                  }}>{SCHEME_LABEL[e.scheme]}</span>
                  {isCustom && (
                    <button
                      title="Eigen codering verwijderen"
                      onClick={(ev) => { ev.stopPropagation(); removeCustomCode(e.scheme, e.code); }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--theme-danger, #dc2626)', fontSize: 12, padding: 0 }}
                    >✕</button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Eigen codering toevoegen */}
        <div style={{ marginTop: 10 }}>
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
            >+ Eigen codering toevoegen</button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="prop-input" style={{ width: 90 }} placeholder="Code"
                value={newCode} autoFocus onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <input
                className="prop-input" style={{ flex: 1, minWidth: 140 }} placeholder="Omschrijving"
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <select className="prop-input" style={{ width: 90 }} value={newScheme} onChange={(e) => setNewScheme(e.target.value as CodeScheme)}>
                <option value="stabu">STABU</option>
                <option value="nlsfb">NL-SfB</option>
              </select>
              <button
                onClick={handleAdd}
                style={{ fontSize: 11, padding: '4px 10px', border: 'none', background: 'var(--theme-accent)', color: '#fff', borderRadius: 3, cursor: 'pointer' }}
              >Toevoegen</button>
              <button
                onClick={() => setShowAdd(false)}
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
              >Annuleren</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
