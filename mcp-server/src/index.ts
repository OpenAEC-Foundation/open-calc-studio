#!/usr/bin/env node
/**
 * Open Calc Studio MCP Server
 *
 * Budget CRUD, PDF/IFC/IfcX export, recalculation via Model Context Protocol.
 * Keeps one budget in memory; load with open_budget, modify, then save_budget.
 *
 * Tools: open_budget, get_budget_summary, get_items, add_item, add_chapter,
 *        update_item, remove_item, save_budget, export_pdf, export_ifc,
 *        export_ifcx, recalculate, get_staart, update_schedule, list_report_types,
 *        create_budget_structure, import_uittrekstaat, lookup_reference_project
 *
 * Resources: budget://current, budget://schedule, budget://items
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, accessSync } from "node:fs";
import * as crypto from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import WebSocket from "ws";
import MDBReader from "mdb-reader";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

// ===========================================================================
// WebSocket Bridge to Tauri App (ws://127.0.0.1:9741)
// ===========================================================================

const WS_BRIDGE_URL = "ws://127.0.0.1:9741";
let wsBridge: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectBridge() {
  if (wsBridge && wsBridge.readyState === WebSocket.OPEN) return;
  try {
    const ws = new WebSocket(WS_BRIDGE_URL);
    ws.on("open", () => {
      console.error("[MCP Bridge] Connected to Tauri app at", WS_BRIDGE_URL);
      wsBridge = ws;
    });
    ws.on("message", (data) => {
      try {
        const resp = JSON.parse(data.toString());
        console.error("[MCP Bridge] Response:", resp.action, resp.success ? "OK" : resp.error);
      } catch { /* ignore */ }
    });
    ws.on("close", () => {
      console.error("[MCP Bridge] Disconnected from Tauri app");
      wsBridge = null;
      scheduleReconnect();
    });
    ws.on("error", () => {
      // Tauri app not running â€” silently retry later
      wsBridge = null;
      scheduleReconnect();
    });
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectBridge();
  }, 5000);
}

/** Send a mutation to the Tauri app via WebSocket (fire-and-forget). */
function sendBridgeMutation(action: string, data: Record<string, unknown> = {}) {
  if (!wsBridge || wsBridge.readyState !== WebSocket.OPEN) {
    // Try to connect for future mutations
    connectBridge();
    return;
  }
  try {
    wsBridge.send(JSON.stringify({ action, data }));
  } catch (e) {
    console.error("[MCP Bridge] Send error:", e);
  }
}

// Attempt initial connection
connectBridge();

// ===========================================================================
// Types (mirrored from src/types/costModel.ts to avoid browser deps)
// ===========================================================================

type CostUnit = 'st'|'m'|'m\u00B2'|'m\u00B3'|'kg'|'ton'|'uur'|'dgn'|'km'|'keer'|'ls'|'week'|'mnd'|'post'|'%'|'pm';
type RowType = 'chapter'|'begrotingspost'|'bewakingspost'|'regel'|'tekstregel'|'witregel'|'staart_ukk'|'staart_ak'|'staart_wr'|'staart_afronding'|'staart_ak_oa'|'staart_abk'|'staart_garanties'|'staart_wvpm'|'staart_risico'|'staart_winst'|'staart_verzekering'|'staart_btw';
type ResourceType = 'onderaannemer'|'materieel'|'materiaal'|'arbeid'|'overig';
type Verrekenbaarheid = 'V'|'A'|'N'|'F'|null;

interface CostItem {
  id: string; parentId: string | null; sortOrder: number;
  code: string; description: string; unit: CostUnit;
  quantity: number | null; materialPrice: number | null; laborPrice: number | null;
  unitPrice: number; total: number; isCollapsed: boolean; depth: number;
  notes: string; ifcGuid: string; rowType: RowType;
  staartPercentage: number | null; nr: string;
  normQuantity: number | null; normFactor: number | null;
  normDivisor: number | null; normUnitPrice: number | null;
  resourceType: ResourceType | null; resourceLibraryId: string | null;
  tariefGroep: 'A'|'B'|'C'|null; verrekenbaar: Verrekenbaarheid;
}

interface CostSchedule {
  id: string; name: string; description: string;
  status: 'DRAFT'|'FINAL'|'REVISED';
  predefinedType: 'BUDGET'|'ESTIMATE'|'TENDER';
  currency: string; projectName: string; projectNumber: string;
  client: string; author: string; ifcGuid: string;
  uitvoeringskosten: number; algemeneKosten: number; winstRisico: number;
  tarieven?: Record<string, number>;
  projectProperties?: Array<{ id: string; name: string; value: number | null; unit: string }>;
}

interface CompanyInfo {
  name: string; postalAddress: string; postalCity: string;
  visitAddress: string; visitCity: string;
  phone: string; fax: string; email: string;
}

interface ProjectFile {
  version: string; schedule: CostSchedule; items: CostItem[];
  resourceLibrary?: unknown[]; companyInfo: CompanyInfo;
  subSheets?: unknown[]; offerte?: unknown; snapshots?: unknown[];
  brandSlug?: string; createdAt: string; modifiedAt: string;
}

// ===========================================================================
// Helpers
// ===========================================================================

function isStagart(rt: RowType): boolean {
  return typeof rt === 'string' && rt.startsWith('staart_');
}

function isContainer(rt: RowType): boolean {
  return rt === 'chapter' || rt === 'begrotingspost' || rt === 'bewakingspost';
}

function ifcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

function ok(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] }; }
function err(msg: string) { return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const }; }

// ===========================================================================
// Calculator (faithful port of src/services/calculation/calculator.ts)
// ===========================================================================

