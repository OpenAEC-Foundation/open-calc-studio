// #45: regelformule van een meetregel, zoals BC3 regeltype 3 (a = aantal,
// b = lengte, c = breedte, d = hoogte, p = π; functies uit FIEBDC-3 bijlage 2).
import { describe, expect, it } from 'vitest';
import { evaluateLineExpression, isValidLineExpression, normalizeLineExpression } from '@/services/measurement/lineExpression';

const v = (a: number | null, b: number | null = null, c: number | null = null, d: number | null = null) => ({ a, b, c, d });

describe('regelformule uitrekenen', () => {
  it('rekent met a/b/c/d; een leeg vak is 0', () => {
    expect(evaluateLineExpression('a*b*c/2', v(2, 3, 4))).toBe(12);
    expect(evaluateLineExpression('a*b+d', v(2, 3))).toBe(6);
    expect(evaluateLineExpression('A*B', v(2, 3))).toBe(6);
  });

  it('voorrang: ^ boven * boven +; ^ van rechts; min vóór een macht', () => {
    expect(evaluateLineExpression('2+3*4^2', v(null))).toBe(50);
    expect(evaluateLineExpression('2^3^2', v(null))).toBe(512);
    expect(evaluateLineExpression('-a^2', v(3))).toBe(-9);
    expect(evaluateLineExpression('(a+b)*2', v(1, 2))).toBe(6);
    expect(evaluateLineExpression('a*-b', v(2, 3))).toBe(-6);
  });

  it('p en PI zijn π; functies uit de norm, hoeken in graden', () => {
    expect(evaluateLineExpression('p*a^2', v(1))).toBeCloseTo(Math.PI, 12);
    expect(evaluateLineExpression('PI', v(null))).toBeCloseTo(Math.PI, 12);
    expect(evaluateLineExpression('SQRT(a)', v(9))).toBe(3);
    expect(evaluateLineExpression('abs(a)', v(-2))).toBe(2);
    expect(evaluateLineExpression('INT(a)', v(-2.7))).toBe(-2);
    expect(evaluateLineExpression('ROUND(a,1)', v(2.36))).toBe(2.4);
    expect(evaluateLineExpression('SIN(30)', v(null))).toBeCloseTo(0.5, 12);
    expect(evaluateLineExpression('ATAN(1)', v(null))).toBeCloseTo(45, 12);
    expect(evaluateLineExpression('ATAN2(1,1)', v(null))).toBeCloseTo(45, 12);
  });

  it('komma als decimaalteken buiten een functie, als scheiding erbinnen', () => {
    expect(evaluateLineExpression('a*1,5', v(2))).toBe(3);
    expect(evaluateLineExpression('ROUND(a*1.5,0)', v(3))).toBe(5);
    expect(evaluateLineExpression('=a*b', v(2, 3))).toBe(6);
  });

  it('niet te lezen of geen uitkomst: null', () => {
    for (const bad of ['', 'a*x', 'a*(b', 'a b', '2..5', 'SQRT', 'ROUND(a)', 'a;b', '.']) {
      expect(evaluateLineExpression(bad, v(1, 2)), bad).toBeNull();
      expect(isValidLineExpression(bad), bad).toBe(false);
    }
    // Geldig, maar met een leeg vak b een deling door 0.
    expect(isValidLineExpression('a/b')).toBe(true);
    expect(evaluateLineExpression('a/b', v(1))).toBeNull();
    expect(evaluateLineExpression('SQRT(a)', v(-1))).toBeNull();
  });

  it('bewaart in één vorm: punt, kleine letters, functies in hoofdletters, geen spaties', () => {
    expect(normalizeLineExpression(' A * 1,5 ')).toBe('a*1.5');
    expect(normalizeLineExpression('=sqrt(a) × b')).toBe('SQRT(a)*b');
    expect(normalizeLineExpression('Pi*a^2*b')).toBe('p*a^2*b');
    expect(normalizeLineExpression('a*0.0000001')).toBe('a*0.0000001');
    expect(normalizeLineExpression('a*0.000000000000123')).toBe('a*0.000000000000123');
    expect(normalizeLineExpression('a*x')).toBeNull();
  });
});
