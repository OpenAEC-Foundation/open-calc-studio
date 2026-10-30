import * as XLSX from 'xlsx';

export const WORKBOOK_LIMITS = { bytes: 64 * 1024 * 1024, expandedBytes: 256 * 1024 * 1024, rows: 100_000, columns: 1024, cells: 2_000_000, archiveEntries: 10_000 } as const;

/** Inspect the ZIP directory before the spreadsheet parser can decompress it. */
export function checkWorkbookBytes(data: Uint8Array): void {
  if (data.byteLength > WORKBOOK_LIMITS.bytes) throw Error('Spreadsheet exceeds 64 MiB.');
  if (data[0] !== 0x50 || data[1] !== 0x4b) return; // Legacy OLE XLS or text.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === data.length) { end = i; break; }
  }
  if (end < 0) throw Error('Invalid spreadsheet ZIP directory.');
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
  if (count > WORKBOOK_LIMITS.archiveEntries || start === 0xffffffff || size === 0xffffffff || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw Error('Unsupported oversized, ZIP64 or split spreadsheet archive.');
  if (start + size > end) throw Error('Invalid spreadsheet ZIP bounds.');
  let at = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > start + size || view.getUint32(at, true) !== 0x02014b50) throw Error('Invalid spreadsheet ZIP entry.');
    const packed = view.getUint32(at + 20, true), unpacked = view.getUint32(at + 24, true);
    expanded += unpacked;
    if (view.getUint16(at + 8, true) & 1) throw Error('Encrypted spreadsheets are not supported.');
    if (unpacked === 0xffffffff || packed === 0xffffffff || expanded > WORKBOOK_LIMITS.expandedBytes || unpacked > Math.max(1, packed) * 1000) throw Error('Spreadsheet expands beyond the supported limits.');
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (at > start + size) throw Error('Invalid spreadsheet ZIP entry size.');
  }
  if (at !== start + size) throw Error('Invalid spreadsheet ZIP entry count.');
}

export function readWorkbook(data: Uint8Array | ArrayBuffer | string, options: XLSX.ParsingOptions = {}): XLSX.WorkBook {
  if (typeof data === 'string') { if (data.length * 2 > WORKBOOK_LIMITS.bytes) throw Error('Spreadsheet text exceeds the supported limit.'); }
  else checkWorkbookBytes(data instanceof Uint8Array ? data : new Uint8Array(data));
  const workbook = XLSX.read(data, { ...options, sheetRows: WORKBOOK_LIMITS.rows + 1 });
  let cells = 0, rangeCells = 0;
  for (const sheet of Object.values(workbook.Sheets)) {
    const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
    if (range.e.r >= WORKBOOK_LIMITS.rows || range.e.c >= WORKBOOK_LIMITS.columns) throw Error('Spreadsheet exceeds 100,000 rows or 1,024 columns. No data was imported.');
    rangeCells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (rangeCells > WORKBOOK_LIMITS.cells) throw Error('Spreadsheet ranges exceed two million cells.');
    for (const key in sheet) if (!key.startsWith('!') && ++cells > WORKBOOK_LIMITS.cells) throw Error('Spreadsheet exceeds two million cells.');
  }
  return workbook;
}
