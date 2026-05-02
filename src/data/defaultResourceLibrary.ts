import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';

let _id = 0;
function rid(): string {
  return `res-${++_id}`;
}

function res(
  code: string, desc: string, unit: ResourceLibraryItem['unit'],
  resourceType: ResourceType, price: number | null, category: string,
): ResourceLibraryItem {
  return { id: rid(), code, description: desc, unit, resourceType, defaultUnitPrice: price, category };
}

export function createDefaultResourceLibrary(): ResourceLibraryItem[] {
  _id = 0;
  return [
    // ── Arbeid ──
    res('A.001', 'Timmerman', 'uur', 'arbeid', 52.00, 'Arbeid'),
    res('A.002', 'Metselaar', 'uur', 'arbeid', 50.00, 'Arbeid'),
    res('A.003', 'Stratenmaker', 'uur', 'arbeid', 48.00, 'Arbeid'),
    res('A.004', 'Loodgieter', 'uur', 'arbeid', 55.00, 'Arbeid'),
    res('A.005', 'Elektricien', 'uur', 'arbeid', 54.00, 'Arbeid'),
    res('A.006', 'Schilder', 'uur', 'arbeid', 46.00, 'Arbeid'),
    res('A.007', 'Stukadoor', 'uur', 'arbeid', 48.00, 'Arbeid'),
    res('A.008', 'Tegelzetter', 'uur', 'arbeid', 50.00, 'Arbeid'),
    res('A.009', 'Grondwerker', 'uur', 'arbeid', 44.00, 'Arbeid'),
    res('A.010', 'Betonvlechter', 'uur', 'arbeid', 48.00, 'Arbeid'),
    res('A.011', 'Kraanmachinist', 'uur', 'arbeid', 58.00, 'Arbeid'),
    res('A.012', 'Opperman', 'uur', 'arbeid', 38.00, 'Arbeid'),
    res('A.013', 'Voorman', 'uur', 'arbeid', 60.00, 'Arbeid'),
    res('A.014', 'Uitvoerder', 'uur', 'arbeid', 72.00, 'Arbeid'),

    // ── Materieel ──
    res('M.001', 'Mobiele kraan 25 ton', 'uur', 'materieel', 125.00, 'Materieel'),
    res('M.002', 'Minigraver 3 ton', 'uur', 'materieel', 45.00, 'Materieel'),
    res('M.003', 'Graafmachine 14 ton', 'uur', 'materieel', 85.00, 'Materieel'),
    res('M.004', 'Trilplaat 150 kg', 'dgn', 'materieel', 35.00, 'Materieel'),
    res('M.005', 'Betonpomp (vrachtwagen)', 'uur', 'materieel', 165.00, 'Materieel'),
    res('M.006', 'Hijskraan torenkraan', 'dgn', 'materieel', 450.00, 'Materieel'),
    res('M.007', 'Hoogwerker 12m', 'dgn', 'materieel', 185.00, 'Materieel'),
    res('M.008', 'Steigermateriaal', 'm²', 'materieel', 8.50, 'Materieel'),
    res('M.009', 'Dumper 3 ton', 'uur', 'materieel', 38.00, 'Materieel'),
    res('M.010', 'Aggregaat 30 kVA', 'dgn', 'materieel', 65.00, 'Materieel'),
    res('M.011', 'Bekisting (systeem)', 'm²', 'materieel', 12.50, 'Materieel'),
    res('M.012', 'Wals handgeleid', 'dgn', 'materieel', 55.00, 'Materieel'),

    // ── Materiaal — Beton & Metselwerk ──
    res('B.001', 'Beton C20/25 (gestort)', 'm³', 'materiaal', 95.00, 'Beton & Metselwerk'),
    res('B.002', 'Beton C30/37 (gestort)', 'm³', 'materiaal', 110.00, 'Beton & Metselwerk'),
    res('B.003', 'Wapeningsstaal B500B', 'kg', 'materiaal', 1.20, 'Beton & Metselwerk'),
    res('B.004', 'Waalformaat baksteen', 'st', 'materiaal', 0.35, 'Beton & Metselwerk'),
    res('B.005', 'Kalkzandsteen 150mm', 'm²', 'materiaal', 22.00, 'Beton & Metselwerk'),
    res('B.006', 'Cellenbeton 100mm', 'm²', 'materiaal', 16.00, 'Beton & Metselwerk'),
    res('B.007', 'Metselmortel', 'kg', 'materiaal', 0.12, 'Beton & Metselwerk'),
    res('B.008', 'Kanaalplaatvloer 200mm', 'm²', 'materiaal', 55.00, 'Beton & Metselwerk'),
    res('B.009', 'Spouwankers RVS', 'st', 'materiaal', 0.85, 'Beton & Metselwerk'),
    res('B.010', 'Prefab heipaal 250x250', 'm', 'materiaal', 42.00, 'Beton & Metselwerk'),

    // ── Materiaal — Isolatie ──
    res('I.001', 'PIR isolatie 100mm (spouw)', 'm²', 'materiaal', 18.50, 'Isolatie'),
    res('I.002', 'PIR isolatie 120mm (dak)', 'm²', 'materiaal', 24.00, 'Isolatie'),
    res('I.003', 'Minerale wol 150mm', 'm²', 'materiaal', 12.00, 'Isolatie'),
    res('I.004', 'EPS isolatie 100mm (vloer)', 'm²', 'materiaal', 9.50, 'Isolatie'),
    res('I.005', 'Damprem folie', 'm²', 'materiaal', 2.50, 'Isolatie'),
    res('I.006', 'Onderdak folie', 'm²', 'materiaal', 3.50, 'Isolatie'),

    // ── Materiaal — Hout & Dakwerk ──
    res('H.001', 'Constructiehout C24 (dakspant)', 'm³', 'materiaal', 550.00, 'Hout & Dakwerk'),
    res('H.002', 'Multiplex 18mm (dakbeschot)', 'm²', 'materiaal', 14.00, 'Hout & Dakwerk'),
    res('H.003', 'Dakpannen keramisch', 'm²', 'materiaal', 28.00, 'Hout & Dakwerk'),
    res('H.004', 'Dakpannen beton', 'm²', 'materiaal', 18.00, 'Hout & Dakwerk'),
    res('H.005', 'Dakgoot zink (mastgoot)', 'm', 'materiaal', 35.00, 'Hout & Dakwerk'),
    res('H.006', 'HWA zink 80mm', 'm', 'materiaal', 22.00, 'Hout & Dakwerk'),
    res('H.007', 'EPDM dakbedekking', 'm²', 'materiaal', 18.00, 'Hout & Dakwerk'),

    // ── Materiaal — Kozijnen ──
    res('K.001', 'Kozijn kunststof (standaard)', 'st', 'materiaal', 380.00, 'Kozijnen & Beglazing'),
    res('K.002', 'Kozijn hardhouten', 'st', 'materiaal', 520.00, 'Kozijnen & Beglazing'),
    res('K.003', 'HR++ glas', 'm²', 'materiaal', 85.00, 'Kozijnen & Beglazing'),
    res('K.004', 'Triple glas', 'm²', 'materiaal', 125.00, 'Kozijnen & Beglazing'),
    res('K.005', 'Voordeur compleet', 'st', 'materiaal', 1250.00, 'Kozijnen & Beglazing'),
    res('K.006', 'Achterdeur compleet', 'st', 'materiaal', 850.00, 'Kozijnen & Beglazing'),
    res('K.007', 'Binnendeur stomp', 'st', 'materiaal', 145.00, 'Kozijnen & Beglazing'),

    // ── Materiaal — Installaties ──
    res('E.001', 'Groepenkast 12 groepen', 'st', 'materiaal', 450.00, 'Elektra'),
    res('E.002', 'Wandcontactdoos', 'st', 'materiaal', 12.00, 'Elektra'),
    res('E.003', 'Lichtpunt + bekabeling', 'st', 'materiaal', 8.00, 'Elektra'),
    res('E.004', 'Schakelmateriaal', 'st', 'materiaal', 15.00, 'Elektra'),
    res('L.001', 'Waterleiding koper 15mm', 'm', 'materiaal', 18.00, 'Loodgieter'),
    res('L.002', 'PVC riolering 110mm', 'm', 'materiaal', 12.00, 'Loodgieter'),
    res('L.003', 'Toilet compleet', 'st', 'materiaal', 450.00, 'Sanitair'),
    res('L.004', 'Wastafel compleet', 'st', 'materiaal', 350.00, 'Sanitair'),
    res('L.005', 'Ligbad acryl', 'st', 'materiaal', 650.00, 'Sanitair'),
    res('L.006', 'Douchebak + kraan', 'st', 'materiaal', 550.00, 'Sanitair'),
    res('V.001', 'Warmtepomp lucht-water', 'st', 'materiaal', 6500.00, 'Verwarming'),
    res('V.002', 'Vloerverwarming pakket', 'm²', 'materiaal', 32.00, 'Verwarming'),
    res('V.003', 'Radiator badkamer', 'st', 'materiaal', 180.00, 'Verwarming'),
    res('V.004', 'CV-ketel HR107', 'st', 'materiaal', 1800.00, 'Verwarming'),

    // ── Materiaal — Afwerking ──
    res('AF.001', 'Stucmortel (gips)', 'kg', 'materiaal', 0.45, 'Afwerking'),
    res('AF.002', 'Wandtegels', 'm²', 'materiaal', 28.00, 'Afwerking'),
    res('AF.003', 'Vloertegels', 'm²', 'materiaal', 32.00, 'Afwerking'),
    res('AF.004', 'Laminaat', 'm²', 'materiaal', 22.00, 'Afwerking'),
    res('AF.005', 'Verf (latex binnen)', 'ls', 'materiaal', 8.50, 'Afwerking'),
    res('AF.006', 'Verf (buiten)', 'ls', 'materiaal', 14.00, 'Afwerking'),
    res('AF.007', 'Behang vliesbehang', 'm²', 'materiaal', 6.50, 'Afwerking'),
    res('AF.008', 'Plinten MDF', 'm', 'materiaal', 3.50, 'Afwerking'),

    // ── Materiaal — Bestrating ──
    res('T.001', 'Betonklinkers (waal)', 'm²', 'materiaal', 12.00, 'Terrein'),
    res('T.002', 'Betontegels 30x30', 'm²', 'materiaal', 14.00, 'Terrein'),
    res('T.003', 'Sierbestrating (gebakken)', 'm²', 'materiaal', 28.00, 'Terrein'),
    res('T.004', 'Straatzand', 'm³', 'materiaal', 18.00, 'Terrein'),
    res('T.005', 'Trottoirband', 'm', 'materiaal', 8.50, 'Terrein'),
    res('T.006', 'Schuttinghout (tuin)', 'm', 'materiaal', 45.00, 'Terrein'),

    // ── Materiaal — Grondwerk ──
    res('G.001', 'Zand (ophoogzand)', 'm³', 'materiaal', 12.00, 'Grondwerk'),
    res('G.002', 'Grind (drainage)', 'm³', 'materiaal', 28.00, 'Grondwerk'),
    res('G.003', 'Afvoer grond (schoon)', 'm³', 'materiaal', 22.00, 'Grondwerk'),
    res('G.004', 'Geotextiel', 'm²', 'materiaal', 1.50, 'Grondwerk'),

    // ── Onderaannemer ──
    res('OA.001', 'Heiwerkzaamheden (compleet)', 'm', 'onderaannemer', 77.00, 'Onderaannemer'),
    res('OA.002', 'Metselwerk (compleet)', 'm²', 'onderaannemer', 80.00, 'Onderaannemer'),
    res('OA.003', 'Stucwerk (compleet)', 'm²', 'onderaannemer', 18.50, 'Onderaannemer'),
    res('OA.004', 'Schilderwerk (compleet)', 'm²', 'onderaannemer', 15.50, 'Onderaannemer'),
    res('OA.005', 'Tegelwerk (compleet)', 'm²', 'onderaannemer', 74.00, 'Onderaannemer'),
    res('OA.006', 'Elektra-installatie (compleet)', 'post', 'onderaannemer', null, 'Onderaannemer'),
    res('OA.007', 'Loodgieterwerk (compleet)', 'post', 'onderaannemer', null, 'Onderaannemer'),
    res('OA.008', 'CV-installatie (compleet)', 'post', 'onderaannemer', null, 'Onderaannemer'),
    res('OA.009', 'Keukenplaatsing (compleet)', 'post', 'onderaannemer', null, 'Onderaannemer'),
    res('OA.010', 'Dakdekker (compleet)', 'm²', 'onderaannemer', 50.00, 'Onderaannemer'),
  ];
}
