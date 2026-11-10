import type { CostItem } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { formatCurrency, getNumberLocale } from '@/utils/formatting';
// 0 als "0,00"/"0.00" in de notatie van de app-taal; de prijs houdt zijn eigen valuta.
const zero = () => new Intl.NumberFormat(`${getNumberLocale()}-u-nu-latn`, { minimumFractionDigits: 2 }).format(0);
export function PriceOriginCard({ item }: { item: CostItem }) {
  const origin = item.priceOrigin;
  if (!origin) return null;
  return <section className="quantity-origin-card" aria-label={uiText('pricing.origin', 'Price source')}>
    <h3>{uiText('pricing.origin', 'Price source')}</h3>
    <dl><dt>{uiText('pricing.catalogueLabel', 'Catalogue')}</dt><dd>{origin.catalogueId} · {origin.catalogueVersion}</dd>
      <dt>{uiText('pricing.source', 'Source:')}</dt><dd>{origin.source || '—'}</dd>
      <dt>{uiText('pricing.date', 'Price date')}</dt><dd>{origin.priceDate || '—'}</dd>
      <dt>{uiText('pricing.applied', 'Applied source price')}</dt><dd>{origin.price === 0 ? zero() : formatCurrency(origin.price)} {origin.currency}/{origin.unit}</dd></dl>
    {(origin.locked || item.normUnitPrice !== origin.price) && <p>{uiText('pricing.status.override', 'Project override preserved')}</p>}
  </section>;
}
