/**
 * Regelformule van een meetregel (#45), zoals BC3 regeltype 3 (FIEBDC-3,
 * registro ~M, "Expresión"): een rekensom in de vakken van de regel, met
 * a = aantal, b = lengte, c = breedte, d = hoogte en p = π. Bijvoorbeeld
 * `a*b*c/2` (driehoek) of `p*a^2*b` (ronde kolom).
 *
 * Toegestaan volgens de norm (bijlage 2): + - * / ^ en haakjes, en de
 * functies ABS, INT, ROUND(n,d), SQRT, SIN, COS, TAN, ASIN, ACOS, ATAN en
 * ATAN2(x,y), hoeken in graden. Een leeg vak telt als 0.
 *
 * Eigen rekenaar in plaats van `evaluateExpression`: die kent geen
 * variabelen of functies, en `eval` komt er niet in.
 */

export interface LineExpressionValues {
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: 'a' | 'b' | 'c' | 'd' | 'p' }
  | { kind: 'fn'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' };

const DEG = Math.PI / 180;
const FUNCTIONS: Record<string, { args: number; fn: (...x: number[]) => number }> = {
  ABS: { args: 1, fn: Math.abs },
  INT: { args: 1, fn: Math.trunc },
  ROUND: {
    args: 2,
    fn: (n, d) => {
      const f = 10 ** Math.trunc(d);
      return Math.sign(n) * Math.round(Math.abs(n) * f) / f;
    },
  },
  SQRT: { args: 1, fn: Math.sqrt },
  SIN: { args: 1, fn: (n) => Math.sin(n * DEG) },
  COS: { args: 1, fn: (n) => Math.cos(n * DEG) },
  TAN: { args: 1, fn: (n) => Math.tan(n * DEG) },
  ASIN: { args: 1, fn: (n) => Math.asin(n) / DEG },
  ACOS: { args: 1, fn: (n) => Math.acos(n) / DEG },
  ATAN: { args: 1, fn: (n) => Math.atan(n) / DEG },
  // ATAN2(x,y): hoek van het punt (x,y).
  ATAN2: { args: 2, fn: (x, y) => Math.atan2(y, x) / DEG },
};

/**
 * Tekst naar tokens. Een komma tussen twee cijfers buiten een
 * functieaanroep is een decimaalteken ("a*1,5" in het Nederlands of
 * Spaans); binnen een functie scheidt hij de argumenten ("ROUND(a,2)").
 */
function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  // Per open haakje: hoort hij bij een functie?
  const parens: boolean[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch) || (ch === ',' && /\d/.test(text[i + 1] ?? '') && !parens.includes(true))) {
      let j = i;
      let seenDecimal = false;
      while (j < text.length) {
        const c = text[j];
        if (/\d/.test(c)) { j++; continue; }
        const decimal = c === '.' || (c === ',' && !parens.includes(true));
        if (decimal && !seenDecimal && /\d/.test(text[j + 1] ?? '')) { seenDecimal = true; j++; continue; }
        break;
      }
      if (j === i) return null; // een los "." of ","
      const value = Number(text.slice(i, j).replace(',', '.'));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9]/.test(text[j])) j++;
      const word = text.slice(i, j);
      const upper = word.toUpperCase();
      if (FUNCTIONS[upper]) {
        tokens.push({ kind: 'fn', name: upper });
      } else if (/^[abcd]$/i.test(word)) {
        tokens.push({ kind: 'var', name: word.toLowerCase() as 'a' | 'b' | 'c' | 'd' });
      } else if (upper === 'P' || upper === 'PI') {
        tokens.push({ kind: 'var', name: 'p' });
      } else {
        return null;
      }
      i = j;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      if (ch === '(') parens.push(tokens[tokens.length - 1]?.kind === 'fn');
      if (ch === ')') parens.pop();
      tokens.push({ kind: 'op', op: ch as '+' });
      i++;
      continue;
    }
    // × en · als vermenigvuldiging, − als min: zo plakt het uit een tekstverwerker.
    if (ch === '×' || ch === '·') { tokens.push({ kind: 'op', op: '*' }); i++; continue; }
    if (ch === '−') { tokens.push({ kind: 'op', op: '-' }); i++; continue; }
    return null;
  }
  return tokens;
}

