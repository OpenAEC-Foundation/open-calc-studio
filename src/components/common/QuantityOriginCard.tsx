import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostItem } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';
import { getQuantityOrigin } from '@/services/quantity/quantityOrigin';
import { openQuantitySource } from '@/services/quantity/quantitySourceActions';
import { uiText } from '@/i18n/uiText';
import Modal from './Modal';
import './QuantityOriginCard.css';

export function QuantityOriginCard({ item, onNavigate, allowNavigate = true }: { item: CostItem; onNavigate?: () => void; allowNavigate?: boolean }) {
  const { i18n } = useTranslation();
  const schedule = useAppStore(s => s.schedule), subSheets = useAppStore(s => s.subSheets), ifcQuantities = useAppStore(s => s.ifcQuantities);
  const origin = getQuantityOrigin(item, { schedule, subSheets, ifcQuantities });
  const [error, setError] = useState('');
  const number = (value: number | null) => value == null ? '—' : value.toLocaleString(i18n.language || 'en', { maximumFractionDigits: 6 });
  async function navigate(index: number) {
    try {
      const result = await openQuantitySource(item.id, index);
      if (result.view === 'viewer3d' && !result.geometryLoaded) setError(uiText('origin.reloadIfc', 'Model data is saved. Reopen the original IFC file in the 3D view to highlight its geometry.'));
      else { setError(''); onNavigate?.(); }
    } catch (error) { setError((error as Error).message); }
  }
  return <section className="quantity-origin-card" aria-label={uiText('origin.title', 'Quantity origin')}>
    <h3 className="oa-heading oa-heading--panel">{uiText('origin.title', 'Quantity origin')}</h3>
    <div className="quantity-origin-value oa-number">{number(item.quantity)} {item.unit}</div>
    <span className="oa-chip">{uiText(`origin.kind.${origin.source}`, origin.source)}</span>
    {origin.verified === false && <p role="status" className="quantity-origin-warning">{uiText('revisions.unverified', 'Review source identity')}</p>}
    {origin.status === 'manual' && <p>{uiText('origin.manual', 'Entered manually; no live source is linked.')}</p>}
    {origin.source === 'excel' && <p>{uiText('origin.externalExcel', 'External Excel reference. The source file has not been checked here.')}</p>}
    {origin.status === 'missing' && origin.source !== 'excel' && <p role="alert" className="quantity-origin-warning">{uiText('origin.sourceMissing', 'The source is unavailable. The last known quantity has been retained.')}</p>}
    {origin.status === 'different' && <p role="status" className="quantity-origin-warning">{uiText('origin.different', 'The linked source currently returns {{value}} {{unit}}.', { value: number(origin.value), unit: origin.unit })}</p>}
    {origin.unitMismatch && <p role="alert" className="quantity-origin-warning">{uiText('origin.unitMismatch', 'Source unit {{source}} differs from row unit {{target}}. Check the units; no conversion is assumed.', { source: origin.unit, target: item.unit })}</p>}
    {origin.label && <strong>{origin.label}</strong>}
    {!!origin.sources.length && <details open><summary>{uiText('origin.sources', 'Sources ({{count}})', { count: origin.sources.length })}</summary><ul>{origin.sources.map((source, index) => <li key={`${source.id}:${source.measurementId ?? index}`}>
      <span>{source.name}{source.page ? ` · ${uiText('origin.page', 'Page {{page}}', { page: source.page })}` : ''}</span>
      <code title={source.id}>{source.id}</code>
      {source.quantityKey && <span>{source.quantityKey}</span>}
      {!!source.elementIds?.length && <span>{source.elementIds.map(id => `#${id}`).join(', ')}</span>}
      {allowNavigate && origin.source === 'pdf' && origin.status !== 'missing' && <button type="button" className="oa-button oa-button--quiet oa-button--compact" onClick={() => void navigate(index)}>{uiText('origin.open', 'Open source')}</button>}
    </li>)}</ul></details>}
    {origin.formula && <div><span className="oa-mono-label">{uiText('origin.formula', 'Calculation / reference')}</span><code>{origin.formula}</code></div>}
    {origin.captured?.capturedAt && <p className="oa-secondary">{uiText('origin.captured', 'Linked on {{date}} · source value {{value}} {{unit}}', { date: new Date(origin.captured.capturedAt).toLocaleString(i18n.language || 'en'), value: number(origin.captured.value), unit: origin.captured.unit })}</p>}
    {allowNavigate && item.quantityLink && origin.source !== 'pdf' && origin.status !== 'missing' && <button type="button" className="oa-button" onClick={() => void navigate(0)}>{uiText('origin.open', 'Open source')}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function QuantityOriginDialog() {
  const { t } = useTranslation();
  const id = useAppStore(s => s.quantityOriginItemId), item = useAppStore(s => s.items.find(item => item.id === s.quantityOriginItemId));
  const close = () => useAppStore.getState().showQuantityOrigin(null);
  return <Modal open={!!id} onClose={close} title={uiText('origin.title', 'Quantity origin')} className="quantity-origin-dialog">{item ? <QuantityOriginCard key={item.id} item={item} onNavigate={close} /> : <p>{t('noDocumentOpen')}</p>}</Modal>;
}
