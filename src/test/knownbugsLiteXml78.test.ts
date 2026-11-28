import { describe, expect, it } from 'vitest';
import { parseLiteXml } from '@/services/importers/liteXml';

describe('liteXml: witruimte in attributen (knownbug 78)', () => {
  it('normaliseert letterlijke witruimte, maar laat een tekenverwijzing staan (XML 1.0, 3.3.3)', () => {
    const root = parseLiteXml('<a crlf="x\r\ny" tab="x\ty" ref="x&#10;y" cr="x&#13;y"/>');
    expect(root.attrs.crlf).toBe('x y');
    expect(root.attrs.tab).toBe('x y');
    expect(root.attrs.ref).toBe('x\ny');
    expect(root.attrs.cr).toBe('x\ry');
  });
});
