/**
 * Structuur-extractie: zet een ifcx-familiebestand (JSON) om in een boom van
 * IFC-OBJECTEN — niet de ruwe code, maar "wat zit erin": een IfcProject, een
 * IfcBeam (ligger), een IfcCostItem, enz., met naam en ifcGuid. Bedoeld om in
 * de IFC-tab een leesbare structuur te tonen van de eigen begroting én van de
 * andere ifcx-bestanden in dezelfde (cloud)map, en om objecten te kunnen
 * koppelen via gedeelde ifcGuid.
 */

export interface IfcStructureNode {
  /** IFC-type, bv. "IfcBeam", "IfcProject", "IfcCostItem" */
  type: string;
  /** leesbare naam/omschrijving indien aanwezig */
  name?: string;
  /** koppelsleutel; gedeeld over bestanden = relatie */
  ifcGuid?: string;
  /** sleutel-pad binnen het bestand (voor stabiele React-keys) */
  key: string;
  children: IfcStructureNode[];
}

// Korte code/label (bv. IfcCostItem zet hier de begrotingscode "21")
const NAME_KEYS = ['bsi::ifc::prop::Name', 'Name', 'name', 'label'];
// Leesbare omschrijving (vaak de echte betekenis: "Grondwerk", "Azobé ligger")
const DESC_KEYS = ['bsi::ifc::prop::Description', 'Description', 'description', 'omschrijving'];

function pick(a: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Leesbaar label voor een object. Veel ifcx-objecten hebben een korte code in
 * Name en de echte betekenis in Description (zo exporteert OCS de begrotings-
 * posten). Toon dan "code — omschrijving"; anders wat er is.
 */
function readName(attrs: unknown, obj: Record<string, unknown>): string | undefined {
  const a = (attrs && typeof attrs === 'object' ? attrs : obj) as Record<string, unknown>;
  const name = pick(a, NAME_KEYS);
  const desc = pick(a, DESC_KEYS);
  if (name && desc && name !== desc) return `${name} — ${desc}`;
  return desc ?? name;
}

function readGuid(obj: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /(^|::)ifcGuid$/i.test(k)) return v;
  }
  const attrs = obj.attributes;
  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (typeof v === 'string' && /(^|::)ifcGuid$/i.test(k)) return v;
    }
  }
  return undefined;
}

function ifcTypeOf(obj: Record<string, unknown>): string | null {
  const inh = obj.inherits;
  if (Array.isArray(inh)) {
    const t = inh.find((x) => typeof x === 'string' && /^Ifc/.test(x));
    if (typeof t === 'string') return t;
  }
  if (typeof obj.type === 'string' && /^Ifc/.test(obj.type)) return obj.type;
  return null;
}

/** Loop de JSON af en bouw een boom van alleen de IFC-objecten. */
function walk(value: unknown, keyPath: string, out: IfcStructureNode[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${keyPath}[${i}]`, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const type = ifcTypeOf(obj);

  if (type) {
    const node: IfcStructureNode = {
      type,
      name: readName(obj.attributes, obj),
      ifcGuid: readGuid(obj),
      key: keyPath || type,
      children: [],
    };
    // kinderen van dit object verzamelen (children-map of geneste objecten)
    const childContainer = (obj.children ?? null) as unknown;
    if (childContainer && typeof childContainer === 'object') {
      for (const [k, v] of Object.entries(childContainer as Record<string, unknown>)) {
        walk(v, `${node.key}/${k}`, node.children);
      }
    }
    // ook andere geneste objectvelden (bv. attributes-vrije structuren)
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'children' || k === 'attributes' || k === 'inherits') continue;
      if (v && typeof v === 'object') walk(v, `${node.key}.${k}`, node.children);
    }
    out.push(node);
    return;
  }

  // geen IFC-object: door-zoeken naar objecten dieper in de boom
  for (const [k, v] of Object.entries(obj)) {
    walk(v, keyPath ? `${keyPath}/${k}` : k, out);
  }
}

export interface IfcSourceStructure {
  name: string;
  roots: IfcStructureNode[];
  objectCount: number;
  error?: string;
}

export function extractStructure(name: string, content: string | undefined): IfcSourceStructure {
  if (content == null) return { name, roots: [], objectCount: 0, error: 'niet geladen' };
  try {
    const json = JSON.parse(content);
    const roots: IfcStructureNode[] = [];
    walk(json, '', roots);
    let count = 0;
    const tally = (n: IfcStructureNode) => { count++; n.children.forEach(tally); };
    roots.forEach(tally);
    return { name, roots, objectCount: count };
  } catch (e) {
    return { name, roots: [], objectCount: 0, error: `onleesbaar: ${(e as Error).message}` };
  }
}

/** Verzamel alle ifcGuids in een bron (voor cross-bron link-detectie). */
export function collectGuids(src: IfcSourceStructure): Set<string> {
  const set = new Set<string>();
  const walkNode = (n: IfcStructureNode) => {
    if (n.ifcGuid) set.add(n.ifcGuid);
    n.children.forEach(walkNode);
  };
  src.roots.forEach(walkNode);
  return set;
}
