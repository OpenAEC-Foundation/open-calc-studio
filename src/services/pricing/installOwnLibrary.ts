// Keep a prepared own price library on this computer and switch it on for the
// open estimate (#104). One path for the library dialog, Backstage BMEcat/ZSX
// and the estimate import's "Import as price library instead".
import { uiText } from '@/i18n/uiText';
import { activateOwnLibrary } from './choosePriceCountry';
import { saveOwnLibrary } from './ownLibraries';
import type { PreparedOwnLibrary } from './ownLibraryImport';

const listCodes = (codes: string[]) => codes.slice(0, 10).join(', ') + (codes.length > 10 ? ', …' : '');

/**
 * Save and activate. Asks before replacing an own library with the same ID,
 * unless the user chose "New version…" (`askReplace: false`). Returns false
 * when the user kept the old one.
 */
export async function installOwnLibrary(prepared: PreparedOwnLibrary, { askReplace = true }: { askReplace?: boolean } = {}): Promise<boolean> {
  if (askReplace && prepared.replaces
    && !window.confirm(uiText('pricing.ownReplace', 'There is already an own library “{{name}}” on this computer. Replace it with this file? Price links in estimates stay valid.', { name: prepared.replaces.name }))) return false;
  await saveOwnLibrary(prepared.library);
  activateOwnLibrary(prepared.library.id);
  return true;
}

/**
 * What to tell the user after an import: count, repeated codes, codes no
 * longer in a new version, and what the file reader warned about (for
 * example a BC3 file without currency, #127).
 */
export function ownLibraryImportedMessage(prepared: PreparedOwnLibrary): string {
  const parts = [uiText('pricing.ownImported', '“{{name}}” imported: {{count}} resources. It is kept on this computer.', { name: prepared.library.name, count: prepared.library.count })];
  if (prepared.duplicates.length > 0) {
    parts.push(uiText('pricing.ownDuplicates', 'Codes that appear more than once got a suffix (~2, ~3) ({{count}}): {{codes}}.', { count: prepared.duplicates.length, codes: listCodes(prepared.duplicates) }));
  }
  if (prepared.dropped.length > 0) {
    parts.push(uiText('pricing.ownDropped', 'No longer in the new version ({{count}}): {{codes}}. Rows that use them keep their price.', { count: prepared.dropped.length, codes: listCodes(prepared.dropped) }));
  }
  // Each warning as its own sentence, also when the text has no full stop.
  parts.push(...prepared.warnings.map(w => /[.!?。！？]$/.test(w.trim()) ? w : `${w}.`));
  return parts.join(' ');
}
