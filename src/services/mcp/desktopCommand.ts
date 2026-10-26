import catalogue from './desktopActions.json';
import { workspaceActions } from './workspaceActionCatalogue';
import { useAppStore } from '@/state/appStore';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { openProjectInStore } from '@/services/file/openProject';
import { recalculateItems } from '@/services/calculation/calculator';

export interface JsonSchema { type?: string; enum?: unknown[]; anyOf?: JsonSchema[]; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean | JsonSchema; items?: JsonSchema }
export function validateArgument(value: unknown, schema: JsonSchema, path = 'argument'): void {
  if (schema.anyOf) {
    if (schema.anyOf.some(s => { try { validateArgument(value, s, path); return true; } catch { return false; } })) return;
    throw new Error(`${path}: value does not match the declared type`);
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: expected ${schema.enum.join(', ')}`);
  if (schema.type === 'null' && value !== null) throw new Error(`${path}: expected null`);
  if (['string', 'number', 'boolean'].includes(schema.type ?? '') && typeof value !== schema.type) throw new Error(`${path}: expected ${schema.type}`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}: expected finite number`);
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
    value.forEach((v, i) => validateArgument(v, schema.items ?? {}, `${path}[${i}]`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`);
    for (const key of schema.required ?? []) if (!(key in value)) throw new Error(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      const s = schema.properties?.[key];
      if (s) validateArgument(v, s, `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${path}.${key}: unknown field`);
      else if (typeof schema.additionalProperties === 'object') validateArgument(v, schema.additionalProperties, `${path}.${key}`);
    }
  }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error(`${path}: unsafe property`);
    if (!schema.type) validateArgument(v, {}, `${path}.${k}`);
  }
}

export function desktopState() {
  const s = useAppStore.getState();
  return { activeDocumentId: s.activeDocumentId, documents: s.documents.map(d => ({ id:d.id, fileName:d.fileName, filePath:d.filePath, isModified:d.isModified })),
    schedule:{...s.schedule,pdfWorkspace:s.schedule.pdfWorkspace?{...s.schedule.pdfWorkspace,sources:s.schedule.pdfWorkspace.sources.map(({dataBase64,...source})=>source)}:undefined}, items:s.items, companyInfo:s.companyInfo, resourceLibrary:s.resourceLibrary, subSheets:s.subSheets,
    offerte:s.offerte, snapshots:s.snapshots.map(({items,schedule,offerte,...metadata})=>metadata), ifcQuantities:s.ifcQuantities, pdfMeasurements:s.pdfMeasurements,
    activeContentTab:s.activeContentTab, activeItemId:s.activeItemId, reportView:s.reportView, gridView:s.gridView,
    canUndo:s.canUndo(), canRedo:s.canRedo() };
}

/** JSON-only action boundary. Dispatches the same store methods used by the UI. */
export async function executeDesktopCommand(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const store = useAppStore.getState();
  if (action === 'getState') return desktopState();
  if (action === 'listActions') return { ...catalogue, workspaceActions };
  if (action === 'getProject') {
    const p = JSON.parse(serializeProject(store.schedule, store.items, store.companyInfo, {sheets:store.subSheets,activeSheetId:store.activeSubSheetId}, store.offerte, store.snapshots));
    p.resourceLibrary = store.resourceLibrary;
    return p;
  }
  if (action === 'openProject') {
    if (typeof params.json !== 'string') throw new Error('json is required');
    const project = deserializeProject(params.json);
    const id = openProjectInStore(project, String(params.fileName ?? 'MCP-begroting'), typeof params.filePath === 'string' ? params.filePath : null);
    useAppStore.getState().setResourceLibrary(project.resourceLibrary ?? []);
    useAppStore.getState().setSnapshots(project.snapshots ?? []);
    return { documentId: id };
  }
  // File/viewer services are loaded only when used.
  if (action === 'export.pdf' || action === 'export.ifc') {
    const { exportPdf, exportIfc } = await import('./apiExports');
    return { outputPath: await (action === 'export.pdf' ? exportPdf(params) : exportIfc(params)) };
  }
  if (action.startsWith('file.')) return (await import('./fileCommands')).fileCommand(action.slice(5),params);
  if (action.startsWith('pdf.')) return (await import('./workspaceCommands')).pdfCommand(action.slice(4), params);
  if (action.startsWith('ifc.')) return (await import('../ifc/ifcLiteWorkspace')).ifcCommand(action.slice(4), params);
  if (!Object.prototype.hasOwnProperty.call(catalogue.actions, action)) throw new Error(`Unknown action: ${action}. Use app_list_actions.`);
  const spec = (catalogue.actions as Record<string, { parameters: {name:string;optional:boolean;schema:JsonSchema}[] }>)[action];
  for (const key of Object.keys(params)) if (!spec.parameters.some(p => p.name === key)) throw new Error(`Unknown parameter: ${key}`);
  const args = spec.parameters.map(p => {
    const value = params[p.name];
    if (value === undefined && p.optional) return undefined;
    validateArgument(value, p.schema, p.name); return value;
  });
  const fn = (store as unknown as Record<string, unknown>)[action];
  if (typeof fn !== 'function') throw new Error(`Action unavailable in this app version: ${action}`);
  const before = useAppStore.getState();
  try {
    const result = await fn(...args);
    if (action === 'undo' || action === 'redo') { if (Array.isArray(result)) useAppStore.setState({items:recalculateItems(result,store.schedule.tarieven)}); }
    const current = useAppStore.getState();
    if (current.items !== before.items && !['undo','redo'].includes(action) && current.undoStack === before.undoStack) current.pushHistory(before.items, `MCP: ${action}`);
    if (current.items !== before.items || current.schedule !== before.schedule || current.offerte !== before.offerte || current.subSheets !== before.subSheets || current.snapshots !== before.snapshots) {
      if (current.activeDocumentId) current.updateDocument(current.activeDocumentId,{isModified:true});
    }
    return { result:result ?? null, activeDocumentId:current.activeDocumentId };
  } catch(e) { throw new Error(`${action}: ${e instanceof Error ? e.message : String(e)}`); }
}
