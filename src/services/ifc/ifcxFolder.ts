/**
 * Mapoverzicht / federatie van meerdere bestanden in dezelfde (cloud)map.
 *
 * Doel: als in één map meerdere .ifcx-bestanden staan (bijv. een .ifcx met
 * hoeveelheden uit een PDF-tekening + een .ifcx met de begrotingskosten),
 * dan willen we in de IFC-tab een schema zien van welke IFC-objecten in die
 * bestanden zitten — en welke objecten over bestanden heen aan elkaar
 * gelinkt zijn. De koppelsleutel is `ifcGuid` (in OCS-export
 * `ifcx::ocs::ifcGuid`): hetzelfde object in twee bestanden = een relatie.
 */

export interface IfcObjectSummary {
  /** IFC-type, bv. "IfcCostItem", "IfcProject" */
  type: string;
  count: number;
}

export interface IfcxFileSummary {
  name: string;
  /** aantal IFC-objecten (nodes met een `inherits`-type) */
  objectCount: number;
  /** per IFC-type een telling, aflopend gesorteerd */
  objectTypes: IfcObjectSummary[];
  /** ifcGuids die in dit bestand voorkomen */
  guids: string[];
  /** parse mislukt? dan staat hier de melding */
  error?: string;
}

export interface IfcxLink {
  ifcGuid: string;
  /** namen van de bestanden waarin dit object voorkomt (≥2 = echte link) */
  files: string[];
}

export interface IfcxFolderAnalysis {
  files: IfcxFileSummary[];
  /** objecten die in ≥2 bestanden voorkomen (gedeelde ifcGuid) */
  links: IfcxLink[];
  /** niet-.ifcx bestanden in de map (pdf, tekeningen, …) — context */
  otherFiles: string[];
}

/** De hele ifcx-familie: ifcx en varianten (geometrie, 2d, json) + OCS-native. */
const IFCX_EXT = /\.(ifcx|ifcgeo|ifc2d|ifc5|ifcjson|ifccalc|ocs|json)$/i;
export const isIfcxFamily = (name: string): boolean => IFCX_EXT.test(name);

/** Loop willekeurige JSON recursief af en verzamel IFC-objecten + ifcGuids. */
function collect(node: unknown, types: Map<string, number>, guids: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, types, guids);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  // IFC-object = node met een `inherits`-type (IfcX) of een `type: "Ifc..."`
  const inherits = obj.inherits;
  if (Array.isArray(inherits)) {
    for (const t of inherits) {
      if (typeof t === 'string' && /^Ifc/.test(t)) types.set(t, (types.get(t) ?? 0) + 1);
    }
  } else if (typeof obj.type === 'string' && /^Ifc/.test(obj.type)) {
    types.set(obj.type, (types.get(obj.type) ?? 0) + 1);
  }

  // ifcGuid kan op de node zelf of in attributes staan (genamespaced)
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /(^|::)ifcGuid$/i.test(k)) guids.add(v);
  }

  // recurse in alle waarden
  for (const v of Object.values(obj)) collect(v, types, guids);
}

/** Analyseer een set bestanden uit één map tot een federatie-schema. */
export function analyzeIfcxFolder(files: { name: string; content?: string }[]): IfcxFolderAnalysis {
  const summaries: IfcxFileSummary[] = [];
  const otherFiles: string[] = [];
  const guidToFiles = new Map<string, Set<string>>();

  for (const f of files) {
    if (!IFCX_EXT.test(f.name)) {
      otherFiles.push(f.name);
      continue;
    }
    if (f.content == null) {
      summaries.push({ name: f.name, objectCount: 0, objectTypes: [], guids: [], error: 'niet geladen' });
      continue;
    }
    try {
      const json = JSON.parse(f.content);
      const types = new Map<string, number>();
      const guids = new Set<string>();
      collect(json, types, guids);
      const objectTypes = [...types.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
      const objectCount = objectTypes.reduce((s, t) => s + t.count, 0);
      summaries.push({ name: f.name, objectCount, objectTypes, guids: [...guids] });
      for (const g of guids) {
        const set = guidToFiles.get(g) ?? new Set();
        set.add(f.name);
        guidToFiles.set(g, set);
      }
    } catch (e) {
      summaries.push({ name: f.name, objectCount: 0, objectTypes: [], guids: [], error: `onleesbaar: ${(e as Error).message}` });
    }
  }

  // Links = ifcGuids die in ≥2 bestanden voorkomen
  const links: IfcxLink[] = [];
  for (const [ifcGuid, fileSet] of guidToFiles) {
    if (fileSet.size >= 2) links.push({ ifcGuid, files: [...fileSet].sort() });
  }
  links.sort((a, b) => b.files.length - a.files.length || a.ifcGuid.localeCompare(b.ifcGuid));

  return { files: summaries, links, otherFiles };
}
