/**
 * FIEBDC-3 (.bc3) exporter — schrijft de begroting als Spaans
 * uitwisselbestand (fiebdc.es): ~V-kop, ~C-concepten, ~D-decomposities,
 * ~M-metingen en ~T-teksten, gecodeerd als Windows-1252 ("ANSI").
 *
 * Mapping vanuit OCS: hoofdstukken → concepten met `#`-suffix, posten →
 * partida's (hoeveelheid via ~M), rekenregels → basisconcepten met
 * rendement = norm en prijs = prijs/middel. Staartregels worden niet
 * geëxporteerd — BC3 kent geen opslagen-cascade; de ontvanger rekent met
 * zijn eigen indirecte kosten.
 */
import type { CostItem, CostSchedule } from '@/types/costModel';

const num = (n: number | null | undefined): string => {
  const v = n ?? 0;
  return (Math.round(v * 1000) / 1000).toString();
};

/** Veldtekst veiligmaken: |, ~ en \ zijn structuurtekens in BC3. */
const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[|~\\]/g, ' ').replace(/\r?\n/g, ' ').trim();

const TYPE_BY_RESOURCE: Record<string, string> = {
  arbeid: '1',
  materieel: '2',
  materiaal: '3',
};

export function buildBc3(schedule: CostSchedule, items: CostItem[]): string {
  const lines: string[] = [];
  const byParent = new Map<string | null, CostItem[]>();
  for (const it of items) {
    if (it.rowType.startsWith('staart_') || it.rowType === 'witregel') continue;
    const list = byParent.get(it.parentId) ?? [];
    list.push(it);
    byParent.set(it.parentId, list);
  }

  // Unieke, BC3-veilige codes per item.
  const used = new Set<string>();
  const codeOf = new Map<string, string>();
  let auto = 0;
  const assignCode = (it: CostItem): string => {
    const cached = codeOf.get(it.id);
    if (cached) return cached;
    let base = esc(it.code).replace(/[#\s]+/g, '') || `C${String(++auto).padStart(4, '0')}`;
    let code = base;
    let n = 1;
    while (used.has(code.toUpperCase())) code = `${base}_${n++}`;
    used.add(code.toUpperCase());
    codeOf.set(it.id, code);
    return code;
  };

  const projectName = esc(schedule.projectName || schedule.name || 'Begroting');
  const rootCode = 'OCS##';

  // ~V: | eigenschap | formaatversie | programma | kop | tekenset |
  lines.push(`~V||FIEBDC-3/2004|Open Calc Studio||ANSI|||||`);

  const dRecords: string[] = [];
  const mRecords: string[] = [];
  const tRecords: string[] = [];

  const conceptLine = (code: string, unit: string, summary: string, price: number, type: string): string =>
    `~C|${code}|${esc(unit)}|${esc(summary)}|${num(price)}||${type}|`;

  /** Recursief: schrijf concept + decompositie voor een container. */
  const walk = (it: CostItem, parentCode: string): void => {
    const kids = byParent.get(it.id) ?? [];
    if (it.rowType === 'chapter') {
      const code = `${assignCode(it)}#`;
      lines.push(conceptLine(code, '', it.description, it.total, '0'));
      if (it.notes) tRecords.push(`~T|${code}|${esc(it.notes)}|`);
      const parts = kids
        .filter((k) => k.rowType !== 'tekstregel')
        .map((k) => `${childCode(k)}\\1\\1`);
      if (parts.length > 0) dRecords.push(`~D|${code}|${parts.join('\\')}\\|`);
      for (const k of kids) walk(k, code);
    } else if (it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost') {
      const code = assignCode(it);
      const qty = it.quantity ?? 0;
      const unitPrice = qty !== 0 ? it.total / qty : it.total;
      lines.push(conceptLine(code, it.unit, it.description, unitPrice, '0'));
      if (it.notes) tRecords.push(`~T|${code}|${esc(it.notes)}|`);
      mRecords.push(`~M|${parentCode}\\${code}||${num(qty)}||`);
      const regels = kids.filter((k) => k.rowType === 'regel');
      if (regels.length > 0) {
        const parts = regels.map((k) => {
          const norm = (k.normQuantity ?? 0) / (k.normFactor || 1);
          return `${childCode(k)}\\1\\${num(norm)}`;
        });
        dRecords.push(`~D|${code}|${parts.join('\\')}\\|`);
        for (const k of regels) {
          const rc = childCode(k);
          lines.push(conceptLine(
            rc, k.unit, k.description,
            (k.normUnitPrice ?? 0) + (k.laborPrice ?? 0),
            TYPE_BY_RESOURCE[k.resourceType ?? ''] ?? '0',
          ));
          if (k.notes) tRecords.push(`~T|${rc}|${esc(k.notes)}|`);
        }
      }
      // Geneste containers onder een post (bewakingsposten) plat meenemen.
      for (const k of kids.filter((x) => x.rowType === 'bewakingspost')) walk(k, code);
    }
  };
  const childCode = (it: CostItem): string =>
    it.rowType === 'chapter' ? `${assignCode(it)}#` : assignCode(it);

  const top = (byParent.get(null) ?? []).filter((i) => i.rowType !== 'tekstregel');
  const rootTotal = top.reduce((s, i) => s + i.total, 0);
  lines.push(conceptLine(rootCode, '', projectName, rootTotal, '0'));
  const rootParts = top.map((k) => `${childCode(k)}\\1\\1`);
  if (rootParts.length > 0) dRecords.push(`~D|${rootCode}|${rootParts.join('\\')}\\|`);
  for (const it of top) walk(it, rootCode);

  return [...lines, ...dRecords, ...mRecords, ...tRecords].join('\r\n') + '\r\n';
}

/** Windows-1252-bytes voor een BC3-tekst (niet-encodeerbaar → '?'). */
export function encodeWindows1252(text: string): Uint8Array {
  const SPECIALS: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
  };
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    out[i] = cp <= 0xff ? cp : SPECIALS[cp] ?? 0x3f;
  }
  return out;
}

export function exportBc3(schedule: CostSchedule, items: CostItem[]): void {
  const text = buildBc3(schedule, items);
  const bytes = encodeWindows1252(text);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${schedule.projectName || schedule.name || 'begroting'}.bc3`;
  a.click();
  URL.revokeObjectURL(url);
}
