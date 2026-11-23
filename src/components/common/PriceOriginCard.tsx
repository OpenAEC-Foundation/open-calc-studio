import type { CostItem } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { formatCurrency, getNumberLocale } from '@/utils/formatting';
import { useAppStore } from '@/state/appStore';
import { isPriceOriginLibraryMissing } from '@/services/pricing/priceLibraries';
import { getOwnLibrary } from '@/services/pricing/ownLibraries';
import './QuantityOriginCard.css';
// 0 als "0,00"/"0.00" in de notatie van de app-taal; de prijs houdt zijn eigen valuta.
const zero = () => new Intl.NumberFormat(`${getNumberLocale()}-u-nu-latn`, { minimumFractionDigits: 2 }).format(0);
export function PriceOriginCard({ item }: { item: CostItem }) {
  const origin = item.priceOrigin;
  // Issue #104: the library of this price is switched off or not on this computer.
  const missing = useAppStore(s => !!origin && isPriceOriginLibraryMissing(origin, s.resourceLibrary));
  if (!origin) return null;
  return <section className="quantity-origin-card" aria-label={uiText('pricing.origin', 'Price source')}>
    <h3>{uiText('pricing.origin', 'Price source')}</h3>
    <dl><dt>{uiText('pricing.catalogueLabel', 'Catalogue')}</dt><dd>{origin.catalogueId} · {origin.catalogueVersion}</dd>
      <dt>{uiText('pricing.source', 'Source:')}</dt><dd>{origin.source || '—'}</dd>
      <dt>{uiText('pricing.date', 'Price date')}</dt><dd>{origin.priceDate || '—'}</dd>
      <dt>{uiText('pricing.applied', 'Applied source price')}</dt><dd>{origin.price === 0 ? zero() : formatCurrency(origin.price)} {origin.currency}/{origin.unit}</dd></dl>
    {missing && <p role="status" className="price-origin-missing">{uiText('pricing.libraryNotLoaded', 'The library “{{name}}” is not loaded in this estimate. The row keeps its price; switch the library on to review price updates.', { name: getOwnLibrary(origin.catalogueId)?.name ?? origin.catalogueId })}</p>}
    {(origin.locked || item.normUnitPrice !== origin.price) && <p>{uiText('pricing.status.override', 'Project override preserved')}</p>}
  </section>;
}
