import { uiText } from '../../i18n/uiText';
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
      warnings: [...r.warnings, uiText('diagnostics.xml.rsuXml', "RSU was read using the RSX/RAW XML reader.")],
    };
  }
  return {
    schedule: { name: 'RSU-import' },
    items: [],
    warnings: [
      uiText('diagnostics.xml.rsuLegacy', "This appears to be the older non-XML RSU format (RAW 2005 or earlier); its record format is not publicly specified."),
      uiText('diagnostics.xml.rsuExample', "Provide a sample RSU in verification-files for exact support, or convert the file to RSX XML first."),
    ],
    format: 'rsu',
  };
}
