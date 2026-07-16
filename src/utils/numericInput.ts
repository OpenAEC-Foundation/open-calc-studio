import { parseNlNumber } from './formatting';

// Grid-invoer voor getalcellen: een gewoon NL-getal ("6,66", "1.234,56")
// of een rekenformule ("=12,2*2,22", "12.2*2.2", "17,7+5").
// Binnen formules zijn zowel komma als punt decimaalteken; een punt is
// alleen duizendtal-separator als er ook een komma in het getal staat
// ("1.234,56") of bij meerdere punten ("1.234.567").
// Retourneert null bij lege of ongeldige invoer.
export function parseNumericInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isFormula = trimmed.startsWith('=');
  const body = isFormula ? trimmed.slice(1) : trimmed;
  if (!body.trim()) return null;

  // Zonder '=' alleen als formule zien bij een echte operator: * / ( )
  // of een +/- ná een cijfer (zodat "-15,5" een gewoon getal blijft).
  const looksLikeExpr = isFormula || /[*/()]/.test(body) || /\d\s*[+-]/.test(body);
  if (!looksLikeExpr) return parseNlNumber(body);

  const result = evaluateExpression(body);
  if (result !== null) return result;
  // Geen geldige formule: expliciete '='-invoer is dan ongeldig,
  // anders alsnog als gewoon getal proberen.
  return isFormula ? null : parseNlNumber(body);
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

function tokenize(expr: string): Token[] | null {
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
      const value = parseFormulaNumber(expr.slice(i, j));
      if (value === null) return null;
      tokens.push({ kind: 'num', value });
      i = j;
    } else {
      return null;
    }
  }
  return tokens;
}

// Getal-token binnen een formule: komma = decimaal; punt = decimaal,
// tenzij gecombineerd met een komma (duizendtal) of bij meerdere punten.
function parseFormulaNumber(token: string): number | null {
  const lastComma = token.lastIndexOf(',');
  let normalized = token;
  if (lastComma >= 0) {
    if (token.indexOf(',') !== lastComma) return null; // meerdere komma's
    normalized = token.replace(/\./g, '').replace(',', '.');
  } else if ((token.match(/\./g) || []).length > 1) {
    normalized = token.replace(/\./g, '');
  }
  if (!/^\d*\.?\d+$/.test(normalized) && !/^\d+\.$/.test(normalized)) return null;
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

// Recursive descent: expr = term ((+|-) term)*, term = factor ((*|/) factor)*,
// factor = [+-]* (getal | '(' expr ')')
function evaluateExpression(expr: string): number | null {
  const tokens = tokenize(expr);
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
