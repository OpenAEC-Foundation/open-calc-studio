import { describe, expect, it } from 'vitest';
import { importBmecat } from '@/services/importers/bmecatImporter';

/** Eén artikel met een ORDER_UNIT en optioneel PRICE_QUANTITY. */
function article(code: string, unit: string, price: string, priceQuantity?: string): string {
  return `<ARTICLE><SUPPLIER_AID>${code}</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Artikel ${code}</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>${unit}</ORDER_UNIT>${priceQuantity ? `<PRICE_QUANTITY>${priceQuantity}</PRICE_QUANTITY>` : ''}</ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS><ARTICLE_PRICE><PRICE_AMOUNT>${price}</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS>
    </ARTICLE>`;
}

const catalog = (...articles: string[]): string =>
  `<?xml version="1.0"?><BMECAT><T_NEW_CATALOG>${articles.join('')}</T_NEW_CATALOG></BMECAT>`;

describe('BMEcat-eenheden en prijshoeveelheid (knownbugs 71, 72)', () => {
  it('vertaalt UN/ECE Rec 20-codes naar de eigen eenheden (71)', () => {
    const r = importBmecat(catalog(
      article('A', 'MTR', '1'), article('B', 'MTK', '1'), article('C', 'MTQ', '1'),
      article('D', 'KGM', '1'), article('E', 'TNE', '1'), article('F', 'C62', '1'),
      article('G', 'PCE', '1'), article('H', 'HUR', '1'),
    ));
    const units = Object.fromEntries(r.resources.map((x) => [x.code, x.unit]));
    expect(units).toEqual({ A: 'm', B: 'm²', C: 'm³', D: 'kg', E: 'ton', F: 'st', G: 'st', H: 'uur' });
    expect(r.warnings).toEqual([]);
  });

  it('neemt een onbekende eenheid ongewijzigd over en meldt dat (71)', () => {
    const r = importBmecat(catalog(article('L', 'LTR', '3.20'), article('M', 'MTR', '1')));
    expect(r.resources.find((x) => x.code === 'L')?.unit).toBe('LTR');
    expect(r.warnings.some((w) => w.includes('LTR'))).toBe(true);
  });

  it('deelt de prijs door PRICE_QUANTITY (72)', () => {
    const r = importBmecat(catalog(article('P', 'MTR', '145.00', '100'), article('Q', 'MTR', '4.75')));
    expect(r.resources.find((x) => x.code === 'P')?.defaultUnitPrice).toBeCloseTo(1.45);
    expect(r.resources.find((x) => x.code === 'Q')?.defaultUnitPrice).toBeCloseTo(4.75);
  });

  it('negeert een PRICE_QUANTITY van 0 (72)', () => {
    const r = importBmecat(catalog(article('Z', 'MTR', '12.00', '0')));
    expect(r.resources[0].defaultUnitPrice).toBeCloseTo(12);
  });
});
