import { describe, it, expect } from 'vitest';
import { importCuf } from '@/services/importers/cufImporter';
import { importTradxml } from '@/services/importers/tradxmlImporter';
import { importRsx } from '@/services/importers/rsxImporter';
import { exportCuf } from '@/services/exporters/cufExporter';
import { exportTradxml } from '@/services/exporters/tradxmlExporter';
import { exportRsx } from '@/services/exporters/rsxExporter';
import { canonicalize } from './helpers/canonicalize';

const CUF_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Calculatie version="4.003">
  <Naam>RT Proj</Naam>
  <Hoofdstuk code="01" omschrijving="Grondwerk">
    <Post code="01.01" omschrijving="Ontgraven">
      <Hoeveelheid>100</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>15,50</Prijs>
    </Post>
    <Post code="01.02" omschrijving="Afvoeren">
      <Hoeveelheid>80</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>8,25</Prijs>
    </Post>
  </Hoofdstuk>
  <Hoofdstuk code="02" omschrijving="Funderingen">
    <Post code="02.01" omschrijving="Beton">
      <Hoeveelheid>25</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>120,00</Prijs>
    </Post>
  </Hoofdstuk>
</Calculatie>`;

describe('Round-trip CUF-XML', () => {
  it('import → export → import is semantically identical', () => {
    const r1 = importCuf(CUF_FIXTURE);
    const exported = exportCuf({ schedule: { name: r1.schedule.name ?? '' } as any, items: r1.items });
    const r2 = importCuf(exported.xml);
    expect(canonicalize(r2.items)).toEqual(canonicalize(r1.items));
  });
});

const TRAD_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Begroting version="7.10">
  <Kop><Projectnaam>RT IBIS</Projectnaam></Kop>
  <Hoofdstuk code="H1" omschrijving="Fundering">
    <Element code="E1" omschrijving="Strokenfundering">
      <Activiteit code="A1" omschrijving="Beton storten">
        <Hoeveelheid>25</Hoeveelheid>
        <Eenheid>m3</Eenheid>
        <Eenheidsprijs>120.00</Eenheidsprijs>
      </Activiteit>
    </Element>
  </Hoofdstuk>
</Begroting>`;

describe('Round-trip TRADXML', () => {
  it('import → export → import is semantically identical', () => {
    const r1 = importTradxml(TRAD_FIXTURE);
    const exported = exportTradxml({ schedule: { name: r1.schedule.name ?? '' } as any, items: r1.items });
    const r2 = importTradxml(exported.xml);
    expect(canonicalize(r2.items)).toEqual(canonicalize(r1.items));
  });
});

const RSX_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<RAWBestand xmlns="http://www.crow.nl/schema/raw/rsx">
  <Bestek><Naam>Dijk RT</Naam></Bestek>
  <Deelraming code="01" omschrijving="Voorbereiding">
    <Resultaatsverplichting besteksnummer="01.01.01">
      <Omschrijving>Opruim</Omschrijving>
      <Hoeveelheid>1</Hoeveelheid>
      <Eenheid>st</Eenheid>
      <Prijs>500</Prijs>
    </Resultaatsverplichting>
  </Deelraming>
</RAWBestand>`;

describe('Round-trip RSX', () => {
  it('import → export → import is semantically identical', () => {
    const r1 = importRsx(RSX_FIXTURE);
    const exported = exportRsx({ schedule: { name: r1.schedule.name ?? '' } as any, items: r1.items });
    const r2 = importRsx(exported.xml);
    expect(canonicalize(r2.items)).toEqual(canonicalize(r1.items));
  });
});