function recalculateItems(items: CostItem[], tarieven?: Record<string, number>): CostItem[] {
  const result = items.map(item => ({ ...item }));

  // Recompute laborPrice from tariefGroep
  if (tarieven) {
    for (const item of result) {
      if (item.rowType === 'regel' && item.tariefGroep) {
        item.laborPrice = (item.normQuantity ?? 0) * (tarieven[item.tariefGroep] ?? 0);
      }
    }
  }

  // Build parent->children map
  const childrenMap = new Map<string | null, CostItem[]>();
  for (const item of result) {
    const list = childrenMap.get(item.parentId) ?? [];
    list.push(item);
    childrenMap.set(item.parentId, list);
  }

  // First pass: leaf items
  for (const item of result) {
    if (item.rowType === 'regel') {
      const qty = item.quantity ?? 0;
      const norm = item.normQuantity ?? 0;
      const cap = item.normFactor ?? 1;
      const nup = item.normUnitPrice ?? 0;
      const lab = item.laborPrice ?? 0;
      const hoeveelheid = qty * norm / (cap || 1);
      if (lab > 0 || norm === 0) {
        item.unitPrice = qty * (nup + lab);
      } else {
        item.unitPrice = hoeveelheid * nup;
      }
      item.total = item.unitPrice;
    } else if (item.rowType === 'begrotingspost') {
      const children = childrenMap.get(item.id) ?? [];
      if (children.length === 0) {
        const mat = item.materialPrice ?? 0;
        const lab = item.laborPrice ?? 0;
        item.unitPrice = mat + lab;
        item.total = (item.quantity ?? 0) * item.unitPrice;
      }
    }
  }

  // Second pass: bottom-up summation for containers
  function calcTotal(parentId: string): number {
    const children = childrenMap.get(parentId) ?? [];
    let sum = 0;
    for (const child of children) {
      if (child.rowType === 'chapter' || child.rowType === 'begrotingspost' || child.rowType === 'bewakingspost') {
        const cc = childrenMap.get(child.id) ?? [];
        if (cc.length > 0) {
          const childSum = calcTotal(child.id);
          child.total = childSum;
          if (child.rowType === 'bewakingspost') {
            child.unitPrice = cc.filter(c => !isStagart(c.rowType)).reduce((s, c) => s + (c.unitPrice ?? 0), 0);
          } else if (child.rowType === 'begrotingspost') {
            if (child.quantity != null && child.quantity !== 0) {
              child.unitPrice = childSum / child.quantity;
            } else {
              child.unitPrice = cc.filter(c => !isStagart(c.rowType)).reduce((s, c) => s + (c.unitPrice ?? 0), 0);
            }
          }
        }
      }
      if (!isStagart(child.rowType)) sum += child.total;
    }
    return sum;
  }

  for (const item of result) {
    if (item.parentId === null && !isStagart(item.rowType)) {
      const children = childrenMap.get(item.id) ?? [];
      if (children.length > 0) item.total = calcTotal(item.id);
    }
  }

  // Third pass: staartkosten (cascading surcharges)
  const totaalKolommen = result
    .filter(item => item.parentId === null && !isStagart(item.rowType))
    .reduce((sum, item) => sum + item.total, 0);

  const oaPortie = result
    .filter(item => item.rowType === 'regel' && item.resourceType === 'onderaannemer')
    .reduce((sum, item) => sum + item.total, 0);

  let kostprijs = totaalKolommen;
  let runningTotal = totaalKolommen;
  for (const item of result) {
    if (!isStagart(item.rowType)) continue;
    const pct = item.staartPercentage ?? 0;
    // Legacy types
    if (item.rowType === 'staart_ukk') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100); runningTotal = totaalKolommen + item.total; kostprijs = runningTotal;
    } else if (item.rowType === 'staart_ak') {
      const base = runningTotal;
      item.quantity = pct; item.unit = '%'; item.unitPrice = base / 100;
      item.total = base * (pct / 100); runningTotal += item.total; kostprijs = runningTotal;
    } else if (item.rowType === 'staart_wr') {
      const base = runningTotal;
      item.quantity = pct; item.unit = '%'; item.unitPrice = base / 100;
      item.total = base * (pct / 100); runningTotal += item.total;
    // Bouw 1 staart model: phase 1 (over totaal kolommen)
    } else if (item.rowType === 'staart_ak_oa') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = oaPortie / 100;
      item.total = oaPortie * (pct / 100); kostprijs = totaalKolommen + item.total; runningTotal = kostprijs;
    } else if (item.rowType === 'staart_abk') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100); kostprijs += item.total; runningTotal = kostprijs;
    } else if (item.rowType === 'staart_garanties') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100); kostprijs += item.total; runningTotal = kostprijs;
    } else if (item.rowType === 'staart_wvpm') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100); kostprijs += item.total; runningTotal = kostprijs;
    // Bouw 1 staart model: phase 2 (over kostprijs)
    } else if (item.rowType === 'staart_risico') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100); runningTotal += item.total;
    } else if (item.rowType === 'staart_winst') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100); runningTotal += item.total;
    } else if (item.rowType === 'staart_verzekering') {
      item.quantity = pct; item.unit = '%'; item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100); runningTotal += item.total;
    // Bouw 1 staart model: phase 3 (BTW over aanneemsom)
    } else if (item.rowType === 'staart_btw') {
      const aanneemsomExcl = runningTotal;
      item.quantity = pct; item.unit = '%'; item.unitPrice = aanneemsomExcl / 100;
      item.total = aanneemsomExcl * (pct / 100); runningTotal += item.total;
    // Afronding (shared)
    } else if (item.rowType === 'staart_afronding') {
      const rounded = Math.round(runningTotal / 10) * 10;
      item.total = rounded - runningTotal; item.quantity = null; item.unitPrice = 0;
      runningTotal = rounded;
    }
  }

  // Fourth pass: hierarchical Nr values
  const siblingGroups = new Map<string | null, CostItem[]>();
  for (const item of result) {
    const list = siblingGroups.get(item.parentId) ?? [];
    list.push(item);
    siblingGroups.set(item.parentId, list);
  }

  function assignNr(parentId: string | null, parentNr: string) {
    const siblings = siblingGroups.get(parentId) ?? [];
    let counter = 0;
    for (const item of siblings) {
      if (isStagart(item.rowType) || item.rowType === 'tekstregel' || item.rowType === 'witregel') {
        item.nr = ''; continue;
      }
      counter++;
      const segment = (!parentId && item.rowType === 'chapter' && item.code)
        ? item.code : String(counter).padStart(2, '0');
      item.nr = parentNr ? `${parentNr}.${segment}` : segment;
      if (isContainer(item.rowType)) assignNr(item.id, item.nr);
    }
  }
  assignNr(null, '');

  return result;
}

interface StaartBreakdown {
  kostprijs: number; ukkAmount: number; ukkPercentage: number; subtotaal1: number;
  akAmount: number; akPercentage: number; subtotaal2: number;
  wrAmount: number; wrPercentage: number;
  aanneemsom: number; afronding: number; aanneemsomAfgerond: number;
  totaalKolommen: number;
  akOaAmount: number; akOaPercentage: number;
  abkAmount: number; abkPercentage: number;
  garantiesAmount: number; garantiesPercentage: number;
  wvpmAmount: number; wvpmPercentage: number;
  kostprijsBouw1: number;
  risicoAmount: number; risicoPercentage: number;
  winstAmount: number; winstPercentage: number;
  verzekeringAmount: number; verzekeringPercentage: number;
  aanneemsomExcl: number;
  btwAmount: number; btwPercentage: number;
}

function getStaartBreakdown(items: CostItem[]): StaartBreakdown {
  const totaalKolommen = items
    .filter(i => i.parentId === null && !isStagart(i.rowType))
    .reduce((s, i) => s + i.total, 0);
  let uA = 0, uP = 0, aA = 0, aP = 0, wA = 0, wP = 0, af = 0;
  let aoA = 0, aoP = 0, abA = 0, abP = 0, gaA = 0, gaP = 0, wvA = 0, wvP = 0;
  let riA = 0, riP = 0, wiA = 0, wiP = 0, veA = 0, veP = 0, btA = 0, btP = 0;
  for (const i of items) {
    if (i.rowType === 'staart_ukk') { uA = i.total; uP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_ak') { aA = i.total; aP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_wr') { wA = i.total; wP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_ak_oa') { aoA = i.total; aoP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_abk') { abA = i.total; abP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_garanties') { gaA = i.total; gaP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_wvpm') { wvA = i.total; wvP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_risico') { riA = i.total; riP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_winst') { wiA = i.total; wiP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_verzekering') { veA = i.total; veP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_btw') { btA = i.total; btP = i.staartPercentage ?? 0; }
    if (i.rowType === 'staart_afronding') { af = i.total; }
  }
  const s1 = totaalKolommen + uA, s2 = s1 + aA;
  const kostprijsBouw1 = totaalKolommen + aoA + abA + gaA + wvA;
  const aanneemsomExcl = kostprijsBouw1 + riA + wiA + veA;
  const aanneemsom = s2 + wA + aoA + abA + gaA + wvA + riA + wiA + veA;
  return {
    kostprijs: totaalKolommen, totaalKolommen,
    ukkAmount: uA, ukkPercentage: uP, subtotaal1: s1,
    akAmount: aA, akPercentage: aP, subtotaal2: s2,
    wrAmount: wA, wrPercentage: wP,
    aanneemsom, afronding: af, aanneemsomAfgerond: aanneemsom + btA + af,
    akOaAmount: aoA, akOaPercentage: aoP,
    abkAmount: abA, abkPercentage: abP,
    garantiesAmount: gaA, garantiesPercentage: gaP,
    wvpmAmount: wvA, wvpmPercentage: wvP,
    kostprijsBouw1, risicoAmount: riA, risicoPercentage: riP,
    winstAmount: wiA, winstPercentage: wiP,
    verzekeringAmount: veA, verzekeringPercentage: veP,
    aanneemsomExcl, btwAmount: btA, btwPercentage: btP,
  };
}

// ===========================================================================
// File Service
// ===========================================================================

function deserializeProject(json: string): ProjectFile {
  const parsed = JSON.parse(json);
  if (!parsed.schedule || !Array.isArray(parsed.items)) throw new Error('Invalid file format');
  if (!parsed.version || parsed.version.startsWith('1.')) {
    parsed.version = '2.0.0';
    parsed.resourceLibrary = parsed.resourceLibrary ?? [];
  }

  // v0.6.2 migration: inject staart_* items if missing
  // (Required so live staart calculation has items to operate on.)
  const hasStaartItems = parsed.items.some(
    (it: any) => typeof it?.rowType === 'string' && it.rowType.startsWith('staart_'),
  );
  if (!hasStaartItems) {
    parsed.items = [...parsed.items, ...synthesizeStaartItems(parsed.schedule)];
  }

  return parsed as ProjectFile;
}

