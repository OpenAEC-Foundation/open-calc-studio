import { describe, it, expect } from 'vitest';
import { buildBouw1Html } from '@/services/print/bouw1PrintService';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';

// i18next is niet geïnitialiseerd in de testomgeving → schedule.name is undefined.
// In de echte app heeft de begroting altijd een naam; geef er hier dus één mee
// zodat de report-HTML normaal opbouwt (esc() zou anders op undefined crashen).
function namedSchedule() {
  return { ...createDefaultSchedule(), name: 'Testbegroting', projectName: 'Testproject' };
}

describe('Bouw 1 print-samenvatting', () => {
  it('toont opslag-percentages uit de staart-items (regressie: ABK toonde 0%)', () => {
    // Standaard-begroting: ABK = 6%. Vóór de fix las de samenvatting het legacy
    // staart_ak-veld (0 in het nieuwe 9-item model) → ABK werd 0%. 6% komt in
    // dit model verder nergens voor, dus uniek bewijs dat de ABK-regel de juiste
    // staart-waarde oppikt.
    const html = buildBouw1Html(namedSchedule(), recalculateItems(createDefaultItems()), false);
    expect(html).toContain('Algemene bedrijfskosten');
    expect(html).toContain('6 %');
  });

  it('respecteert door de gebruiker aangepaste staart-percentages', () => {
    // Zet risico op een onderscheidende 7% (default = 3%). Vóór de fix stond in
    // de samenvatting een hardcoded 3%; nu volgt het de staart-items.
    const items = createDefaultItems().map((i) =>
      i.rowType === 'staart_risico' ? { ...i, staartPercentage: 7, quantity: 7 } : i,
    );
    const html = buildBouw1Html(namedSchedule(), recalculateItems(items), false);
    expect(html).toContain('7 %');
  });
});
