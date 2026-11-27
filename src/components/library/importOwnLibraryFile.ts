// Read a price-list file, ask for its columns when it is a table, and keep it
// as an own price library (#104). One path for the library dialog and
// Backstage → Import → Price library.
import { prepareOwnLibrary, readOwnLibraryTable, type PreparedOwnLibrary } from '@/services/pricing/ownLibraryImport';
import { rememberLibraryMapping } from '@/services/pricing/libraryColumnMappings';
import { installOwnLibrary } from '@/services/pricing/installOwnLibrary';
import { askLibraryColumnMapping } from './askLibraryColumnMapping';

/**
 * Import `file` as an own library, or as a new version of `updateId`.
 * Returns the imported library, or null when the user cancelled. Throws when
 * the file cannot be read as a price library.
 */
export async function importOwnLibraryFile(file: File, { updateId }: { updateId?: string } = {}): Promise<PreparedOwnLibrary | null> {
  // Excel is binary; a BC3 file declares its own character set (often not
  // UTF-8), also when it has another or no extension and is recognised by
  // its content. Only the text formats are read as UTF-8 here.
  const binary = !/\.(json|csv|tsv|txt|xml|bmecat|zsx)$/i.test(file.name);
  const content = binary ? new Uint8Array(await file.arrayBuffer()) : await file.text();
  const table = readOwnLibraryTable(file.name, content);
  const columnMapping = table ? await askLibraryColumnMapping(table) : undefined;
  if (columnMapping === null) return null;
  const prepared = prepareOwnLibrary(file.name, content, { updateId, columnMapping });
  if (!await installOwnLibrary(prepared, { askReplace: updateId === undefined })) return null;
  if (table && columnMapping) rememberLibraryMapping(table.headers, columnMapping);
  return prepared;
}
