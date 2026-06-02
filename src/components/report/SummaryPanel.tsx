import './summary.css';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { getKostprijs, getStaartBreakdown, getGrandTotal } from '@/services/calculation/calculator';
import { formatCurrency } from '@/utils/formatting';

export const SummaryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { items, schedule } = useAppStore();
  const kostprijs = getKostprijs(items);
  const breakdown = getStaartBreakdown(items);
  const grandTotal = getGrandTotal(items);
  const hasStaart = items.some(i => i.rowType === 'staart_ukk' || i.rowType === 'staart_ak' || i.rowType === 'staart_wr' || i.rowType === 'staart_afronding');

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
              <span>{ch.nr} {ch.description}</span>
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
            {breakdown.ukkPercentage > 0 && (
              <>
                <div className="summary-row">
                  <span>UKK ({breakdown.ukkPercentage}%)</span>
                  <span>{formatCurrency(breakdown.ukkAmount)}</span>
                </div>
                <div className="summary-row summary-row-subtotal">
                  <span>{t('subtotal1')}</span>
                  <span>{formatCurrency(breakdown.subtotaal1)}</span>
                </div>
              </>
            )}
            {breakdown.akPercentage > 0 && (
              <>
                <div className="summary-row">
                  <span>AK ({breakdown.akPercentage}%)</span>
                  <span>{formatCurrency(breakdown.akAmount)}</span>
                </div>
                <div className="summary-row summary-row-subtotal">
                  <span>{t('subtotal2')}</span>
                  <span>{formatCurrency(breakdown.subtotaal2)}</span>
                </div>
              </>
            )}
            {breakdown.wrPercentage > 0 && (
              <div className="summary-row">
                <span>W&amp;R ({breakdown.wrPercentage}%)</span>
                <span>{formatCurrency(breakdown.wrAmount)}</span>
              </div>
            )}
            {breakdown.afronding !== 0 && (
              <div className="summary-row">
                <span>{t('rounding')}</span>
                <span>{formatCurrency(breakdown.afronding)}</span>
              </div>
            )}
            <div className="summary-row summary-row-total summary-row-grand">
              <span>{t('contractSumExclVat')}</span>
              <span>{formatCurrency(breakdown.aanneemsomAfgerond || breakdown.aanneemsom)}</span>
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
