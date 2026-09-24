import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { scopeSelector, scopeSelectorList, splitSelectorList } from '@/lib/cssScope';

describe('CSS-scoping voor het inbouwpakket', () => {
  it('zet paginaselectors om naar de wrapper', () => {
    expect(scopeSelector(':root')).toBe('.ocs-embed');
    expect(scopeSelector('html')).toBe('.ocs-embed');
    expect(scopeSelector('body')).toBe('.ocs-embed');
    expect(scopeSelector('#root')).toBe('.ocs-embed');
    expect(scopeSelector('html.cursor-col-resizing')).toBe('.ocs-embed.cursor-col-resizing');
    expect(scopeSelector('body > .x')).toBe('.ocs-embed > .x');
  });

  it('zet thema-, reset- en gewone selectors onder de wrapper', () => {
    expect(scopeSelector('[data-theme="dark"]')).toBe('.ocs-embed[data-theme="dark"]');
    expect(scopeSelector('[data-theme="dark"] .ribbon')).toBe('.ocs-embed[data-theme="dark"] .ribbon');
    expect(scopeSelector('*')).toBe('.ocs-embed *');
    expect(scopeSelector('.content .grid-row:hover')).toBe('.ocs-embed .content .grid-row:hover');
    expect(scopeSelector('.ocs-embed.ocs-portal')).toBe('.ocs-embed.ocs-portal');
    expect(scopeSelector('.htmlx')).toBe('.ocs-embed .htmlx');
  });

  it('behandelt selectorlijsten en komma\'s binnen haakjes', () => {
    expect(splitSelectorList('a, :is(b, c) d, e')).toEqual(['a', ':is(b, c) d', 'e']);
    expect(scopeSelectorList('html, body, #root')).toBe('.ocs-embed');
    expect(scopeSelectorList('input, textarea')).toBe('.ocs-embed input, .ocs-embed textarea');
  });
});

describe('voorbeeldbegrotingen in de bundel', () => {
  it('zijn gelijk aan de bestanden in public/data', () => {
    for (const f of ['voorbeeld.ifcCalc', 'sample-en.ifcCalc']) {
      expect(readFileSync(`src/data/samples/${f}`, 'utf8')).toBe(readFileSync(`public/data/${f}`, 'utf8'));
    }
  });
});

describe('host-root (ingebouwd)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('data-theme');
  });

  it('zet attributen niet op <html> maar op de wrapper, ook als die later komt', async () => {
    const m = await import('@/lib/hostRoot');
    m.markEmbedded();
    m.setHostAttribute('lang', 'de');
    expect(document.documentElement.getAttribute('lang')).toBeNull();
    const wrapper = document.createElement('div');
    m.setHostRoot(wrapper);
    expect(wrapper.getAttribute('lang')).toBe('de');
    m.setHostAttribute('data-theme', 'dark');
    expect(wrapper.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    const portal = m.getPortalTarget();
    expect(portal.className).toBe('ocs-embed ocs-portal');
    expect(portal.getAttribute('data-theme')).toBe('dark');
    expect(portal.parentElement).toBe(document.body);

    const inside = document.createElement('input');
    wrapper.appendChild(inside);
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const evIn = new Event('keydown');
    Object.defineProperty(evIn, 'target', { value: inside });
    const evOut = new Event('keydown');
    Object.defineProperty(evOut, 'target', { value: outside });
    expect(m.eventInsideHost(evIn)).toBe(true);
    expect(m.eventInsideHost(evOut)).toBe(false);
  });
});

describe('bibliotheek-API', () => {
  // De hele app laden in jsdom (600+ modules) duurt meer dan de standaard 5 s.
  it('exporteert component, mount-helper en de importers/calculator', { timeout: 60000 }, async () => {
    const lib = await import('@/lib/index');
    expect(typeof lib.OpenCalcStudio).toBe('function');
    expect(typeof lib.mount).toBe('function');
    expect(typeof lib.importBc3File).toBe('function');
    expect(typeof lib.importOnlvFile).toBe('function');
    expect(typeof lib.buildBc3Bytes).toBe('function');
    expect(typeof lib.buildOnlv).toBe('function');
    expect(typeof lib.recalculateItems).toBe('function');
    expect(typeof lib.deserializeProject).toBe('function');
    expect(lib.LANGUAGES.length).toBeGreaterThan(30);
  });
});
