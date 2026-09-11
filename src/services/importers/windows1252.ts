/**
 * Windows-1252 ("ANSI") van en naar tekst, onafhankelijk van wat de
 * TextDecoder van de omgeving ondersteunt. Buiten de browser (Node zonder
 * volledige ICU, jsdom in tests) valt `TextDecoder('windows-1252')` stil
 * terug op ISO-8859-1, waardoor 0x80–0x9F (€, “ ”, ‘ ’, –, …) als
 * stuurtekens binnenkomen. Deze tabel is klein en overal gelijk.
 */

/** 0x80–0x9F: de plekken waar Windows-1252 van ISO-8859-1 afwijkt. */
const HIGH: number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const TO_BYTE = new Map<number, number>();
HIGH.forEach((cp, i) => TO_BYTE.set(cp, 0x80 + i));

export function decodeWindows1252(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const parts: string[] = [];
  const CHUNK = 8192;
  for (let i = start; i < end; i += CHUNK) {
    const codes: number[] = [];
    const stop = Math.min(end, i + CHUNK);
    for (let k = i; k < stop; k++) {
      const b = bytes[k];
      codes.push(b >= 0x80 && b <= 0x9f ? HIGH[b - 0x80] : b);
    }
    parts.push(String.fromCharCode(...codes));
  }
  return parts.join('');
}

const encodable = (cp: number): boolean =>
  cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || TO_BYTE.has(cp);

/** Past elke letter van de tekst in Windows-1252? */
export function fitsWindows1252(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!encodable(text.charCodeAt(i))) return false;
  }
  return true;
}

/** Niet-encodeerbare tekens worden '?'. */
export function encodeWindows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    out[i] = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : TO_BYTE.get(cp) ?? 0x3f;
  }
  return out;
}
