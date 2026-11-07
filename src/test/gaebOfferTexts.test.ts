import { afterAll, describe, expect, it } from 'vitest';
import { changeLanguage } from '@/i18n/config';
import { uiText } from '@/i18n/uiText';

// De melding na een GAEB-aanbieding stond als vaste Nederlandse tekst in de
// code, ook als de app op Engels of Duits stond.
describe('GAEB-aanbieding: teksten volgen de taal van de app', () => {
  const applied = () => uiText('import.offerApplied', '{{count}} GAEB bid prices applied.', { count: 5 });
  const fileType = () => uiText('import.offerFileType', 'GAEB X84 bid');

  afterAll(() => changeLanguage('en'));

  it.each([
    ['en', '5 GAEB bid prices applied.', 'GAEB X84 bid'],
    ['nl', '5 GAEB-aanbiedingsprijzen overgenomen.', 'GAEB X84-aanbieding'],
    ['de', '5 GAEB-Angebotspreise übernommen.', 'GAEB-X84-Angebot'],
  ])('%s', async (lang, message, type) => {
    await changeLanguage(lang);
    expect(applied()).toBe(message);
    expect(fileType()).toBe(type);
  }, 15000); // taal wisselen laadt de taalbestanden; traag onder belasting

  it('gebruikt in andere talen de eigen vertaling, niet het Nederlands', async () => {
    await changeLanguage('fr');
    expect(applied()).toBe('5 prix de soumission GAEB appliqués.');
    expect(applied()).not.toContain('overgenomen');
  }, 15000);
});