function makeStaartItem(rowType: string, description: string, pct: number | null, sortOrder: number): any {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    sortOrder,
    code: '',
    description,
    unit: pct !== null ? '%' : 'st',
    quantity: pct,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: '',
    rowType,
    staartPercentage: pct,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
  };
}

function synthesizeStaartItems(schedule: any): any[] {
  const cachedRows = schedule?.staartRows as any[] | undefined;
  const findPct = (label: string): number | null => {
    if (!cachedRows) return null;
    const row = cachedRows.find((r) => (r.label ?? '').toLowerCase().includes(label.toLowerCase()));
    return row?.percentage ?? null;
  };
  let n = 9000;
  return [
    makeStaartItem('staart_ak_oa',       'Algemene kosten over onderaanneming:', findPct('algemene kosten over onderaanneming') ?? 9, n++),
    makeStaartItem('staart_abk',         'Algemene bedrijfskosten:',              findPct('algemene bedrijfskosten') ?? 6, n++),
    makeStaartItem('staart_garanties',   'Garanties:',                            findPct('garantie') ?? 2, n++),
    makeStaartItem('staart_wvpm',        'Werkvoorbereiding & projectmanagement', findPct('werkvoorbereiding') ?? 2, n++),
    makeStaartItem('staart_risico',      'Risico:',                               findPct('risico') ?? 3, n++),
    makeStaartItem('staart_winst',       'Winst:',                                findPct('winst') ?? 5, n++),
    makeStaartItem('staart_verzekering', 'Verzekering:',                          findPct('verzekering') ?? 0.5, n++),
    makeStaartItem('staart_btw',         'Btw hoog:',                             findPct('btw hoog') ?? findPct('btw') ?? 21, n++),
    makeStaartItem('staart_afronding',   'Afronding',                             null, n++),
  ];
}

// ===========================================================================
// IFC STEP Generator (simplified from src/services/ifc/ifcCostGenerator.ts)
// ===========================================================================

function encodeStep(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7E]/g, ch => {
    const c = ch.charCodeAt(0);
    return c > 0xFF ? '\\X2\\' + c.toString(16).toUpperCase().padStart(4, '0') + '\\X0\\'
      : '\\X\\' + c.toString(16).toUpperCase().padStart(2, '0');
  });
}

function stepFloat(v: number): string { const s = v.toString(); return s.includes('.') ? s : s + '.'; }

