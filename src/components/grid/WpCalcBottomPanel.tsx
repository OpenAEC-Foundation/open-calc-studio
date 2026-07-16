import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatCurrency, formatNumber, formatNumberForEdit } from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';

/**
 * Full-content view for the "Uren & Staart" bottom-nav tab: the hours
 * overview and the staart (tail-cost) cascade side by side.
 */
export function UrenStaartView() {
  return (
    <div className="urenstaart-view">
      <UrenFullScreen />
      <StaartFullScreen />
    </div>
  );
}

function UrenFullScreen() {
  const { t } = useTranslation('common');
  const items = useAppStore((s) => s.items);
  const schedule = useAppStore((s) => s.schedule);
  const updateTarieven = useAppStore((s) => s.updateTarieven);
  const prorateUrenByTariefGroep = useAppStore((s) => s.prorateUrenByTariefGroep);
  const prorateUrenTotal = useAppStore((s) => s.prorateUrenTotal);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const tarieven = schedule.tarieven ?? { A: 64, B: 43, C: 82 };

  const urenData = useMemo(() => {
    const groups: Record<string, { uren: number; tarief: number }> = {};
    for (const item of items) {
      if (item.rowType !== 'regel') continue;
      const groep = item.tariefGroep || '-';
      if (!groups[groep]) {
        groups[groep] = { uren: 0, tarief: tarieven[groep] || 0 };
      }
      const qty = item.quantity ?? 0;
      const norm = item.normQuantity ?? 0;
      const cap = item.normFactor ?? 1;
      groups[groep].uren += qty * norm / (cap || 1);
    }
    return groups;
  }, [items, tarieven]);

  const handleTariefChange = (groep: string, value: string) => {
    const num = parseFloat(value.replace(',', '.'));
    if (isNaN(num)) return;
    updateTarieven({ ...tarieven, [groep]: num });
  };

  /** Commit a new total uren for a tariefgroep — rescales norm naar rato. */
  const handleUrenChange = (groep: string, value: string, currentUren: number) => {
    const num = parseFloat(value.replace(',', '.'));
    if (isNaN(num) || num < 0) return;
    // No-op if unchanged (avoid clobbering precision)
    if (Math.abs(num - currentUren) < 0.001) return;
    // Only A/B/C tariefgroepen are valid rescale targets; '-' (no group) is read-only
    if (groep !== 'A' && groep !== 'B' && groep !== 'C') return;
    pushHistory(items, `Uren ${groep} naar rato`);
    prorateUrenByTariefGroep(groep, num);
  };

  /** Commit a new GRAND total uren — rescales all regels naar rato. */
  const handleTotaalUrenChange = (value: string, currentTotal: number) => {
    const num = parseFloat(value.replace(',', '.'));
    if (isNaN(num) || num < 0) return;
    if (Math.abs(num - currentTotal) < 0.001) return;
    pushHistory(items, 'Totaal uren naar rato');
    prorateUrenTotal(num);
  };

  const entries = Object.entries(urenData).sort(([a], [b]) => a.localeCompare(b));
  const totaalUren = entries.reduce((s, [, v]) => s + v.uren, 0);
  const totaalBedrag = entries.reduce((s, [, v]) => s + v.uren * v.tarief, 0);

  return (
    <div className="wpcalc-fullscreen-panel">
      <h3>{t('wpcalc.hoursOverview')}</h3>
      <table className="wpcalc-bottom-table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>{t('wpcalc.headerType')}</th>
            <th style={{ width: 100, textAlign: 'right' }}>{t('wpcalc.headerHours')}</th>
            <th style={{ width: 100, textAlign: 'right' }}>{t('wpcalc.headerRate')}</th>
            <th style={{ width: 120, textAlign: 'right' }}>{t('wpcalc.headerTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([groep, val]) => (
            <tr key={groep}>
              <td>{t('wpcalc.rateGroup')} {groep}</td>
              <td style={{ textAlign: 'right' }}>
                {groep !== '-' ? (
                  <input
                    key={`uren-${groep}-${val.uren}`}
                    type="text"
                    className="uren-input"
                    defaultValue={formatNumber(val.uren)}
                    title="Pas het groepstotaal aan — onderliggende regels worden naar rato herrekend"
                    onBlur={(e) => handleUrenChange(groep, e.target.value, val.uren)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUrenChange(groep, e.currentTarget.value, val.uren);
                        e.currentTarget.blur();
                      }
                    }}
                    style={{
                      width: 80,
                      textAlign: 'right',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 3,
                      padding: '1px 4px',
                      background: 'var(--theme-bg)',
                      color: 'var(--theme-editable-text, var(--theme-text))',
                      fontSize: 'inherit',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  formatNumber(val.uren)
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                {groep !== '-' ? (
                  <input
                    type="text"
                    className="tarief-input"
                    defaultValue={val.tarief.toFixed(2)}
                    onBlur={(e) => handleTariefChange(groep, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTariefChange(groep, e.currentTarget.value);
                        e.currentTarget.blur();
                      }
                    }}
                    style={{
                      width: 80,
                      textAlign: 'right',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 3,
                      padding: '1px 4px',
                      background: 'var(--theme-bg)',
                      color: 'var(--theme-editable-text, var(--theme-text))',
                      fontSize: 'inherit',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  formatCurrency(val.tarief)
                )}
              </td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(val.uren * val.tarief)}</td>
            </tr>
          ))}
          <tr className="wpcalc-bottom-total">
            <td>{t('wpcalc.headerTotal')}</td>
            <td style={{ textAlign: 'right' }}>
              <input
                key={`totaal-uren-${totaalUren}`}
                type="text"
                className="uren-input uren-input-total"
                defaultValue={formatNumber(totaalUren)}
                title="Pas het totaal aantal uren aan — alle regels worden naar rato herrekend"
                onBlur={(e) => handleTotaalUrenChange(e.target.value, totaalUren)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTotaalUrenChange(e.currentTarget.value, totaalUren);
                    e.currentTarget.blur();
                  }
                }}
                style={{
                  width: 80,
                  textAlign: 'right',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  background: 'var(--theme-bg)',
                  color: 'var(--theme-editable-text, var(--theme-text))',
                  fontSize: 'inherit',
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                }}
              />
            </td>
            <td></td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(totaalBedrag)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StaartFullScreen() {
  const { t } = useTranslation('common');
  const items = useAppStore((s) => s.items);
  const schedule = useAppStore((s) => s.schedule);
  const updateItem = useAppStore((s) => s.updateItem);

  // Build staart display from staart_* items in the items array
  const { staartRows } = useMemo(() => {
    const staartItems = items.filter(i => i.rowType.startsWith('staart_'));
    const kp = items
      .filter(i => i.parentId === null && !i.rowType.startsWith('staart_'))
      .reduce((s, i) => s + i.total, 0);

    // If we have staart_* items, build rows from them
    if (staartItems.length > 0) {
      const rows: Array<{ id: string; label: string; percentage: number | null; total: number; rowType: string; isBold: boolean }> = [];

      // Totaal kolommen header
      rows.push({ id: '', label: 'Totaal kolommen:', percentage: null, total: kp, rowType: '', isBold: true });

      // Phase 1: over totaal kolommen
      const phase1Types = ['staart_ak_oa', 'staart_abk', 'staart_garanties', 'staart_wvpm'];
      for (const rt of phase1Types) {
        const item = staartItems.find(i => i.rowType === rt);
        if (item) rows.push({ id: item.id, label: item.description, percentage: item.staartPercentage, total: item.total, rowType: rt, isBold: false });
      }

      // Kostprijs subtotaal
      const kostprijsBouw1 = kp + staartItems.filter(i => phase1Types.includes(i.rowType)).reduce((s, i) => s + i.total, 0);
      rows.push({ id: '', label: 'Totaal kostprijs:', percentage: null, total: kostprijsBouw1, rowType: '', isBold: true });

      // Phase 2: over kostprijs
      const phase2Types = ['staart_risico', 'staart_winst', 'staart_verzekering'];
      for (const rt of phase2Types) {
        const item = staartItems.find(i => i.rowType === rt);
        if (item) rows.push({ id: item.id, label: item.description, percentage: item.staartPercentage, total: item.total, rowType: rt, isBold: false });
      }

      // Legacy types (ukk/ak/wr) horen ín de excl.-btw-cascade, niet erachter
      const legacyTypes = ['staart_ukk', 'staart_ak', 'staart_wr'];
      for (const rt of legacyTypes) {
        const item = staartItems.find(i => i.rowType === rt);
        if (item) rows.push({ id: item.id, label: item.description, percentage: item.staartPercentage, total: item.total, rowType: rt, isBold: false });
      }

      // Afronding hoort ín het excl.-blok (vóór het excl.-subtotaal); het
      // bedrag is invulbaar als vaste sluitpost.
      const afrItem = staartItems.find(i => i.rowType === 'staart_afronding');
      if (afrItem) rows.push({ id: afrItem.id, label: afrItem.description || 'Afronding', percentage: null, total: afrItem.total, rowType: 'staart_afronding', isBold: false });

      // Totaal excl. btw = kostprijs + opslagen + afronding. Dit is hét
      // invulbare eindbedrag: typ het gewenste bedrag (excl. btw, incl.
      // opslagen) en de afronding wordt automatisch het verschil.
      const aanneemsomExcl = kostprijsBouw1 + staartItems
        .filter(i => phase2Types.includes(i.rowType) || legacyTypes.includes(i.rowType))
        .reduce((s, i) => s + i.total, 0) + (afrItem?.total ?? 0);
      rows.push({ id: afrItem?.id ?? '', label: 'Totaal excl. btw.:', percentage: null, total: aanneemsomExcl, rowType: 'excl_doel', isBold: true });

      // BTW (over het afgeronde excl-bedrag)
      const btwItem = staartItems.find(i => i.rowType === 'staart_btw');
      if (btwItem) rows.push({ id: btwItem.id, label: btwItem.description, percentage: btwItem.staartPercentage, total: btwItem.total, rowType: 'staart_btw', isBold: false });

      // Eindtotaal incl. btw (alleen tonen als er een btw-regel is)
      if (btwItem) {
        rows.push({ id: '', label: 'Totaalprijs incl. btw.:', percentage: null, total: aanneemsomExcl + btwItem.total, rowType: '', isBold: true });
      }

      return { staartRows: rows, kostprijs: kp, aanneemsom: aanneemsomExcl };
    }

    // Fallback: use schedule.staartRows if available (from WpCalc import)
    if (schedule.staartRows && schedule.staartRows.length > 0) {
      return {
        staartRows: schedule.staartRows.map(r => ({
          id: '', label: r.label, percentage: r.percentage, total: r.totaal ?? 0,
          rowType: '', isBold: [32, 4, 64, 128].includes(r.itemtype),
        })),
        kostprijs: kp, aanneemsom: kp,
      };
    }

    return { staartRows: [{ id: '', label: 'Geen staartkosten ingesteld', percentage: null, total: 0, rowType: '', isBold: false }], kostprijs: kp, aanneemsom: kp };
  }, [items, schedule]);

  const handlePercentageChange = (id: string, value: string) => {
    const num = parseFloat(value.replace(',', '.'));
    if (!isNaN(num) && id) {
      updateItem(id, 'staartPercentage', num);
      updateItem(id, 'quantity', num);
    }
  };

  // Afronding invullen: het getypte bedrag wordt een vaste sluitpost;
  // leegmaken schakelt terug naar automatisch afronden. Ongewijzigde tekst
  // commit niets (anders zou klik-in/klik-uit een automatische afronding
  // stilletjes vastpinnen).
  const handleAfrondingChange = (id: string, value: string, original: string) => {
    if (!id || value.trim() === original.trim()) return;
    if (value.trim() === '') {
      updateItem(id, 'staartVastBedrag', null);
      updateItem(id, 'staartDoelbedrag', null);
      return;
    }
    const num = parseNumericInput(value);
    if (num === null) return;
    updateItem(id, 'staartDoelbedrag', null);
    updateItem(id, 'staartVastBedrag', num);
  };

  // Eindbedrag (excl. btw, incl. opslagen) invullen: pint het doelbedrag op
  // het afronding-item — de afronding wordt automatisch het verschil met de
  // berekende som; de btw rekent daarna over het afgeronde excl-bedrag.
  const handleEindbedragChange = (id: string, value: string, original: string) => {
    if (!id || value.trim() === original.trim()) return;
    if (value.trim() === '') {
      updateItem(id, 'staartVastBedrag', null);
      updateItem(id, 'staartDoelbedrag', null);
      return;
    }
    const num = parseNumericInput(value);
    if (num === null) return;
    updateItem(id, 'staartVastBedrag', null);
    updateItem(id, 'staartDoelbedrag', num);
  };

  return (
    <div className="wpcalc-fullscreen-panel">
      <h3>{t('wpcalc.tailCosts')}</h3>
      <table className="wpcalc-bottom-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>{t('wpcalc.colDescription')}</th>
            <th style={{ textAlign: 'right' }}>%</th>
            <th style={{ textAlign: 'right' }}>{t('wpcalc.colTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {staartRows.map((r, i) => (
            <tr key={i} className={r.isBold ? 'wpcalc-bottom-total' : ''}>
              <td>{r.label}</td>
              <td style={{ textAlign: 'right' }}>
                {r.id && r.percentage != null ? (
                  <input
                    type="text"
                    defaultValue={String(r.percentage)}
                    onBlur={e => handlePercentageChange(r.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { handlePercentageChange(r.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
                    style={{ width: 50, textAlign: 'right', border: '1px solid var(--theme-border)', borderRadius: 3, padding: '1px 4px', background: 'var(--theme-bg)', color: 'var(--theme-editable-text, var(--theme-text))', fontSize: 'inherit', fontFamily: 'inherit' }}
                  />
                ) : (
                  r.percentage != null ? `${r.percentage}%` : ''
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                {r.rowType === 'staart_afronding' && r.id ? (
                  <input
                    key={`afr-${formatNumberForEdit(Math.round(r.total * 100) / 100)}`}
                    type="text"
                    defaultValue={formatNumberForEdit(Math.round(r.total * 100) / 100)}
                    placeholder="auto"
                    title="Afrondingsbedrag invullen (vaste sluitpost); leegmaken = automatisch afronden"
                    onBlur={e => handleAfrondingChange(r.id, e.target.value, formatNumberForEdit(Math.round(r.total * 100) / 100))}
                    onKeyDown={e => { if (e.key === 'Enter') { handleAfrondingChange(r.id, (e.target as HTMLInputElement).value, formatNumberForEdit(Math.round(r.total * 100) / 100)); (e.target as HTMLInputElement).blur(); } }}
                    style={{ width: 80, textAlign: 'right', border: '1px solid var(--theme-border)', borderRadius: 3, padding: '1px 4px', background: 'var(--theme-bg)', color: 'var(--theme-editable-text, var(--theme-text))', fontSize: 'inherit', fontFamily: 'inherit' }}
                  />
                ) : r.rowType === 'excl_doel' && r.id ? (
                  <input
                    key={`eind-${formatNumberForEdit(Math.round(r.total * 100) / 100)}`}
                    type="text"
                    defaultValue={formatNumberForEdit(Math.round(r.total * 100) / 100)}
                    title="Eindbedrag excl. btw (incl. opslagen) invullen: de afronding wordt automatisch het verschil; leegmaken = automatisch afronden"
                    onBlur={e => handleEindbedragChange(r.id, e.target.value, formatNumberForEdit(Math.round(r.total * 100) / 100))}
                    onKeyDown={e => { if (e.key === 'Enter') { handleEindbedragChange(r.id, (e.target as HTMLInputElement).value, formatNumberForEdit(Math.round(r.total * 100) / 100)); (e.target as HTMLInputElement).blur(); } }}
                    style={{ width: 90, textAlign: 'right', fontWeight: 700, border: '1px solid var(--theme-border)', borderRadius: 3, padding: '1px 4px', background: 'var(--theme-bg)', color: 'var(--theme-editable-text, var(--theme-text))', fontSize: 'inherit', fontFamily: 'inherit' }}
                  />
                ) : (
                  r.total !== 0 ? formatCurrency(r.total) : ''
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
