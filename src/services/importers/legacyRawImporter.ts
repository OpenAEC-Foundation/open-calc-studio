import { importRsx } from './rsxImporter';
import type { ImportResult } from './types';

/**
 * Legacy RAW-importer (RSU — RAW 2005 en ouder), voorloper van RSX.
 *
 * Digitale RSU-bestanden zijn tegenwoordig vaak al de XML-vorm of geconverteerd;
 * die delegeren we naar de (dialect-tolerante) RSX-importer. Het échte oude,
 * niet-XML RSU-recordformaat is niet publiek gespecificeerd — daarvoor geven we
 * een duidelijke melding i.p.v. een cryptische parse-fout, met het verzoek een
 * voorbeeldbestand aan te leveren of eerst naar RSX te converteren.
 */
function looksLikeXml(text: string): boolean {
  return text.replace(/^﻿/, '').trimStart().startsWith('<');
}

export function importRsu(text: string): ImportResult {
  if (looksLikeXml(text)) {
    const r = importRsx(text);
    return {
      ...r,
      format: 'rsu',
      warnings: [...r.warnings, 'RSU ingelezen via de RSX/RAW-XML-route.'],
    };
  }
  return {
    schedule: { name: 'RSU-import' },
    items: [],
    warnings: [
      'Dit lijkt het oudere, niet-XML RSU-formaat (RAW 2005 of ouder); dat recordformaat is niet publiek gespecificeerd.',
      'Lever een voorbeeld-RSU aan (map verification-files) voor exacte ondersteuning, of converteer het bestand eerst naar RSX (XML).',
    ],
    format: 'rsu',
  };
}