function generateIfcStep(schedule: CostSchedule, items: CostItem[]): string {
  interface L { id: number; entity: string }
  const lines: L[] = []; let nextId = 1; const gid = () => nextId++;
  const ts = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

  const hdr = [
    "ISO-10303-21;", "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [CostView]'),'2;1');`,
    `FILE_NAME('${encodeStep(schedule.name)}.ifc','${ts}',('${encodeStep(schedule.author)}'),(''),'',' ','');`,
    "FILE_SCHEMA(('IFC4X3'));", "ENDSEC;", "DATA;",
  ].join('\n');

  const orgId = gid(); lines.push({ id: orgId, entity: `IFCORGANIZATION($,'Open Calc Studio',$,$,$)` });
  const appId = gid(); lines.push({ id: appId, entity: `IFCAPPLICATION(#${orgId},'1.0.0','Open Calc Studio','OCS')` });
  const persId = gid(); lines.push({ id: persId, entity: `IFCPERSON($,'${encodeStep(schedule.author)}','',$,$,$,$,$)` });
  const poId = gid(); lines.push({ id: poId, entity: `IFCPERSONANDORGANIZATION(#${persId},#${orgId},$)` });
  const ohId = gid(); lines.push({ id: ohId, entity: `IFCOWNERHISTORY(#${poId},#${appId},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})` });

  const units: [string,string][] = [['LENGTHUNIT','METRE'],['AREAUNIT','SQUARE_METRE'],['VOLUMEUNIT','CUBIC_METRE'],['TIMEUNIT','SECOND'],['MASSUNIT','GRAM']];
  const uids = units.map(([u,b]) => { const i = gid(); lines.push({ id: i, entity: `IFCSIUNIT(*,.${u}.,$,.${b}.)` }); return i; });
  const muid = gid(); lines.push({ id: muid, entity: `IFCMONETARYUNIT('EUR')` });
  const uaid = gid(); lines.push({ id: uaid, entity: `IFCUNITASSIGNMENT((${uids.map(u=>`#${u}`).join(',')},#${muid}))` });

  const prid = gid(); lines.push({ id: prid, entity: `IFCPROJECT('${schedule.ifcGuid}',#${ohId},'${encodeStep(schedule.projectName)}','${encodeStep(schedule.description)}',$,$,$,(#${uaid}),$)` });
  const scid = gid(); lines.push({ id: scid, entity: `IFCCOSTSCHEDULE('${ifcGuid()}',#${ohId},'${encodeStep(schedule.name)}','${encodeStep(schedule.description)}',$,$,$,$,$,.${schedule.predefinedType}.,.${schedule.status}.,${stepFloat(0)})` });

  const imap = new Map<string, number>();
  for (const item of items) {
    const cid = gid(); imap.set(item.id, cid);
    lines.push({ id: cid, entity: `IFCCOSTITEM('${item.ifcGuid}',#${ohId},'${encodeStep(item.code)}','${encodeStep(item.description)}',$,$,$)` });
    const pid2 = gid(); lines.push({ id: pid2, entity: `IFCPROPERTYSINGLEVALUE('rowType',$,IFCLABEL('${item.rowType}'),$)` });
    const psid = gid(); lines.push({ id: psid, entity: `IFCPROPERTYSET('${ifcGuid()}',#${ohId},'OCS_ItemProperties','',(#${pid2}))` });
    const rdid = gid(); lines.push({ id: rdid, entity: `IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',#${ohId},$,$,(#${cid}),#${psid})` });
  }

  const cbp = new Map<string | null, CostItem[]>();
  for (const item of items) { const l = cbp.get(item.parentId) ?? []; l.push(item); cbp.set(item.parentId, l); }
  const tops = cbp.get(null) ?? [];
  if (tops.length > 0) { const rid = gid(); lines.push({ id: rid, entity: `IFCRELNESTS('${ifcGuid()}',#${ohId},$,$,#${scid},(${tops.map(i=>`#${imap.get(i.id)}`).join(',')}))` }); }
  for (const [pid, ch] of cbp) {
    if (pid === null) continue;
    const psid = imap.get(pid); if (!psid) continue;
    const rid = gid(); lines.push({ id: rid, entity: `IFCRELNESTS('${ifcGuid()}',#${ohId},$,$,#${psid},(${ch.map(i=>`#${imap.get(i.id)}`).join(',')}))` });
  }

  return `${hdr}\n${lines.map(l=>`#${l.id}=${l.entity};`).join('\n')}\nENDSEC;\nEND-ISO-10303-21;`;
}

// ===========================================================================
// IfcX JSON Generator (simplified from src/services/ifc/ifcxJsonGenerator.ts)
// ===========================================================================

function pseg(s: string): string { return s.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim() || 'unnamed'; }

interface IfcxNode {
  path: string; inherits: string[]; attributes: Record<string, unknown>;
  children?: Record<string, IfcxNode>;
}

function buildNode(item: CostItem, pp: string, cmap: Map<string, CostItem[]>): IfcxNode {
  const code = item.code || item.nr || item.id.slice(0, 8);
  const np = `${pp}/${pseg(code)}`;
  const a: Record<string, unknown> = {
    'bsi::ifc::prop::Name': item.code || '',
    'bsi::ifc::prop::Description': item.description || '',
    'ifcx::ocs::rowType': item.rowType,
    'ifcx::ocs::ifcGuid': item.ifcGuid,
  };
  if (item.quantity != null && item.quantity !== 0)
    a['bsi::ifc::prop::Quantity'] = { value: item.quantity, unit: item.unit || 'st' };
  if (item.rowType !== 'chapter') {
    if (item.materialPrice) a['ifcx::cost::materialPrice'] = item.materialPrice;
    if (item.laborPrice) a['ifcx::cost::laborPrice'] = item.laborPrice;
    if (item.unitPrice) a['ifcx::cost::unitPrice'] = item.unitPrice;
    if (item.total) a['ifcx::cost::total'] = item.total;
  }
  if (item.rowType === 'regel' && (item.normQuantity != null || item.normFactor != null || item.normUnitPrice != null)) {
    a['ifcx::ocs::normCalculation'] = {
      ...(item.normQuantity != null ? { quantity: item.normQuantity } : {}),
      ...(item.normFactor != null ? { factor: item.normFactor } : {}),
      ...(item.normUnitPrice != null ? { unitPrice: item.normUnitPrice } : {}),
    };
  }
  if (item.staartPercentage != null && isStagart(item.rowType)) a['ifcx::cost::staartPercentage'] = item.staartPercentage;
  if (item.tariefGroep) a['ifcx::ocs::tariefGroep'] = item.tariefGroep;
  if (item.resourceType) a['ifcx::ocs::resourceType'] = item.resourceType;
  if (item.verrekenbaar) a['ifcx::ocs::verrekenbaar'] = item.verrekenbaar;

  const node: IfcxNode = { path: np, inherits: ['IfcCostItem'], attributes: a };
  const ch = cmap.get(item.id);
  if (ch && ch.length > 0) {
    node.children = {};
    for (const c of [...ch].sort((x, y) => x.sortOrder - y.sortOrder)) {
      node.children[pseg(c.code || c.nr || c.id.slice(0, 8))] = buildNode(c, np, cmap);
    }
  }
  return node;
}

function generateIfcxJson(schedule: CostSchedule, items: CostItem[]): string {
  const pn = pseg(schedule.projectName || schedule.name || 'Project');
  const sn = pseg(schedule.name || 'CostSchedule');
  const cmap = new Map<string, CostItem[]>();
  for (const item of items) {
    if (item.parentId) {
      const l = cmap.get(item.parentId) ?? [];
      l.push(item);
      cmap.set(item.parentId, l);
    }
  }
  const tops = items.filter(i => i.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder);
  const sp = `/Project/${pn}/CostSchedules/${sn}`;
  const sa: Record<string, unknown> = {
    'bsi::ifc::prop::Name': schedule.name,
    'bsi::ifc::prop::Description': schedule.description || '',
    'bsi::ifc::prop::PredefinedType': schedule.predefinedType,
    'bsi::ifc::prop::Status': schedule.status,
    'bsi::ifc::prop::Identification': schedule.projectNumber || '',
    'ifcx::cost::currency': { currency: schedule.currency || 'EUR', vatRate: 21, vatIncluded: false },
  };
  if (schedule.tarieven && Object.keys(schedule.tarieven).length > 0) {
    sa['ifcx::cost::metadata'] = {
      tarieven: schedule.tarieven,
      uitvoeringskosten: schedule.uitvoeringskosten,
      algemeneKosten: schedule.algemeneKosten,
      winstRisico: schedule.winstRisico,
    };
  }
  const ciChildren: Record<string, IfcxNode> = {};
  for (const item of tops) {
    ciChildren[pseg(item.code || item.nr || item.id.slice(0, 8))] = buildNode(item, `${sp}/CostItems`, cmap);
  }
  const sNode: IfcxNode = { path: sp, inherits: ['IfcCostSchedule'], attributes: sa };
  if (Object.keys(ciChildren).length > 0) sNode.children = ciChildren;

  return JSON.stringify({
    header: {
      id: crypto.randomUUID(), version: 'ifcx_alpha',
      author: 'Open Calc Studio', timestamp: new Date().toISOString(),
      description: `Cost schedule export: ${schedule.name}`,
    },
    imports: [{ uri: 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx' }],
    schemas: {},
    data: [{
      path: `/Project/${pn}`, inherits: ['IfcProject'],
      attributes: {
        'bsi::ifc::prop::Name': schedule.projectName || schedule.name,
        'bsi::ifc::prop::Description': schedule.description || '',
        'bsi::ifc::prop::Author': schedule.author || '',
        'bsi::ifc::prop::Client': schedule.client || '',
      },
      children: { CostSchedules: sNode },
    }],
  }, null, 2);
}

// ===========================================================================
// Budget State (in-memory)
// ===========================================================================

let currentBudget: {
  filePath: string;
  project: ProjectFile;
  items: CostItem[];
  schedule: CostSchedule;
} | null = null;

function req() {
  if (!currentBudget) throw new Error('No budget open. Use open_budget first.');
  return currentBudget;
}

function doRecalc() {
  const b = req();
  b.items = recalculateItems(b.items, b.schedule.tarieven);
  return b.items;
}

function itemSummary(i: CostItem) {
  return {
    id: i.id, parentId: i.parentId, nr: i.nr, code: i.code,
    description: i.description, rowType: i.rowType, unit: i.unit,
    quantity: i.quantity, materialPrice: i.materialPrice,
    laborPrice: i.laborPrice, unitPrice: i.unitPrice, total: i.total,
    normQuantity: i.normQuantity, normFactor: i.normFactor,
    normUnitPrice: i.normUnitPrice, resourceType: i.resourceType,
    tariefGroep: i.tariefGroep, staartPercentage: i.staartPercentage,
    verrekenbaar: i.verrekenbaar, depth: i.depth,
  };
}

function nextSort(parentId: string | null): number {
  const sibs = req().items.filter(i => i.parentId === parentId);
  return sibs.length > 0 ? Math.max(...sibs.map(i => i.sortOrder)) + 1 : 0;
}

function depthOf(parentId: string | null): number {
  if (!parentId) return 0;
  const p = req().items.find(i => i.id === parentId);
  return p ? p.depth + 1 : 0;
}

function makeItem(opts: {
  parentId: string | null; rowType: RowType; description: string;
  code?: string; quantity?: number | null; unit?: CostUnit;
  normUnitPrice?: number | null; staartPercentage?: number | null;
}): CostItem {
  return {
    id: crypto.randomUUID(), parentId: opts.parentId, sortOrder: nextSort(opts.parentId),
    code: opts.code ?? '', description: opts.description, unit: opts.unit ?? 'st',
    quantity: opts.quantity ?? null, materialPrice: null, laborPrice: null,
    unitPrice: 0, total: 0, isCollapsed: false, depth: depthOf(opts.parentId),
    notes: '', ifcGuid: ifcGuid(), rowType: opts.rowType,
    staartPercentage: opts.staartPercentage ?? null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null,
    normUnitPrice: opts.normUnitPrice ?? null,
    resourceType: null, resourceLibraryId: null, tariefGroep: null,
    verrekenbaar: opts.rowType === 'chapter' ? 'V' : null,
  };
}

// ===========================================================================
// MCP Server
// ===========================================================================

const server = new McpServer({
  name: "open-calc-studio",
  version: "1.0.0",
});

// â”€â”€ Resources â”€â”€

server.resource('budget://current', 'budget://current', async (uri) => {
  if (!currentBudget) return { contents: [{ uri: uri.href, mimeType: 'application/json', text: '{"error":"No budget open"}' }] };
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: generateIfcxJson(currentBudget.schedule, currentBudget.items) }] };
});

server.resource('budget://schedule', 'budget://schedule', async (uri) => {
  if (!currentBudget) return { contents: [{ uri: uri.href, mimeType: 'application/json', text: '{"error":"No budget open"}' }] };
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(currentBudget.schedule, null, 2) }] };
});

server.resource('budget://items', 'budget://items', async (uri) => {
  if (!currentBudget) return { contents: [{ uri: uri.href, mimeType: 'application/json', text: '{"error":"No budget open"}' }] };
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(currentBudget.items.map(itemSummary), null, 2) }] };
});

// â”€â”€ Tools â”€â”€

