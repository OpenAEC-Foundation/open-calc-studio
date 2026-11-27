import { describe, expect, it } from 'vitest';
import { importGaeb } from '@/services/importers/gaebImporter';

/** X83 met één positie per opgegeven eenheid en een langtekst. */
function x83(units: string[], detail = '<p>Beton</p>'): string {
  const items = units.map((u, i) => `<Item RNoPart="${String(i + 1).padStart(4, '0')}"><Qty>1</Qty><QU>${u}</QU>
      <Description><CompleteText><DetailTxt><Text>${detail}</Text></DetailTxt>
        <OutlineText><OutlTxt><TextOutlTxt><p>Pos ${i + 1}</p></TextOutlTxt></OutlTxt></OutlineText>
      </CompleteText></Description></Item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB><Award><DP>83</DP><BoQ><BoQBody>
  <BoQCtgy RNoPart="01"><LblTx>Rohbau</LblTx><BoQBody><Itemlist>${items}</Itemlist></BoQBody></BoQCtgy>
</BoQBody></BoQ></Award></GAEB>`;
}

describe('GAEB-langtekst en eenheden (knownbugs 73, 74)', () => {
  it('houdt alinea’s en regeleinden in de langtekst gescheiden (73)', () => {
    const r = importGaeb(x83(['m3'], '<p>Zeile eins</p><p>Zeile zwei</p><p>Erste<br/>Zweite</p>'));
    const post = r.items.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.notes).toBe('Zeile eins\nZeile zwei\nErste\nZweite');
  });

  it('kent de gangbare Duitse eenheden (74)', () => {
    const r = importGaeb(x83(['lfm', 'Tag', 'Wo', 'qm', 'cbm', 'psch', 'Stck', 'h', 't']));
    const units = r.items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.unit);
    expect(units).toEqual(['m', 'dgn', 'week', 'm²', 'm³', 'post', 'st', 'uur', 'ton']);
    expect(r.warnings.join('\n')).not.toMatch(/kept unchanged/);
  });

  it('neemt een onbekende eenheid ongewijzigd over en meldt dat (74)', () => {
    const r = importGaeb(x83(['l', 'kWh', 'm']));
    const units = r.items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.unit);
    expect(units).toEqual(['l', 'kWh', 'm']);
    expect(r.warnings.some((w) => w.includes('l, kWh'))).toBe(true);
  });
});
