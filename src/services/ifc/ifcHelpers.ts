export function generateIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  // 22 tekens x 6 bits = 132 bits voor een GUID van 128 bits: het eerste teken draagt maar
  // 2 bits en is dus 0-3 (knownbug 153).
  let result = chars[Math.floor(Math.random() * 4)];
  for (let i = 1; i < 22; i++) {
    result += chars[Math.floor(Math.random() * 64)];
  }
  return result;
}

export function encodeStepString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/[^\x20-\x7E]/g, (ch) => {
      const code = ch.charCodeAt(0);
      if (code > 0xFF) {
        return '\\X2\\' + code.toString(16).toUpperCase().padStart(4, '0') + '\\X0\\';
      }
      return '\\X\\' + code.toString(16).toUpperCase().padStart(2, '0');
    });
}

export function decodeStepString(str: string): string {
  let result = str.replace(/''/g, "'");
  // Decode \X2\ hex \X0\ sequences
  result = result.replace(/\\X2\\([0-9A-Fa-f]{4,})\\X0\\/g, (_match, hex: string) => {
    let decoded = '';
    for (let i = 0; i < hex.length; i += 4) {
      decoded += String.fromCharCode(parseInt(hex.substring(i, i + 4), 16));
    }
    return decoded;
  });
  // Decode \X\ two-char hex
  result = result.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_match, hex: string) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  result = result.replace(/\\\\/g, '\\');
  return result;
}

export function formatStepFloat(value: number): string {
  const s = value.toString();
  if (!s.includes('.')) return s + '.';
  return s;
}

export function isoTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
}