server.tool("open_budget", "Open an .ifcx budget file and load it into memory", {
  filePath: z.string().describe("Path to the budget file"),
}, async ({ filePath }) => {
  try {
    const p = resolve(filePath);
    const project = deserializeProject(readFileSync(p, 'utf-8'));
    const items = recalculateItems(project.items, project.schedule.tarieven);
    currentBudget = { filePath: p, project, items, schedule: project.schedule };

    const bd = getStaartBreakdown(items);
    const chapters = items.filter(i => i.parentId === null && i.rowType === 'chapter')
      .map(c => ({ nr: c.nr, code: c.code, description: c.description, total: c.total }));

    // Push full budget to Tauri app
    sendBridgeMutation("open_budget", { schedule: project.schedule, items, fileName: project.schedule.name || project.schedule.projectName || basename(p), filePath: p });

    return ok({
      success: true, filePath: p,
      name: project.schedule.name, projectName: project.schedule.projectName,
      itemCount: items.length, chapterCount: chapters.length, chapters,
      grandTotal: bd.aanneemsomAfgerond, kostprijs: bd.kostprijs,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_budget_summary", "Get current budget overview with chapter totals and staartkosten", {}, async () => {
  try {
    const b = req();
    const bd = getStaartBreakdown(b.items);
    const chapters = b.items.filter(i => i.parentId === null && i.rowType === 'chapter')
      .map(c => ({ nr: c.nr, code: c.code, description: c.description, total: c.total }));
    const staartItems = b.items.filter(i => isStagart(i.rowType))
      .map(i => ({ rowType: i.rowType, description: i.description, percentage: i.staartPercentage, total: i.total }));
    return ok({
      schedule: {
        name: b.schedule.name, projectName: b.schedule.projectName,
        projectNumber: b.schedule.projectNumber, client: b.schedule.client,
        author: b.schedule.author, status: b.schedule.status,
        predefinedType: b.schedule.predefinedType,
      },
      chapters, staartItems, breakdown: bd, itemCount: b.items.length,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_items", "List budget items with optional filter", {
  parentId: z.string().optional().describe("Filter by parent ID ('root' for top-level)"),
  rowType: z.string().optional().describe("Filter by rowType"),
  search: z.string().optional().describe("Search in description/code"),
}, async ({ parentId, rowType, search }) => {
  try {
    let f = req().items;
    if (parentId !== undefined) {
      const pid = parentId === 'root' ? null : parentId;
      f = f.filter(i => i.parentId === pid);
    }
    if (rowType) f = f.filter(i => i.rowType === rowType);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(i => i.description.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return ok({ count: f.length, items: f.map(itemSummary) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("add_item", "Add a cost item (begrotingspost, bewakingspost, or regel)", {
  parentId: z.string().describe("Parent item ID ('root' for top-level)"),
  rowType: z.enum(['begrotingspost', 'bewakingspost', 'regel', 'tekstregel', 'witregel']).describe("Row type"),
  description: z.string().describe("Item description"),
  quantity: z.number().optional().describe("Quantity"),
  unit: z.string().optional().describe("Unit (st, m, m2, m3, kg, uur, etc.)"),
  normUnitPrice: z.number().optional().describe("Material unit price (for regel rows)"),
  normQuantity: z.number().optional().describe("Labor hours per unit (norm). Auto-sets tariefGroep to A if not specified."),
  tariefGroep: z.string().optional().describe("Tariff group (A=66/hr, B=46/hr, C=82/hr)"),
  resourceType: z.string().optional().describe("Resource type (onderaannemer, materieel, materiaal, arbeid, overig)"),
  code: z.string().optional().describe("Item code"),
}, async ({ parentId, rowType, description, quantity, unit, normUnitPrice, normQuantity, tariefGroep, resourceType, code }) => {
  try {
    const b = req();
    const pid = parentId === 'root' ? null : parentId;
    if (pid !== null) {
      const parent = b.items.find(i => i.id === pid);
      if (!parent) throw new Error(`Parent "${parentId}" not found`);
      if (!isContainer(parent.rowType)) throw new Error(`Parent "${parentId}" (${parent.rowType}) cannot have children`);
    }
    const item = makeItem({
      parentId: pid, rowType: rowType as RowType, description,
      quantity, unit: (unit as CostUnit) ?? 'st', normUnitPrice, code,
    });
    if (normQuantity != null) {
      item.normQuantity = normQuantity;
      item.tariefGroep = (tariefGroep as 'A'|'B'|'C') ?? 'A';
    }
    if (tariefGroep) item.tariefGroep = tariefGroep as 'A'|'B'|'C';
    if (resourceType) item.resourceType = resourceType as ResourceType;
    b.items.push(item);
    doRecalc();

    // Push full state to Tauri app (simplest approach for correct recalculation)
    sendBridgeMutation("set_items", { items: b.items });

    return ok({ success: true, item: itemSummary(b.items.find(i => i.id === item.id)!) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("update_item", "Update a cost item by ID", {
  id: z.string().describe("Item ID"),
  changes: z.object({
    description: z.string().optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().optional(),
    normUnitPrice: z.number().nullable().optional(),
    materialPrice: z.number().nullable().optional(),
    laborPrice: z.number().nullable().optional(),
    code: z.string().optional(),
    normQuantity: z.number().nullable().optional(),
    normFactor: z.number().nullable().optional(),
    normDivisor: z.number().nullable().optional(),
    resourceType: z.string().nullable().optional(),
    tariefGroep: z.string().nullable().optional(),
    staartPercentage: z.number().nullable().optional(),
    verrekenbaar: z.string().nullable().optional(),
  }).describe("Fields to update"),
}, async ({ id, changes }) => {
  try {
    const b = req();
    const item = b.items.find(i => i.id === id);
    if (!item) throw new Error(`Item "${id}" not found`);
    if (changes.description !== undefined) item.description = changes.description;
    if (changes.quantity !== undefined) item.quantity = changes.quantity;
    if (changes.unit !== undefined) item.unit = changes.unit as CostUnit;
    if (changes.normUnitPrice !== undefined) item.normUnitPrice = changes.normUnitPrice;
    if (changes.materialPrice !== undefined) item.materialPrice = changes.materialPrice;
    if (changes.laborPrice !== undefined) item.laborPrice = changes.laborPrice;
    if (changes.code !== undefined) item.code = changes.code;
    if (changes.normQuantity !== undefined) item.normQuantity = changes.normQuantity;
    if (changes.normFactor !== undefined) item.normFactor = changes.normFactor;
    if (changes.normDivisor !== undefined) item.normDivisor = changes.normDivisor;
    if (changes.resourceType !== undefined) item.resourceType = changes.resourceType as ResourceType | null;
    if (changes.tariefGroep !== undefined) item.tariefGroep = changes.tariefGroep as 'A'|'B'|'C'|null;
    if (changes.staartPercentage !== undefined) item.staartPercentage = changes.staartPercentage;
    if (changes.verrekenbaar !== undefined) item.verrekenbaar = changes.verrekenbaar as Verrekenbaarheid;
    doRecalc();

    // Push full state to Tauri app
    sendBridgeMutation("set_items", { items: b.items });

    return ok({ success: true, item: itemSummary(b.items.find(i => i.id === id)!) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("remove_item", "Remove a cost item and all its descendants", {
  id: z.string().describe("Item ID to remove"),
}, async ({ id }) => {
  try {
    const b = req();
    if (!b.items.find(i => i.id === id)) throw new Error(`Item "${id}" not found`);
    const rm = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of b.items) {
        if (i.parentId && rm.has(i.parentId) && !rm.has(i.id)) { rm.add(i.id); changed = true; }
      }
    }
    b.items = b.items.filter(i => !rm.has(i.id));
    doRecalc();

    // Push full state to Tauri app
    sendBridgeMutation("set_items", { items: b.items });

    return ok({ success: true, removedCount: rm.size, removedIds: [...rm] });
  } catch (e: unknown) { return err((e as Error).message); }
});

// â”€â”€ Staartkosten (tail costs / markups) â”€â”€

/** Ensure standard Bouw 1 staart items exist. If none present, add them. */
function ensureBouw1Staart() {
  const b = req();
  const hasStaart = b.items.some(i => i.rowType.startsWith('staart_'));
  if (hasStaart) return;
  for (const def of BOUW1_STAART) {
    const item = makeItem({
      parentId: null, rowType: def.rowType, description: def.description,
      unit: '%', quantity: def.percentage, staartPercentage: def.percentage,
    });
    item.staartPercentage = def.percentage;
    b.items.push(item);
  }
}

const BOUW1_STAART = [
  { rowType: 'staart_ak_oa' as RowType, description: 'Algemene kosten over onderaanneming:', percentage: 9 },
  { rowType: 'staart_abk' as RowType, description: 'Algemene bedrijfskosten:', percentage: 6 },
  { rowType: 'staart_garanties' as RowType, description: 'Garanties:', percentage: 2 },
  { rowType: 'staart_wvpm' as RowType, description: 'Werkvoorbereiding & projectmanagement', percentage: 2 },
  { rowType: 'staart_risico' as RowType, description: 'Risico:', percentage: 3 },
  { rowType: 'staart_winst' as RowType, description: 'Winst:', percentage: 5 },
  { rowType: 'staart_verzekering' as RowType, description: 'Verzekering:', percentage: 0.5 },
  { rowType: 'staart_btw' as RowType, description: 'Btw hoog:', percentage: 21 },
  { rowType: 'staart_afronding' as RowType, description: 'Afronding', percentage: null },
];

server.tool("set_staart", "Set staartkosten (tail costs / markups). Use preset='bouw1' for standard percentages, or provide custom items.", {
  preset: z.enum(['bouw1', 'custom']).optional().default('bouw1').describe("Preset: 'bouw1' for Bouw 1 standard percentages, 'custom' for manual"),
  items: z.array(z.object({
    rowType: z.string().describe("Staart row type (staart_ak_oa, staart_abk, staart_garanties, staart_wvpm, staart_risico, staart_winst, staart_verzekering, staart_btw, staart_afronding)"),
    description: z.string().describe("Label"),
    percentage: z.number().nullable().describe("Percentage (null for afronding)"),
  })).optional().describe("Custom staart items (only used when preset='custom')"),
}, async ({ preset, items: customItems }) => {
  try {
    const b = req();

    // Remove existing staart items
    b.items = b.items.filter(i => !i.rowType.startsWith('staart_'));

    // Choose staart definition
    const staartDef = preset === 'custom' && customItems
      ? customItems.map(ci => ({ rowType: ci.rowType as RowType, description: ci.description, percentage: ci.percentage }))
      : BOUW1_STAART;

    // Add staart items
    for (const def of staartDef) {
      const item = makeItem({
        parentId: null, rowType: def.rowType, description: def.description,
        unit: '%', quantity: def.percentage, staartPercentage: def.percentage,
      });
      item.staartPercentage = def.percentage;
      b.items.push(item);
    }

    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });

    const staartItems = b.items.filter(i => i.rowType.startsWith('staart_'));
    return ok({
      success: true,
      preset: preset ?? 'bouw1',
      staartItems: staartItems.map(i => ({
        rowType: i.rowType,
        description: i.description,
        percentage: i.staartPercentage,
        total: i.total,
      })),
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("add_chapter", "Add a chapter (hoofdstuk) to the budget", {
  description: z.string().describe("Chapter description"),
  code: z.string().optional().describe("Chapter code (e.g. '10', '20')"),
  parentId: z.string().optional().describe("Parent chapter ID for sub-chapters ('root' or omit for top-level)"),
}, async ({ description, code, parentId }) => {
  try {
    const b = req();
    const pid = (!parentId || parentId === 'root') ? null : parentId;
    if (pid !== null) {
      const parent = b.items.find(i => i.id === pid);
      if (!parent) throw new Error(`Parent "${parentId}" not found`);
      if (parent.rowType !== 'chapter') throw new Error('Chapters can only nest under other chapters');
    }
    const item = makeItem({ parentId: pid, rowType: 'chapter', description, code });
    // Insert before staart items at top level
    if (pid === null) {
      const firstStagart = b.items.findIndex(i => i.parentId === null && isStagart(i.rowType));
      if (firstStagart >= 0) b.items.splice(firstStagart, 0, item);
      else b.items.push(item);
    } else {
      b.items.push(item);
    }
    doRecalc();

    // Push full state to Tauri app
    sendBridgeMutation("set_items", { items: b.items });

    return ok({ success: true, chapter: itemSummary(b.items.find(i => i.id === item.id)!) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("save_budget", "Save current budget to an .ifcx file", {
  filePath: z.string().optional().describe("Output path (uses current path if omitted)"),
}, async ({ filePath }) => {
  try {
    const b = req();
    const out = filePath ? resolve(filePath) : b.filePath;
    if (!out) throw new Error('No file path specified');
    const pf: ProjectFile = {
      version: '2.0.0', schedule: b.schedule, items: b.items,
      resourceLibrary: b.project.resourceLibrary ?? [],
      companyInfo: b.project.companyInfo,
      subSheets: b.project.subSheets ?? [],
      offerte: b.project.offerte,
      snapshots: b.project.snapshots,
      brandSlug: b.project.brandSlug,
      createdAt: b.project.createdAt,
      modifiedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(pf, null, 2);
    writeFileSync(out, json, 'utf-8');
    b.filePath = out;
    return ok({ success: true, filePath: out, size: json.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("export_ifc", "Export current budget as IFC STEP format (IFC4X3)", {}, async () => {
  try {
    return ok({ format: 'IFC4X3 STEP', content: generateIfcStep(req().schedule, req().items) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("export_ifcx", "Export current budget as IfcX JSON format (IFC5-development alpha)", {}, async () => {
  try {
    return { content: [{ type: "text" as const, text: generateIfcxJson(req().schedule, req().items) }] };
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("recalculate", "Recalculate all totals, staartkosten, and hierarchical numbering", {}, async () => {
  try {
    doRecalc();
    const bd = getStaartBreakdown(req().items);

    // Push full state to Tauri app
    sendBridgeMutation("set_items", { items: req().items });

    return ok({ success: true, grandTotal: bd.aanneemsomAfgerond, kostprijs: bd.kostprijs, breakdown: bd });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_staart", "Get staartkosten/opslagen (UKK, AK, W&R, afronding)", {}, async () => {
  try {
    const b = req();
    const staartItems = b.items.filter(i => isStagart(i.rowType))
      .map(i => ({ id: i.id, rowType: i.rowType, description: i.description, percentage: i.staartPercentage, total: i.total }));
    return ok({ staartItems, breakdown: getStaartBreakdown(b.items) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("update_schedule", "Update schedule/project metadata", {
  name: z.string().optional().describe("Schedule name"),
  projectName: z.string().optional().describe("Project name"),
  projectNumber: z.string().optional().describe("Project number"),
  client: z.string().optional().describe("Client name"),
  author: z.string().optional().describe("Author name"),
  description: z.string().optional().describe("Schedule description"),
  algemeneKosten: z.number().optional().describe("Algemene kosten percentage"),
  winstRisico: z.number().optional().describe("Winst & risico percentage"),
  uitvoeringskosten: z.number().optional().describe("Uitvoeringskosten percentage"),
}, async (changes) => {
  try {
    const b = req();
    const s = b.schedule;
    if (changes.name !== undefined) s.name = changes.name;
    if (changes.projectName !== undefined) s.projectName = changes.projectName;
    if (changes.projectNumber !== undefined) s.projectNumber = changes.projectNumber;
    if (changes.client !== undefined) s.client = changes.client;
    if (changes.author !== undefined) s.author = changes.author;
    if (changes.description !== undefined) s.description = changes.description;
    if (changes.algemeneKosten !== undefined) s.algemeneKosten = changes.algemeneKosten;
    if (changes.winstRisico !== undefined) s.winstRisico = changes.winstRisico;
    if (changes.uitvoeringskosten !== undefined) s.uitvoeringskosten = changes.uitvoeringskosten;
    // Sync staart items
    if (changes.uitvoeringskosten !== undefined) { const u = b.items.find(i => i.rowType === 'staart_ukk'); if (u) u.staartPercentage = changes.uitvoeringskosten; }
    if (changes.algemeneKosten !== undefined) { const a = b.items.find(i => i.rowType === 'staart_ak'); if (a) a.staartPercentage = changes.algemeneKosten; }
    if (changes.winstRisico !== undefined) { const w = b.items.find(i => i.rowType === 'staart_wr'); if (w) w.staartPercentage = changes.winstRisico; }
    doRecalc();

    // Push schedule and items to Tauri app
    sendBridgeMutation("update_schedule", {
      name: s.name, projectName: s.projectName, projectNumber: s.projectNumber,
      client: s.client, author: s.author, description: s.description,
      algemeneKosten: s.algemeneKosten, winstRisico: s.winstRisico,
      uitvoeringskosten: s.uitvoeringskosten,
    });
    sendBridgeMutation("set_items", { items: b.items });

    return ok({
      success: true,
      schedule: { name: s.name, projectName: s.projectName, projectNumber: s.projectNumber,
        client: s.client, author: s.author, status: s.status,
        algemeneKosten: s.algemeneKosten, winstRisico: s.winstRisico, uitvoeringskosten: s.uitvoeringskosten },
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("export_pdf", "Generate a PDF report from the current budget", {
  outputPath: z.string().describe("Output PDF path"),
  reportView: z.enum(["werkbeschrijving", "hoofdaanneming", "onderaanneming", "inschrijfstaat", "nacalculatie", "bouw1", "offerte"]).optional().default("bouw1").describe("Report view"),
}, async ({ outputPath, reportView }) => {
  try {
    const b = req();
    // Save to temp file, run gen_pdf, return
    const tmp = b.filePath.replace(/\.[^.]+$/, '_mcp_tmp.ifcx');
    writeFileSync(tmp, JSON.stringify({
      version: '2.0.0', schedule: b.schedule, items: b.items,
      resourceLibrary: [], companyInfo: b.project.companyInfo,
      createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
    }, null, 2));
    const bins = [
      join(REPO_ROOT, "src-tauri/target/release/gen_pdf.exe"),
      join(REPO_ROOT, "src-tauri/target/debug/gen_pdf.exe"),
      join(REPO_ROOT, "src-tauri/target/release/gen_pdf"),
      join(REPO_ROOT, "src-tauri/target/debug/gen_pdf"),
    ];
    let bin: string | null = null;
    for (const c of bins) { try { accessSync(c); bin = c; break; } catch { /* skip */ } }
    if (!bin) {
      try { accessSync(tmp); require('node:fs').unlinkSync(tmp); } catch { /* skip */ }
      return err("gen_pdf not found. Build: cd src-tauri && cargo build --bin gen_pdf");
    }
    await execFileAsync(bin, [tmp, resolve(outputPath), '--report-view', reportView ?? 'bouw1'], {
      timeout: 60000, cwd: REPO_ROOT,
      env: { ...process.env, OCS_REPORT_VIEW: reportView ?? 'bouw1' },
    });
    try { require('node:fs').unlinkSync(tmp); } catch { /* skip */ }
    return ok({ success: true, pdfPath: resolve(outputPath) });
  } catch (e: unknown) { return err((e as Error).message); }
});

// â”€â”€ Batch / Smart Tools â”€â”€

server.tool("create_budget_structure", "Create a complete hierarchical budget structure in one call (chapters with posts and rules)", {
  chapters: z.array(z.object({
    code: z.string().optional().describe("Chapter code (e.g. '01', '10')"),
    description: z.string().describe("Chapter title"),
    posts: z.array(z.object({
      code: z.string().optional().describe("Post code"),
      description: z.string().describe("Post description"),
      quantity: z.number().optional().describe("Post quantity"),
      unit: z.string().optional().describe("Unit (st, m, m2, m3, kg, uur, etc.)"),
      rules: z.array(z.object({
        description: z.string().describe("Rule description"),
        quantity: z.number().optional().describe("Quantity"),
        unit: z.string().optional().describe("Unit"),
        normUnitPrice: z.number().optional().describe("Unit price"),
        materialPrice: z.number().optional().describe("Material price"),
        laborPrice: z.number().optional().describe("Labor price"),
        normQuantity: z.number().optional().describe("Norm quantity (productienorm)"),
        normFactor: z.number().optional().describe("Norm factor (productiecapaciteit)"),
        resourceType: z.string().optional().describe("Resource type (onderaannemer, materieel, materiaal, arbeid, overig)"),
        tariefGroep: z.string().optional().describe("Tariff group for labor rate (A=66/hr, B=46/hr, C=82/hr). Auto-set to A when normQuantity is specified."),
        code: z.string().optional().describe("Rule code"),
      })).optional().describe("Calculation rules under this post"),
    })).optional().describe("Budget posts under this chapter"),
  })).describe("Array of chapters with nested posts and rules"),
}, async ({ chapters }) => {
  try {
    const b = req();
    ensureBouw1Staart(); // Auto-create standard staart if none exists
    const created: Array<{ type: string; id: string; description: string; depth: number }> = [];

    for (const ch of chapters) {
      // Create chapter (insert before staart items)
      const chapterItem = makeItem({ parentId: null, rowType: 'chapter', description: ch.description, code: ch.code });
      const firstStagart = b.items.findIndex(i => i.parentId === null && isStagart(i.rowType));
      if (firstStagart >= 0) b.items.splice(firstStagart, 0, chapterItem);
      else b.items.push(chapterItem);
      created.push({ type: 'chapter', id: chapterItem.id, description: ch.description, depth: 0 });

      if (ch.posts) {
        // Track insert position: right after the chapter item
        let chapterInsertIdx = b.items.indexOf(chapterItem) + 1;

        for (const post of ch.posts) {
          const postItem = makeItem({
            parentId: chapterItem.id, rowType: 'begrotingspost', description: post.description,
            code: post.code, quantity: post.quantity, unit: (post.unit as CostUnit) ?? 'st',
          });
          // Insert post directly after chapter (and any previous siblings)
          b.items.splice(chapterInsertIdx, 0, postItem);
          chapterInsertIdx++;
          created.push({ type: 'begrotingspost', id: postItem.id, description: post.description, depth: 1 });

          if (post.rules) {
            for (const rule of post.rules) {
              const regelItem = makeItem({
                parentId: postItem.id, rowType: 'regel', description: rule.description,
                quantity: rule.quantity, unit: (rule.unit as CostUnit) ?? 'st',
                normUnitPrice: rule.normUnitPrice,
              });
              if (rule.materialPrice != null) regelItem.materialPrice = rule.materialPrice;
              if (rule.laborPrice != null) regelItem.laborPrice = rule.laborPrice;
              if (rule.normQuantity != null) {
                regelItem.normQuantity = rule.normQuantity;
                regelItem.tariefGroep = (rule as any).tariefGroep ?? 'A';
              }
              if ((rule as any).tariefGroep) regelItem.tariefGroep = (rule as any).tariefGroep;
              if (rule.normFactor != null) regelItem.normFactor = rule.normFactor;
              if (rule.resourceType) regelItem.resourceType = rule.resourceType as ResourceType;
              if (rule.code) regelItem.code = rule.code;
              // Insert rule directly after post (and any previous sibling rules)
              b.items.splice(chapterInsertIdx, 0, regelItem);
              chapterInsertIdx++;
              created.push({ type: 'regel', id: regelItem.id, description: rule.description, depth: 2 });
            }
          }
        }
      }
    }

    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });

    const bd = getStaartBreakdown(b.items);
    return ok({
      success: true,
      createdCount: created.length,
      chapters: created.filter(c => c.type === 'chapter').length,
      posts: created.filter(c => c.type === 'begrotingspost').length,
      rules: created.filter(c => c.type === 'regel').length,
      grandTotal: bd.aanneemsomAfgerond,
      created,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("import_uittrekstaat", "Parse a tab-separated quantity takeoff table and create budget items. Each line becomes a regel under a begrotingspost. Group by empty lines or indentation.", {
  data: z.string().describe("Tab-separated data (TSV). Columns: description, length, width, height, dimUnit, quantity, unit. Empty lines separate groups."),
  sectionTitle: z.string().describe("Chapter title for this section (e.g. 'Nieuwbouw 7000x10700x5250')"),
  defaultUnit: z.string().optional().describe("Default unit if not specified per line (default: 'm2')"),
}, async ({ data, sectionTitle, defaultUnit }) => {
  try {
    const b = req();
    const defUnit = (defaultUnit as CostUnit) || 'm\u00B2';

    // Parse TSV lines
    const lines = data.split('\n').map(l => l.replace(/\r$/, ''));
    const created: Array<{ type: string; description: string; quantity: number | null; unit: string }> = [];

    // Create chapter
    const chapter = makeItem({ parentId: null, rowType: 'chapter', description: sectionTitle });
    const firstStagart = b.items.findIndex(i => i.parentId === null && isStagart(i.rowType));
    if (firstStagart >= 0) b.items.splice(firstStagart, 0, chapter);
    else b.items.push(chapter);

    // Group lines into sections by empty lines
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      } else {
        currentGroup.push(line);
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    for (const group of groups) {
      if (group.length === 0) continue;

      // First line of group = begrotingspost title, rest = regels
      // But if only 1 line, it's both post and rule
      const firstLine = group[0];
      const firstCols = firstLine.split('\t').map(c => c.trim());
      const postDesc = firstCols[0] || 'Onbenoemd';

      // Create begrotingspost
      const post = makeItem({
        parentId: chapter.id, rowType: 'begrotingspost', description: postDesc,
      });
      b.items.push(post);

      // Parse remaining lines as regels (or parse first line if only 1 line with quantity data)
      const regelLines = group.length === 1 ? group : group.slice(0);

      for (const rLine of regelLines) {
        const cols = rLine.split('\t').map(c => c.trim());
        if (!cols[0]) continue;

        const desc = cols[0];
        // Try to extract quantity and unit from various column positions
        let qty: number | null = null;
        let unit: CostUnit = defUnit;

        // Scan columns for numeric values (quantity) and unit strings
        for (let ci = 1; ci < cols.length; ci++) {
          const val = cols[ci];
          if (!val) continue;
          // Check if it's a unit
          const unitMap: Record<string, CostUnit> = {
            'mm': defUnit, 'm': 'm', 'm2': 'm\u00B2', 'mÂ²': 'm\u00B2',
            'm3': 'm\u00B3', 'mÂ³': 'm\u00B3', 'kg': 'kg', 'st': 'st',
            'stuk': 'st', 'stuks': 'st', 'uur': 'uur', 'post': 'post',
            'ton': 'ton', 'km': 'km', 'ls': 'ls', 'week': 'week',
          };
          const lv = val.toLowerCase().replace(/\s/g, '');
          if (unitMap[lv]) {
            unit = unitMap[lv];
            continue;
          }
          // Check if it's a number (could be quantity, dimension, etc.)
          const num = parseFloat(val.replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            // Last number before unit is likely the quantity
            qty = num;
          }
        }

        const regel = makeItem({
          parentId: post.id, rowType: 'regel', description: desc,
          quantity: qty, unit,
        });
        b.items.push(regel);
        created.push({ type: 'regel', description: desc, quantity: qty, unit });
      }
    }

    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });

    const bd = getStaartBreakdown(b.items);
    return ok({
      success: true,
      sectionTitle,
      groupCount: groups.length,
      itemCount: created.length,
      grandTotal: bd.aanneemsomAfgerond,
      items: created,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("lookup_reference_project", "Open a reference project (.ifcx OR .calc WpCalc) and search for items by description. Useful for finding prices from previous projects.", {
  projectPath: z.string().describe("Path to the reference .ifcx or .calc file"),
  search: z.string().describe("Search text to find in item descriptions"),
  indexFactor: z.number().optional().describe("Price index factor (e.g. 1.05 for 5% increase). Default: 1.0"),
}, async ({ projectPath, search, indexFactor }) => {
  try {
    const p = resolve(projectPath);
    accessSync(p);
    const factor = indexFactor ?? 1.0;
    const q = search.toLowerCase();
    let projectName = '';

    interface RefItem {
      code: string; description: string; rowType: string;
      quantity: number | null; unit: string;
      normUnitPrice: number | null; materialPrice: number | null; laborPrice: number | null;
      unitPrice: number; total: number;
      normQuantity: number | null; normFactor: number | null;
      resourceType: string | null; tariefGroep: string | null; nr: string;
    }

    let allItems: RefItem[] = [];

    if (p.endsWith('.calc')) {
      // â”€â”€ WpCalc / Access database â”€â”€
      const buf = readFileSync(p);
      const reader = new MDBReader(buf);
      const tableNames = reader.getTableNames();

      // Get project name from calculaties table
      if (tableNames.includes('calculaties')) {
        const rows = reader.getTable('calculaties').getData();
        if (rows.length > 0) projectName = String(rows[0].calculatietitel || basename(p));
      }

      // Read tarieven
      const tarieven = new Map<string, number>();
      if (tableNames.includes('tarieven')) {
        for (const r of reader.getTable('tarieven').getData()) {
          const g = String(r.tariefgroep || 'A');
          const t = Number(r.tarief);
          if (!isNaN(t)) tarieven.set(g, t);
        }
      }

      // Read data table
      if (tableNames.includes('data')) {
        const rows = reader.getTable('data').getData();
        for (const r of rows) {
          const rectype = Number(r.rectype) || 0;
          const desc = r.omschrijving ? String(r.omschrijving).trim() : '';
          if (!desc) continue;
          const qty = r.aantal != null ? Number(r.aantal) : null;
          const prijs = r.prijs != null ? Number(r.prijs) : null;
          const norm = r.norm != null ? Number(r.norm) : null;
          const eenheid = r.eenheid ? String(r.eenheid).trim() : 'st';
          const tg = r.tariefgroep ? String(r.tariefgroep) : null;
          const tarief = tg ? (tarieven.get(tg) ?? 0) : 0;
          const laborPrice = norm != null && norm > 0 ? norm * tarief : null;

          let rowType = 'regel';
          if (rectype === 8) rowType = 'chapter';
          else if (rectype === 4) rowType = 'begrotingspost';
          else if (rectype === 0) rowType = 'begrotingspost';

          const groep = String(r.groep || '');
          const para = String(r.paragraaf || '');
          const volgnr = String(r.volgnr || '');
          const code = groep ? `${groep}.${para}.${volgnr}` : '';

          // Calculate unitPrice
          const mat = prijs ?? 0;
          const lab = laborPrice ?? 0;
          const up = mat + lab;
          const total = (qty ?? 0) * up;

          allItems.push({
            code, description: desc, rowType,
            quantity: qty, unit: eenheid,
            normUnitPrice: prijs, materialPrice: null, laborPrice,
            unitPrice: up, total,
            normQuantity: norm, normFactor: null,
            resourceType: null, tariefGroep: tg, nr: '',
          });
        }
      }
    } else {
      // â”€â”€ JSON (.ifcx) â”€â”€
      const project = deserializeProject(readFileSync(p, 'utf-8'));
      const items = recalculateItems(project.items, project.schedule.tarieven);
      projectName = project.schedule.projectName;
      allItems = items.filter(i => !isStagart(i.rowType)).map(i => ({
        code: i.code, description: i.description, rowType: i.rowType,
        quantity: i.quantity, unit: i.unit,
        normUnitPrice: i.normUnitPrice, materialPrice: i.materialPrice, laborPrice: i.laborPrice,
        unitPrice: i.unitPrice, total: i.total,
        normQuantity: i.normQuantity, normFactor: i.normFactor,
        resourceType: i.resourceType, tariefGroep: i.tariefGroep, nr: i.nr,
      }));
    }

    const matches = allItems
      .filter(i => i.description.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .slice(0, 20)
      .map(i => ({
        ...i,
        normUnitPrice: i.normUnitPrice != null ? Math.round(i.normUnitPrice * factor * 100) / 100 : null,
        materialPrice: i.materialPrice != null ? Math.round(i.materialPrice * factor * 100) / 100 : null,
        laborPrice: i.laborPrice != null ? Math.round(i.laborPrice * factor * 100) / 100 : null,
        unitPrice: Math.round(i.unitPrice * factor * 100) / 100,
        total: Math.round(i.total * factor * 100) / 100,
      }));

    return ok({
      success: true,
      projectName: projectName || basename(p),
      fileType: p.endsWith('.calc') ? 'WpCalc (.calc)' : 'IfcX (.ifcx)',
      searchTerm: search,
      indexFactor: factor,
      matchCount: matches.length,
      matches,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("list_report_types", "List available report types for PDF export", {}, async () => {
  return ok([
    { id: "werkbeschrijving", name: "Werkbeschrijving", description: "Alleen omschrijvingen zonder bedragen" },
    { id: "hoofdaanneming", name: "Hoofdaanneming", description: "Volledige begroting met subtotalen" },
    { id: "onderaanneming", name: "Onderaanneming", description: "Alleen onderaannemingsposten" },
    { id: "inschrijfstaat", name: "Inschrijfstaat", description: "RAW-formaat aanbesteding" },
    { id: "nacalculatie", name: "Nacalculatie", description: "Vergelijking begroting vs werkelijk" },
    { id: "bouw1", name: "Bouw 1", description: "18-koloms Bouw 1 bedrijfsformaat" },
    { id: "offerte", name: "Offerte", description: "Klantofferte" },
  ]);
});

// ===========================================================================
// Start
// ===========================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Open Calc Studio MCP server running on stdio');
}

main().catch((e) => { console.error("MCP failed:", e); process.exit(1); });
