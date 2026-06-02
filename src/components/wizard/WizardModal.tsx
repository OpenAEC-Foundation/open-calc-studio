import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './WizardModal.css';
import Modal from '../common/Modal';
import { getAllWizards, type WizardDefinition, type WizardResult } from '@/services/wizard/wizardRegistry';
import { useAppStore } from '@/state/appStore';
import { recalculateItems } from '@/services/calculation/calculator';

// Import wizards to register them
import '@/services/wizard/hsbWandCalculator';

type WizardStep = 'select' | 'params' | 'preview';

interface WizardModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WizardModal({ open, onClose }: WizardModalProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState<WizardStep>('select');
  const [selectedWizard, setSelectedWizard] = useState<WizardDefinition | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<WizardResult | null>(null);
  const { items, setItems, pushHistory } = useAppStore();

  const wizards = useMemo(() => getAllWizards(), []);

  const handleSelectWizard = (w: WizardDefinition) => {
    setSelectedWizard(w);
    // Init default values
    const defaults: Record<string, number | string> = {};
    for (const p of w.params) {
      defaults[p.key] = p.defaultValue;
    }
    setParamValues(defaults);
    setStep('params');
  };

  const handleCalculate = () => {
    if (!selectedWizard) return;
    const r = selectedWizard.calculate(paramValues);
    setResult(r);
    setStep('preview');
  };

  const handleInsert = () => {
    if (!result) return;
    pushHistory(items, `Wizard: ${result.chapterName}`);

    // Determine insertion sort order (append at end of top level)
    const topLevelItems = items.filter(i => i.parentId === null);
    const maxSort = topLevelItems.length > 0
      ? Math.max(...topLevelItems.map(i => i.sortOrder)) + 1
      : 0;

    // Adjust sort orders and depth for root chapter
    const wizardItems = result.items.map((item) => ({
      ...item,
      sortOrder: item.depth === 0 ? maxSort : item.sortOrder,
    }));

    const newItems = [...items, ...wizardItems];
    setItems(recalculateItems(newItems));
    handleClose();
  };

  const handleClose = () => {
    setStep('select');
    setSelectedWizard(null);
    setParamValues({});
    setResult(null);
    onClose();
  };

  const handleBack = () => {
    if (step === 'params') setStep('select');
    else if (step === 'preview') setStep('params');
  };

  const title = step === 'select' ? t('wizard.title')
    : step === 'params' ? `${selectedWizard?.icon} ${selectedWizard?.label}`
    : `Preview — ${result?.chapterName}`;

  return (
    <Modal open={open} onClose={handleClose} title={title} className="wizard-modal">
      {step === 'select' && (
        <div className="wizard-select">
          <p className="wizard-intro">{t('wizard.description')}</p>
          <div className="wizard-cards">
            {wizards.map(w => (
              <button key={w.id} className="wizard-card" onClick={() => handleSelectWizard(w)}>
                <span className="wizard-card-icon">{w.icon}</span>
                <span className="wizard-card-label">{w.label}</span>
                <span className="wizard-card-desc">{w.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'params' && selectedWizard && (
        <div className="wizard-params">
          <div className="wizard-param-grid">
            {selectedWizard.params.map(p => (
              <div key={p.key} className="wizard-param-row">
                <label className="wizard-param-label">
                  {p.label}
                  {p.unit && <span className="wizard-param-unit">({p.unit})</span>}
                </label>
                {p.type === 'number' && (
                  <input
                    type="number"
                    className="wizard-param-input"
                    value={paramValues[p.key] ?? p.defaultValue}
                    min={p.min}
                    max={p.max}
                    step={p.step ?? 1}
                    onChange={e => setParamValues(prev => ({ ...prev, [p.key]: parseFloat(e.target.value) || 0 }))}
                  />
                )}
                {p.type === 'select' && (
                  <select
                    className="wizard-param-input"
                    value={String(paramValues[p.key] ?? p.defaultValue)}
                    onChange={e => setParamValues(prev => ({ ...prev, [p.key]: e.target.value }))}
                  >
                    {p.options?.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                {p.type === 'text' && (
                  <input
                    type="text"
                    className="wizard-param-input"
                    value={String(paramValues[p.key] ?? '')}
                    onChange={e => setParamValues(prev => ({ ...prev, [p.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="wizard-actions">
            <button className="wizard-btn wizard-btn-secondary" onClick={handleBack}>{t('wizard.back')}</button>
            <button className="wizard-btn wizard-btn-primary" onClick={handleCalculate}>{t('wizard.calculate')}</button>
          </div>
        </div>
      )}

      {step === 'preview' && result && (
        <div className="wizard-preview">
          <div className="wizard-preview-table-wrap">
            <table className="wizard-preview-table">
              <thead>
                <tr>
                  <th>{t('wizard.type')}</th>
                  <th>{t('wizard.description_col')}</th>
                  <th className="align-right">{t('wizard.quantity')}</th>
                  <th>{t('wizard.unit')}</th>
                  <th className="align-right">{t('wizard.materialPrice')}</th>
                  <th className="align-right">{t('wizard.laborPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, idx) => (
                  <tr key={idx} className={`wizard-row-${item.rowType}`} style={{ paddingLeft: item.depth * 16 }}>
                    <td className="wizard-rowtype">{item.rowType}</td>
                    <td style={{ paddingLeft: item.depth * 16 }}>{item.description}</td>
                    <td className="align-right">{item.quantity != null ? item.quantity.toFixed(2) : ''}</td>
                    <td>{item.quantity != null ? item.unit : ''}</td>
                    <td className="align-right">{item.materialPrice != null ? `€ ${item.materialPrice.toFixed(2)}` : ''}</td>
                    <td className="align-right">{item.laborPrice != null ? `€ ${item.laborPrice.toFixed(2)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="wizard-actions">
            <button className="wizard-btn wizard-btn-secondary" onClick={handleBack}>{t('wizard.back')}</button>
            <button className="wizard-btn wizard-btn-primary" onClick={handleInsert}>{t('wizard.insertIntoBudget')}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
