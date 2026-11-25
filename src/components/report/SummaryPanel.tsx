import { uiText } from '@/i18n/uiText';
import './summary.css';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { getKostprijs, getStaartBreakdown, getGrandTotal } from '@/services/calculation/calculator';
import { isStagartRowType, type CostItem } from '@/types/costModel';
import { useMoney } from '@/hooks/useMoney';
import { useVariantItems } from '@/hooks/useVariantItems';

export const SummaryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { schedule } = useAppStore();
  const items = useVariantItems();
  const formatCurrency = useMoney();
  const kostprijs = getKostprijs(items);
  const breakdown = getStaartBreakdown(items);
  const grandTotal = getGrandTotal(items);
  // Elke staart telt, ook de Bouw 1-staart (ak_oa, abk, risico, btw, …);
  // eerder bleef de sectie dan leeg (knownbug 130).
  const hasStaart = items.some(i => isStagartRowType(i.rowType));
  const isBtw = (i: CostItem) => i.rowType === 'staart_btw' || i.rowType === 'staart_btw_laag';
  const staartRegels = items.filter(i => isStagartRowType(i.rowType) && i.total !== 0);
  const opslagen = staartRegels.filter(i => !isBtw(i));
  const btwRegels = staartRegels.filter(isBtw);
  // Excl. btw = opslagen + afronding; aanneemsomAfgerond bevat ook de btw
  // en stond hier eerder onder "excl. BTW" (knownbugs 127, 130).
  const exclBtw = breakdown.aanneemsom + breakdown.afronding;
  const staartLabel = (item: CostItem): string => {
    const pct = item.staartPercentage ? ` (${item.staartPercentage}%)` : '';
    switch (item.rowType) {
      case 'staart_ukk': return `${uiText("summary.siteCosts", "Site costs")}${pct}`;
      case 'staart_ak': return `${uiText("summary.overheads", "Overheads")}${pct}`;
      case 'staart_wr': return `${uiText("summary.profitRisk", "Profit & risk")}${pct}`;
      case 'staart_afronding': return t('rounding');
      // Staartomschrijvingen eindigen vaak op ':' ("Risk:"); hier volgt het percentage.
      default: return `${(item.description || '').replace(/:\s*$/, '')}${pct}`;
    }
  };

  // Count chapters and items
  const chapters = items.filter(i => i.rowType === 'chapter');
  const normalItems = items.filter(i => i.rowType === 'begrotingspost');

  return (
    <div className="summary-panel">
      <div className="summary-card">
        <h2 className="summary-title">{schedule.name || t('budget')}</h2>
        <p className="summary-subtitle">{schedule.projectNumber}</p>

        <div className="summary-section">
          <h3 className="summary-section-title">{t('overview')}</h3>
          <div className="summary-row">
            <span>{t('chapters')}</span>
            <span>{chapters.length}</span>
          </div>
          <div className="summary-row">
            <span>{t('rows')}</span>
            <span>{normalItems.length}</span>
          </div>
        </div>

        <div className="summary-section">
          <h3 className="summary-section-title">{t('costPrice')}</h3>
          {chapters.filter(ch => ch.parentId === null).map(ch => (
            <div className="summary-row" key={ch.id}>
              <span>{ch.code?.trim() || ch.nr} {ch.description}</span>
              <span>{formatCurrency(ch.total)}</span>
            </div>
          ))}
          <div className="summary-row summary-row-total">
            <span>{t('costPriceDirect')}</span>
            <span>{formatCurrency(kostprijs)}</span>
          </div>
        </div>

        {hasStaart && (
          <div className="summary-section">
            <h3 className="summary-section-title">{t('surcharges')}</h3>
            {opslagen.map(item => (
              <React.Fragment key={item.id}>
                <div className="summary-row">
                  <span>{staartLabel(item)}</span>
                  <span>{formatCurrency(item.total)}</span>
                </div>
                {item.rowType === 'staart_ukk' && (
                  <div className="summary-row summary-row-subtotal">
                    <span>{t('subtotal1')}</span>
                    <span>{formatCurrency(breakdown.subtotaal1)}</span>
                  </div>
                )}
                {item.rowType === 'staart_ak' && (
                  <div className="summary-row summary-row-subtotal">
                    <span>{t('subtotal2')}</span>
                    <span>{formatCurrency(breakdown.subtotaal2)}</span>
                  </div>
                )}
              </React.Fragment>
            ))}
            <div className="summary-row summary-row-total">
              <span>{t('contractSumExclVat')}</span>
              <span>{formatCurrency(exclBtw)}</span>
            </div>
            {btwRegels.map(item => (
              <div className="summary-row" key={item.id}>
                <span>{staartLabel(item)}</span>
                <span>{formatCurrency(item.total)}</span>
              </div>
            ))}
            <div className="summary-row summary-row-total summary-row-grand">
              <span>{t('totalInclVat')}</span>
              <span>{formatCurrency(breakdown.aanneemsomAfgerond)}</span>
            </div>
          </div>
        )}

        {!hasStaart && (
          <div className="summary-section">
            <div className="summary-row summary-row-total summary-row-grand">
              <span>{t('totalExclVat')}</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