/**
 * Recursive descent over de tokens. `null` als de vorm niet klopt (een
 * haakje te veel, een onbekend woord); anders de uitkomst, die ook NaN of
 * oneindig kan zijn (deling door 0, SQRT van een negatief getal).
 */
function evaluateTokens(tokens: Token[], vars: Record<'a' | 'b' | 'c' | 'd' | 'p', number>): number | null {
  let pos = 0;
  const peekOp = (): string | undefined => {
    const t = tokens[pos];
    return t?.kind === 'op' ? t.op : undefined;
  };
  const fail = (): never => { throw new Error('expr'); };

  const expression = (): number => {
    let v = term();
    for (let op = peekOp(); op === '+' || op === '-'; op = peekOp()) {
      pos++;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = unary();
    for (let op = peekOp(); op === '*' || op === '/'; op = peekOp()) {
      pos++;
      const r = unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  // Min vóór een macht: -a^2 = -(a^2), zoals in de wiskunde (Excel rekent hier (-a)^2).
  const unary = (): number => {
    const op = peekOp();
    if (op === '-' || op === '+') { pos++; const v = unary(); return op === '-' ? -v : v; }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (peekOp() === '^') { pos++; return base ** unary(); }
    return base;
  };
  const primary = (): number => {
    const t = tokens[pos++];
    if (!t) return fail();
    if (t.kind === 'num') return t.value;
    if (t.kind === 'var') return vars[t.name];
    if (t.kind === 'fn') {
      if (peekOp() !== '(') return fail();
      pos++;
      const args = [expression()];
      while (peekOp() === ',') { pos++; args.push(expression()); }
      if (peekOp() !== ')') return fail();
      pos++;
      const def = FUNCTIONS[t.name];
      if (args.length !== def.args) return fail();
      return def.fn(...args);
    }
    if (t.op === '(') {
      const v = expression();
      if (peekOp() !== ')') return fail();
      pos++;
      return v;
    }
    return fail();
  };

  try {
    const v = expression();
    return pos === tokens.length ? v : null;
  } catch {
    return null;
  }
}

/** Uitkomst van de regelformule met deze vakken; `null` als de formule niet klopt of niets oplevert. */
export function evaluateLineExpression(expression: string, values: LineExpressionValues): number | null {
  const tokens = tokenize(expression.trim().replace(/^=/, ''));
  if (!tokens || tokens.length === 0) return null;
  const v = evaluateTokens(tokens, { a: values.a ?? 0, b: values.b ?? 0, c: values.c ?? 0, d: values.d ?? 0, p: Math.PI });
  return v !== null && Number.isFinite(v) ? v : null;
}

/**
 * Of de tekst een geldige regelformule is. Alleen de vorm telt: `a/b` is
 * geldig, ook al geeft hij met een leeg vak b niets.
 */
export function isValidLineExpression(expression: string): boolean {
  const tokens = tokenize(expression.trim().replace(/^=/, ''));
  if (!tokens || tokens.length === 0) return false;
  return evaluateTokens(tokens, { a: 1, b: 1, c: 1, d: 1, p: Math.PI }) !== null;
}

/**
 * De formule zoals hij bewaard wordt en in BC3 komt: punt als
 * decimaalteken, kleine letters voor a–d en p, functienamen in hoofdletters,
 * geen spaties. `null` als hij niet te lezen is.
 */
export function normalizeLineExpression(expression: string): string | null {
  const tokens = tokenize(expression.trim().replace(/^=/, ''));
  if (!tokens || tokens.length === 0 || !isValidLineExpression(expression)) return null;
  return tokens.map((t) => {
    // Geen exponentnotatie ("1e-7"): die leest geen BC3-programma, en deze rekenaar ook niet.
    if (t.kind === 'num') return /e/i.test(String(t.value)) ? t.value.toFixed(20).replace(/\.?0+$/, '') : String(t.value);
    if (t.kind === 'var') return t.name;
    if (t.kind === 'fn') return t.name;
    return t.op;
  }).join('');
}
