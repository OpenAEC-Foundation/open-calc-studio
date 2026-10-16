/** DOS CP850 decoder shared by legacy DNC and FIEBDC-3 importers. */
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»' +
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

export function decodeCp850(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len; i++) {
    const b = bytes[i];
    s += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80] ?? '�';
  }
  return s;
}
