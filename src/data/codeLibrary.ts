/**
 * Ingebouwde coderingsbibliotheek voor het Nr.-veld: STABU (werksoorten) en
 * NL-SfB (elementenmethode). De gebruiker kan via de codelibrary-slice eigen
 * coderingen toevoegen; die worden samengevoegd met deze basislijst.
 *
 * Dit is een nette basisset op hoofdstuk-/elementniveau — bewust niet de
 * volledige catalogus. Uitbreidbaar door regels aan de arrays toe te voegen.
 */
export type CodeScheme = 'stabu' | 'nlsfb';

export interface CodeEntry {
  /** de code zelf, bv. "21" (STABU) of "22.1" (NL-SfB) */
  code: string;
  /** leesbare omschrijving */
  description: string;
  scheme: CodeScheme;
}

/** STABU-2 werksoorten (hoofdstukken). */
export const STABU_CODES: CodeEntry[] = [
  ['05', 'Bouwplaatsvoorzieningen'],
  ['10', 'Stut- en sloopwerk'],
  ['14', 'Funderingspalen en damwanden'],
  ['15', 'Drainage- en rioleringswerk'],
  ['16', 'Terreinverharding'],
  ['17', 'Grondwerk'],
  ['20', 'Funderingsconstructies'],
  ['21', 'Betonwerk'],
  ['22', 'Metselwerk'],
  ['23', 'Vooraf vervaardigde steenachtige elementen'],
  ['24', 'Ruwbouwtimmerwerk'],
  ['25', 'Metaalconstructiewerk'],
  ['26', 'Bouwkundige kanalen'],
  ['28', 'Dakbedekkingen (metaal)'],
  ['30', 'Kozijnen, ramen en deuren'],
  ['31', 'Systeembekledingen'],
  ['32', 'Trappen en balustraden'],
  ['33', 'Dakbedekkingen'],
  ['34', 'Beglazing'],
  ['35', 'Natuur- en kunststeen'],
  ['36', 'Voegvulling'],
  ['40', 'Stukadoorwerk'],
  ['41', 'Tegelwerk'],
  ['42', 'Dekvloeren en vloersystemen'],
  ['43', 'Metaal- en kunststofwerk'],
  ['44', 'Plafond- en wandsystemen'],
  ['45', 'Afbouwtimmerwerk'],
  ['46', 'Schilderwerk'],
  ['47', 'Binneninrichting'],
  ['48', 'Vloer- en trapafwerkingen'],
  ['50', 'Dakgoten en hemelwaterafvoeren'],
  ['51', 'Binnenriolering'],
  ['52', 'Waterinstallaties'],
  ['53', 'Sanitair'],
  ['55', 'Brandbestrijdingsinstallaties'],
  ['56', 'Gasinstallaties'],
  ['57', 'Verwarmingsinstallaties'],
  ['58', 'Ventilatie- en luchtbehandeling'],
  ['60', 'Koelinstallaties'],
  ['70', 'Elektrotechnische installaties'],
  ['71', 'Verlichtingsinstallaties'],
  ['73', 'Communicatie- en beveiliging'],
  ['80', 'Liften en roltrappen'],
  ['90', 'Terreinvoorzieningen'],
].map(([code, description]) => ({ code, description, scheme: 'stabu' as const }));

/** NL-SfB elementenmethode (hoofdgroepen + veelgebruikte elementen). */
export const NLSFB_CODES: CodeEntry[] = [
  ['11', 'Bodemvoorzieningen'],
  ['13', 'Vloeren op grondslag'],
  ['16', 'Funderingsconstructies'],
  ['17', 'Paalfunderingen'],
  ['21', 'Buitenwanden'],
  ['22', 'Binnenwanden'],
  ['23', 'Vloeren'],
  ['24', 'Trappen en hellingen'],
  ['27', 'Daken'],
  ['28', 'Hoofddraagconstructies'],
  ['31', 'Buitenwandopeningen'],
  ['32', 'Binnenwandopeningen'],
  ['33', 'Vloeropeningen'],
  ['34', 'Balustrades en leuningen'],
  ['37', 'Dakopeningen'],
  ['38', 'Inbouwpakketten'],
  ['41', 'Buitenwandafwerkingen'],
  ['42', 'Binnenwandafwerkingen'],
  ['43', 'Vloerafwerkingen'],
  ['44', 'Trap- en hellingafwerkingen'],
  ['45', 'Plafondafwerkingen'],
  ['47', 'Dakafwerkingen'],
  ['48', 'Afwerkingen overig'],
  ['51', 'Warmteopwekking'],
  ['52', 'Afvoeren'],
  ['53', 'Water'],
  ['54', 'Gassen'],
  ['55', 'Koudeopwekking en -distributie'],
  ['56', 'Warmtedistributie'],
  ['57', 'Luchtbehandeling'],
  ['61', 'Centrale elektrotechnische voorzieningen'],
  ['62', 'Krachtstroom'],
  ['63', 'Verlichting'],
  ['64', 'Communicatie'],
  ['65', 'Beveiliging'],
  ['66', 'Transport'],
  ['71', 'Vaste verkeersvoorzieningen'],
  ['73', 'Vaste keukenvoorzieningen'],
  ['74', 'Vaste sanitaire voorzieningen'],
  ['84', 'Losse gebruikersinventaris'],
  ['90', 'Terrein'],
].map(([code, description]) => ({ code, description, scheme: 'nlsfb' as const }));

/** De ingebouwde basislijst (STABU + NL-SfB). */
export const BUILTIN_CODES: CodeEntry[] = [...STABU_CODES, ...NLSFB_CODES];
