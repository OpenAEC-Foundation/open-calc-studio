import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrency, parseNlNumber } from '@/utils/formatting';

describe('formatNumber', () => {
  it('returns empty string for null', () => {
    expect(formatNumber(null)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatNumber(0)).toBe('');
  });

  it('formats with Dutch locale (comma as decimal)', () => {
    const result = formatNumber(1234.56);
    expect(result).toContain('1.234,56');
  });

  it('formats integer with two decimals', () => {
    const result = formatNumber(42);
    expect(result).toContain('42,00');
  });
});

describe('formatCurrency', () => {
  it('returns empty string for null', () => {
    expect(formatCurrency(null)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatCurrency(0)).toBe('');
  });

  it('formats with Dutch locale', () => {
    const result = formatCurrency(1500.50);
    // formatCurrency uses plain number formatting (no euro sign)
    expect(result).toBe('1.500,50');
  });
});

describe('parseNlNumber', () => {
  it('returns null for empty string', () => {
    expect(parseNlNumber('')).toBeNull();
    expect(parseNlNumber('  ')).toBeNull();
  });

  it('parses Dutch-formatted number (comma decimal)', () => {
    expect(parseNlNumber('1.234,56')).toBe(1234.56);
  });

  it('parses plain number', () => {
    expect(parseNlNumber('42')).toBe(42);
  });

  it('parses negative number', () => {
    expect(parseNlNumber('-15,5')).toBe(-15.5);
  });

  it('returns null for non-numeric input', () => {
    expect(parseNlNumber('abc')).toBeNull();
  });

  it('parses number without thousand separator', () => {
    expect(parseNlNumber('500,00')).toBe(500);
  });
});
