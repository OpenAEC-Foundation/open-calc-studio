import { decimalSeparator, parseLocaleNumber } from './formatting';

// Grid-invoer voor getalcellen: een gewoon getal in de notatie van de
// app-taal ("6,66" en "1.234,56" in NL, "6.66" en "1,234.56" in EN) of een
// rekenformule ("=12,2*2,22", "12.2*2.2", "17,7+5").
// Binnen formules zijn zowel komma als punt decimaalteken; staan ze allebei
// in een getal, dan is het laatste het decimaalteken ("1.234,56", "1,234.56").
// Meerdere keren hetzelfde teken is een duizendtal ("1.234.567").
// Retourneert null bij lege of ongeldige invoer.
export function parseNumericInput(input: string): number | null {
  // Geplakte waarden uit andere talen: harde spaties, richtingstekens en het
  // wiskundige minteken (U+2212) normaliseren.
  const trimmed = input.replace(/[\u00A0\u202F\u200E\u200F]/g, '').replace(/\u2212/g, '-').trim();
  if (!trimmed) return null;

  const isFormula = trimmed.startsWith('=');
  const body = isFormula ? trimmed.slice(1) : trimmed;
  if (!body.trim()) return null;

  // Zonder '=' alleen als formule zien bij een echte operator: * / ( )
  // of een +/- ná een cijfer (zodat "-15,5" een gewoon getal blijft).
  const looksLikeExpr = isFormula || /[*/()]/.test(body) || /\d\s*[+-]/.test(body);
  if (!looksLikeExpr) return parseLocaleNumber(body);

  // Iets dat op een formule lijkt maar niet klopt ("12*", "3*(4", "10/0") is
  // ongeldig; voorheen werd het stil het eerste getal (12, 3, 10).
  return evaluateExpression(body, decimalSeparator());
}

// Herschrijft alle getal-tokens in een expressie naar punt-notatie
// ("1.234,56" → "1234.56", "6,66" → "6.66"); overige tekst blijft staan.
// Voor formule-engines die alleen punt-decimalen kennen (subbladen).
export function normalizeDecimalsInExpression(expr: string): string {
  return expr.replace(/\d[\d.,]*/g, (tok) => {
    const n = parseFormulaNumber(tok);
    return n === null ? tok : String(n);
  });
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; op: string };

function tokenize(expr: string, decimal?: ',' | '.'): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
    } else if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
    } else if (/[0-9.,]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.,]/.test(expr[j])) j++;
      const value = parseFormulaNumber(expr.slice(i, j), decimal);
      if (value === null) return null;
      tokens.push({ kind: 'num', value });
      i = j;
    } else {
      return null;
    }
  }
  return tokens;
}

// Getal-token binnen een formule, los van de app-taal: komma en punt zijn
// allebei decimaalteken. Staan ze allebei in het getal, dan is het laatste
// het decimaalteken en het andere het duizendtal. Meerdere punten zonder
// komma zijn een duizendtal ("1.234.567"); meerdere komma's zonder punt zijn
// ongeldig ("1,2,3"), zoals voorheen.
// Uitzondering voor talen met een punt als decimaalteken (`decimal` = '.'):
// daar is een komma met precies 3 cijfers erna een duizendtal ("=1,234*2" →
// 2468, "=1,234,567" → 1234567), net als bij een gewoon getal in die taal.
function parseFormulaNumber(token: string, decimal?: ',' | '.'): number | null {
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');
  let normalized = token;
  if (lastComma >= 0 && lastDot >= 0) {
    const [dec, grp] = lastComma > lastDot ? [',', '.'] : ['.', ','];
    if (token.indexOf(dec) !== token.lastIndexOf(dec)) return null; // "1,2.3,4"
    normalized = token.split(grp).join('').replace(dec, '.');
  } else if (lastComma >= 0 && decimal === '.' && /^[1-9]\d{0,2}(,\d{3})+$/.test(token)) {
    normalized = token.split(',').join('');
  } else if (lastComma >= 0) {
    if (token.indexOf(',') !== lastComma) return null; // meerdere komma's
    normalized = token.replace(',', '.');
  } else if ((token.match(/\./g) || []).length > 1) {
    normalized = token.replace(/\./g, '');
  }
  if (!/^\d*\.?\d+$/.test(normalized) && !/^\d+\.$/.test(normalized)) return null;
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

// Recursive descent: expr = term ((+|-) term)*, term = factor ((*|/) factor)*,
// factor = [+-]* (getal | '(' expr ')')
function evaluateExpression(expr: string, decimal?: ',' | '.'): number | null {
  const tokens = tokenize(expr, decimal);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const takeOp = (ops: string) => {
    const t = tokens[pos];
    if (t && t.kind === 'op' && ops.includes(t.op)) {
      pos++;
      return t.op;
    }
    return null;
  };

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    let op: string | null;
    while ((op = takeOp('+-')) !== null) {
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    let op: string | null;
    while ((op = takeOp('*/')) !== null) {
      const right = parseFactor();
      if (right === null) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    let sign = 1;
    let op: string | null;
    while ((op = takeOp('+-')) !== null) {
      if (op === '-') sign = -sign;
    }
    const t = peek();
    if (!t) return null;
    if (t.kind === 'num') {
      pos++;
      return sign * t.value;
    }
    if (t.kind === 'op' && t.op === '(') {
      pos++;
      const inner = parseExpr();
      if (inner === null || takeOp(')') === null) return null;
      return sign * inner;
    }
    return null;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}
