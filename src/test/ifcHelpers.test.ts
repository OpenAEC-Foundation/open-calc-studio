import { describe, it, expect } from 'vitest';
import { encodeStepString, decodeStepString, formatStepFloat } from '@/services/ifc/ifcHelpers';

describe('encodeStepString', () => {
  it('passes through ASCII text unchanged', () => {
    expect(encodeStepString('Hello World')).toBe('Hello World');
  });

  it('escapes single quotes', () => {
    expect(encodeStepString("it's")).toBe("it''s");
  });

  it('escapes backslashes', () => {
    expect(encodeStepString('path\\to')).toBe('path\\\\to');
  });

  it('encodes characters 0x80-0xFF using \\X\\', () => {
    // é = U+00E9, falls in 0x80-0xFF range → \X\E9
    const result = encodeStepString('café');
    expect(result).toBe('caf\\X\\E9');
  });

  it('encodes m² correctly using \\X\\', () => {
    // ² = U+00B2, falls in 0x80-0xFF range → \X\B2
    const result = encodeStepString('m²');
    expect(result).toBe('m\\X\\B2');
  });

  it('encodes characters > 0xFF using \\X2\\', () => {
    // € = U+20AC → \X2\20AC\X0\
    const result = encodeStepString('€100');
    expect(result).toContain('\\X2\\');
    expect(result).toContain('20AC');
  });
});

describe('decodeStepString', () => {
  it('passes through ASCII text unchanged', () => {
    expect(decodeStepString('Hello World')).toBe('Hello World');
  });

  it('decodes escaped single quotes', () => {
    expect(decodeStepString("it''s")).toBe("it's");
  });

  it('decodes \\X2\\ sequences', () => {
    expect(decodeStepString('m\\X2\\00B2\\X0\\')).toBe('m²');
  });

  it('round-trips through encode/decode', () => {
    const originals = ['Hello', "it's a test", 'café', 'm²', 'prijs €100'];
    for (const orig of originals) {
      expect(decodeStepString(encodeStepString(orig))).toBe(orig);
    }
  });
});

describe('formatStepFloat', () => {
  it('adds dot to integer', () => {
    expect(formatStepFloat(42)).toBe('42.');
  });

  it('keeps existing decimal', () => {
    expect(formatStepFloat(3.14)).toBe('3.14');
  });

  it('formats zero', () => {
    expect(formatStepFloat(0)).toBe('0.');
  });
});
