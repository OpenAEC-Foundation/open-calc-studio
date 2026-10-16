import { describe, expect, it } from 'vitest';
import { applyGaebX84, importGaeb } from '@/services/importers/gaebImporter';

const x83 = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <PrjInfo><NamePrj>Brug renovatie</NamePrj><Cur>EUR</Cur></PrjInfo>
  <Award><DP>83</DP><BoQ><BoQBody>
    <BoQCtgy RNoPart="01"><LblTx>Betonwerk</LblTx><BoQBody>
      <Itemlist><Item RNoPart="0010"><Qty>12.500</Qty><QU>m3</QU>
        <Description><CompleteText><DetailTxt><Text><p>Beton C30/37 aanbrengen</p></Text></DetailTxt>
          <OutlineText><OutlTxt><TextOutlTxt><p>Beton C30/37</p></TextOutlTxt></OutlTxt></OutlineText>
        </CompleteText></Description>
      </Item></Itemlist>
    </BoQBody></BoQCtgy>
  </BoQBody></BoQ></Award>
</GAEB>`;

describe('GAEB DA XML import', () => {
  it('keeps the chapter, item, quantity, unit and detail text', () => {
    const result = importGaeb(x83);
    expect(result.format).toBe('gaeb');
    expect(result.schedule.projectName).toBe('Brug renovatie');
    expect(result.items.map(i => i.rowType)).toEqual(['chapter', 'begrotingspost']);
    const [chapter, item] = result.items;
    expect(item.parentId).toBe(chapter.id);
    expect(item.code).toBe('01.0010');
    expect(item.quantity).toBe(12.5);
    expect(item.unit).toBe('m³');
    expect(item.description).toBe('Beton C30/37');
    expect(item.notes).toBe('Beton C30/37 aanbrengen');
  });

  it('rejects a price-only X84 instead of inventing item descriptions', () => {
    const x84 = x83.replace('DA83', 'DA84').replace('<DP>83</DP>', '<DP>84</DP>')
      .replace(/<Description>[\s\S]*?<\/Description>/, '<UP>145.50</UP>');
    expect(() => importGaeb(x84)).toThrow(/X84 bevat alleen aanbiedingsprijzen/);
  });

  it('applies an X84 unit price only to the matching X83 item', () => {
    const source = importGaeb(x83);
    const x84 = `<?xml version="1.0"?><GAEB><Award><DP>84</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><BoQBody><Itemlist><Item RNoPart="0010"><UP>145.50</UP><IT>1818.75</IT></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>`;
    const merged = applyGaebX84(x84, source.items);
    expect(merged.pricedCount).toBe(1);
    expect(merged.items[1].description).toBe('Beton C30/37');
    expect(merged.items[1].quantity).toBe(12.5);
    expect(merged.items[1].total).toBe(1818.75);
    expect(source.items[1].materialPrice).toBeNull();
    expect(() => applyGaebX84(x84.replace('0010', '9999'), source.items)).toThrow(/ontbreekt/);
  });
});
