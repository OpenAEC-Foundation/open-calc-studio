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
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import WebSocket from "ws";
import MDBReader from "mdb-reader";
import initSqlJs from "sql.js";
import { DOMParser } from "@xmldom/xmldom";

const nodeRequire = createRequire(import.meta.url);

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
  subSheets?: unknown[]; spreadsheets?: unknown; offerte?: unknown; snapshots?: unknown[];
  brandSlug?: string; createdAt: string; modifiedAt: string;
}

// Huidige .ifcCalc-formaatversie — gelijk houden aan FILE_FORMAT_VERSION in
// src/services/file/fileService.ts (zie docs/ifccalc-formaat.md).
const FILE_FORMAT_VERSION = '2.1.0';

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

/**
 * Canonieke item-volgorde (port van normalizeItemOrder in de frontend):
 * depth-first per parentId zodat kinderen aaneengesloten onder hun ouder
 * staan. add_item voegt plat (achteraan) toe; zonder deze normalisatie
 * belanden regels in rapportages/exports onder het verkeerde hoofdstuk.
 * Sibling-volgorde = bestaande relatieve volgorde; depth her-afgeleid;
 * sortOrder = sibling-index; wezen behouden; staart_* achteraan.
 */
function normalizeItemOrder(items: CostItem[]): CostItem[] {
  const byParent = new Map<string | null, CostItem[]>();
  const staart: CostItem[] = [];
  for (const item of items) {
    if (item.parentId === undefined) item.parentId = null;
    if (item.rowType.startsWith('staart_')) {
      staart.push(item);
      continue;
    }
    const key = item.parentId;
    const list = byParent.get(key);
    if (list) list.push(item);
    else byParent.set(key, [item]);
  }

  const ordered: CostItem[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const kids = byParent.get(parentId);
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const item = kids[i];
      if (seen.has(item.id)) continue; // cyclus-guard
      seen.add(item.id);
      item.depth = depth;
      item.sortOrder = i;
      ordered.push(item);
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);

  for (const item of items) {
    if (!item.rowType.startsWith('staart_') && !seen.has(item.id)) {
      seen.add(item.id);
      ordered.push(item);
    }
  }

  return [...ordered, ...staart];
}

function recalculateItems(items: CostItem[], tarieven?: Record<string, number>): CostItem[] {
  const result = normalizeItemOrder(items.map(item => ({ ...item })));

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

function emptyCompanyInfo(): CompanyInfo {
  return {
    name: '', postalAddress: '', postalCity: '',
    visitAddress: '', visitCity: '',
    phone: '', fax: '', email: '',
  };
}

function defaultSchedule(): CostSchedule {
  return {
    id: crypto.randomUUID(),
    name: '', description: '',
    status: 'DRAFT', predefinedType: 'BUDGET',
    currency: 'EUR',
    projectName: '', projectNumber: '',
    client: '', author: '',
    ifcGuid: ifcGuid(),
    uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0,
    tarieven: {},
  };
}

function makeBlankItem(partial: Partial<CostItem> & { id: string }): CostItem {
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    sortOrder: partial.sortOrder ?? 0,
    code: partial.code ?? '',
    description: partial.description ?? '',
    unit: (partial.unit as CostUnit) ?? 'st',
    quantity: partial.quantity ?? null,
    materialPrice: partial.materialPrice ?? null,
    laborPrice: partial.laborPrice ?? null,
    unitPrice: partial.unitPrice ?? 0,
    total: partial.total ?? 0,
    isCollapsed: false,
    depth: partial.depth ?? 0,
    notes: partial.notes ?? '',
    ifcGuid: ifcGuid(),
    rowType: partial.rowType ?? 'begrotingspost',
    staartPercentage: partial.staartPercentage ?? null,
    nr: '',
    normQuantity: partial.normQuantity ?? null,
    normFactor: partial.normFactor ?? null,
    normDivisor: partial.normDivisor ?? null,
    normUnitPrice: partial.normUnitPrice ?? null,
    resourceType: partial.resourceType ?? null,
    resourceLibraryId: null,
    verrekenbaar: partial.verrekenbaar ?? null,
    tariefGroep: partial.tariefGroep ?? null,
  };
}

function mapUnitGeneric(raw: string | null | undefined): CostUnit {
  if (!raw) return 'st';
  const u = raw.toString().trim().toLowerCase();
  const map: Record<string, CostUnit> = {
    'm': 'm', 'm1': 'm', 'meter': 'm', 'm¹': 'm',
    'm2': 'm²', 'm²': 'm²', 'sqm': 'm²',
    'm3': 'm³', 'm³': 'm³', 'cbm': 'm³',
    'kg': 'kg', 'ton': 'ton',
    'uur': 'uur', 'u': 'uur', 'hr': 'uur', 'hour': 'uur',
    'dgn': 'dgn', 'dag': 'dgn', 'dg': 'dgn', 'dagen': 'dgn',
    'wk': 'week', 'week': 'week', 'weken': 'week',
    'mnd': 'mnd', 'maand': 'mnd',
    'km': 'km',
    'keer': 'keer', 'x': 'keer',
    'ls': 'ls', 'pst': 'ls', 'post': 'post',
    '%': '%', 'pm': 'pm',
    'st': 'st', 'stk': 'st', 'stuks': 'st', 'stuk': 'st',
    'bvl': 'st',
  };
  return map[u] ?? 'st';
}

// ── .xtb (IBIS-TRAD SQLite) loader ──
// Port of src/services/import/xtbImporter.ts (sql.js, Node-flavoured).

let _sqlJsPromise: Promise<any> | null = null;
async function getSqlJs() {
  if (!_sqlJsPromise) {
    const wasmPath = nodeRequire.resolve('sql.js/dist/sql-wasm.wasm');
    _sqlJsPromise = (initSqlJs as any)({ locateFile: () => wasmPath });
  }
  return _sqlJsPromise;
}

async function loadXtbProject(filePath: string): Promise<ProjectFile> {
  const SQL = await getSqlJs();
  const buf = readFileSync(filePath);
  const db = new SQL.Database(new Uint8Array(buf));

  try {
    // ── Begroting metadata ──
    const bgRows = db.exec(
      'SELECT Naam, Datum, Omschrijving, NettoTotaal, BrutoTotaal, TotaalUren FROM Begrotingen LIMIT 1'
    );
    if (bgRows.length === 0 || bgRows[0].values.length === 0) {
      throw new Error('Geen Begroting-record gevonden in .xtb bestand');
    }
    const bg = bgRows[0].values[0];
    const begroting = {
      Naam: String(bg[0] ?? ''),
      Datum: String(bg[1] ?? ''),
      Omschrijving: bg[2] != null ? String(bg[2]) : null,
    };

    // ── BegrotingsRegels (the tree) ──
    const regelRows = db.exec(
      'SELECT Id, ParentId, Regelnummer, Type, CalculatieCode, Omschrijving, Multipliciteit FROM BegrotingsRegels ORDER BY Regelnummer'
    );
    interface XtbRegel { Id:number; ParentId:number|null; Regelnummer:number; Type:number; CalculatieCode:string; Omschrijving:string; Multipliciteit:number; }
    const regels: XtbRegel[] = (regelRows[0]?.values ?? []).map((r: any) => ({
      Id: Number(r[0]),
      ParentId: r[1] != null ? Number(r[1]) : null,
      Regelnummer: Number(r[2] ?? 0),
      Type: Number(r[3] ?? 0),
      CalculatieCode: String(r[4] ?? ''),
      Omschrijving: String(r[5] ?? ''),
      Multipliciteit: Number(r[6] ?? 1),
    }));

    // ── Kostenposten ──
    const kpRows = db.exec(
      'SELECT Id, MiddelId, Hoeveelheid, Eenheidsprijs, NettoArbeid, NettoMateriaal, NettoMaterieel, NettoOnderaanneming, NettoTotaal, ProductieFactor, Uren FROM Kostenposten'
    );
    interface XtbKp { Id:number; MiddelId:number|null; Hoeveelheid:number; Eenheidsprijs:number; NettoArbeid:number; NettoMateriaal:number; NettoMaterieel:number; NettoOnderaanneming:number; NettoTotaal:number; ProductieFactor:number; Uren:number; }
    const kostenposten = new Map<number, XtbKp>();
    for (const r of (kpRows[0]?.values ?? []) as any[]) {
      kostenposten.set(Number(r[0]), {
        Id: Number(r[0]),
        MiddelId: r[1] != null ? Number(r[1]) : null,
        Hoeveelheid: Number(r[2] ?? 0),
        Eenheidsprijs: Number(r[3] ?? 0),
        NettoArbeid: Number(r[4] ?? 0),
        NettoMateriaal: Number(r[5] ?? 0),
        NettoMaterieel: Number(r[6] ?? 0),
        NettoOnderaanneming: Number(r[7] ?? 0),
        NettoTotaal: Number(r[8] ?? 0),
        ProductieFactor: Number(r[9] ?? 1),
        Uren: Number(r[10] ?? 0),
      });
    }

    // ── Middelen ──
    const mRows = db.exec(
      'SELECT MiddelId, MiddelCode, Omschrijving, Eenheid, NormUren, UurNormType, EenheidsprijsMateriaal, EenheidsprijsMaterieel, EenheidsprijsOnderaanneming FROM Middelen'
    );
    interface XtbMiddel { MiddelId:number; MiddelCode:string; Omschrijving:string; Eenheid:string; NormUren:number; UurNormType:number; EenheidsprijsMateriaal:number; EenheidsprijsMaterieel:number; EenheidsprijsOnderaanneming:number; }
    const middelen = new Map<number, XtbMiddel>();
    for (const r of (mRows[0]?.values ?? []) as any[]) {
      middelen.set(Number(r[0]), {
        MiddelId: Number(r[0]),
        MiddelCode: String(r[1] ?? ''),
        Omschrijving: String(r[2] ?? ''),
        Eenheid: String(r[3] ?? ''),
        NormUren: Number(r[4] ?? 0),
        UurNormType: Number(r[5] ?? 0),
        EenheidsprijsMateriaal: Number(r[6] ?? 0),
        EenheidsprijsMaterieel: Number(r[7] ?? 0),
        EenheidsprijsOnderaanneming: Number(r[8] ?? 0),
      });
    }

    // ── Elementen ──
    const eRows = db.exec('SELECT Id, Eenheid, Hoeveelheid, NettoTotaal FROM Elementen');
    interface XtbEl { Id:number; Eenheid:string; Hoeveelheid:number; NettoTotaal:number; }
    const elementen = new Map<number, XtbEl>();
    for (const r of (eRows[0]?.values ?? []) as any[]) {
      elementen.set(Number(r[0]), {
        Id: Number(r[0]),
        Eenheid: String(r[1] ?? ''),
        Hoeveelheid: Number(r[2] ?? 0),
        NettoTotaal: Number(r[3] ?? 0),
      });
    }

    // ── Build tree ──
    const items: CostItem[] = [];
    const childrenOf = new Map<number | 'root', XtbRegel[]>();
    for (const r of regels) {
      const key: number | 'root' = r.ParentId == null ? 'root' : r.ParentId;
      const list = childrenOf.get(key) ?? [];
      list.push(r);
      childrenOf.set(key, list);
    }

    // Resource type from the dominant Netto-column of the Kostenpost.
    function resourceTypeFor(kp: XtbKp | undefined): ResourceType | null {
      if (!kp) return null;
      const cols: Array<[ResourceType, number]> = [
        ['arbeid', kp.NettoArbeid],
        ['materiaal', kp.NettoMateriaal],
        ['materieel', kp.NettoMaterieel],
        ['onderaannemer', kp.NettoOnderaanneming],
      ];
      let best: ResourceType | null = null;
      let bestVal = 0;
      for (const [t, v] of cols) {
        if (v > bestVal) {
          bestVal = v;
          best = t;
        }
      }
      return best ?? 'overig';
    }

    function walk(parentXtbId: number | 'root', ocsParentId: string | null, depth: number, sortStart: { v: number }): void {
      const kids = childrenOf.get(parentXtbId) ?? [];
      kids.sort((a, b) => a.Regelnummer - b.Regelnummer);
      for (const r of kids) {
        const isChapter = r.Type === 0;
        const isLeaf = r.Type === 2;
        if (isChapter) {
          const id = crypto.randomUUID();
          items.push(makeBlankItem({
            id, parentId: ocsParentId, sortOrder: sortStart.v++,
            code: r.CalculatieCode || '',
            description: r.Omschrijving || '(geen omschrijving)',
            rowType: 'chapter', depth, unit: 'st',
            quantity: r.Multipliciteit,
          }));
          walk(r.Id, id, depth + 1, sortStart);
        } else if (isLeaf) {
          const kp = kostenposten.get(r.Id);
          const middel = kp?.MiddelId != null ? middelen.get(kp.MiddelId) : undefined;
          const element = elementen.get(r.Id);
          const eh = middel?.Eenheid || element?.Eenheid || '';
          const netto = kp?.NettoTotaal ?? element?.NettoTotaal ?? 0;
          const rType = resourceTypeFor(kp);

          // IBIS invariant: Hoeveelheid × Eenheidsprijs === NettoTotaal.
          let qty = kp?.Hoeveelheid ?? element?.Hoeveelheid ?? 0;
          let ehprijs = kp?.Eenheidsprijs ?? 0;
          // Fixed/lump-sum post: no quantity but a real amount → 1 × NettoTotaal.
          if ((qty === 0 || qty == null) && netto !== 0) {
            qty = 1;
            ehprijs = netto;
          }

          // Each Type=2 leaf becomes a SINGLE begrotingspost (NO regel child).
          // Eenheidsprijs is stored in materialPrice so the calculator's
          // childless-begrotingspost path (unitPrice = materialPrice + laborPrice,
          // total = quantity × unitPrice) reconstructs total === NettoTotaal.
          const postId = crypto.randomUUID();
          items.push(makeBlankItem({
            id: postId, parentId: ocsParentId, sortOrder: sortStart.v++,
            code: r.CalculatieCode || middel?.MiddelCode || '',
            description: r.Omschrijving || middel?.Omschrijving || '',
            rowType: 'begrotingspost', depth,
            unit: mapUnitGeneric(eh), quantity: qty,
            materialPrice: ehprijs, unitPrice: ehprijs, total: netto,
            resourceType: rType,
          }));
        }
      }
    }

    // ── Detect the synthetic root ──
    // IBIS-TRAD wraps the real chapters under one synthetic root node:
    //   Id=1, ParentId=NULL, Type=0, empty CalculatieCode + Omschrijving.
    // Skip it and promote its children to top-level chapters (depth 0).
    // Guard: only when there is EXACTLY one ParentId=NULL row AND it is empty,
    // otherwise fall back to walking from 'root'.
    const nullRoots = regels.filter((r) => r.ParentId == null);
    let startKey: number | 'root' = 'root';
    if (nullRoots.length === 1) {
      const root = nullRoots[0];
      const isSyntheticRoot =
        root.Type === 0 &&
        (root.CalculatieCode ?? '').trim() === '' &&
        (root.Omschrijving ?? '').trim() === '';
      if (isSyntheticRoot) startKey = root.Id;
    }
    walk(startKey, null, 0, { v: 0 });

    const schedule = defaultSchedule();
    schedule.name = begroting.Naam || 'IBIS-TRAD import';
    schedule.description = begroting.Omschrijving ?? '';
    schedule.projectName = begroting.Naam || '';

    // Inject default staart so calculator has something to work with
    const itemsWithStaart = [...items, ...synthesizeStaartItems(schedule)];

    return {
      version: FILE_FORMAT_VERSION,
      schedule, items: itemsWithStaart,
      resourceLibrary: [],
      companyInfo: emptyCompanyInfo(),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// ── .calc (WpCalc / Access) loader ──
// Port of src/services/import/wpcalcImporter.ts (Node-flavoured).

function loadCalcProject(filePath: string): ProjectFile {
  const buf = readFileSync(filePath);
  const reader = new MDBReader(buf);
  const tableNames = reader.getTableNames();

  // ── Project metadata ──
  let calcMeta: any = null;
  if (tableNames.includes('calculaties')) {
    const rows = reader.getTable('calculaties').getData();
    if (rows.length > 0) calcMeta = rows[0];
  }

  // ── Tarieven ──
  const tarieven = new Map<string, number>();
  if (tableNames.includes('tarieven')) {
    for (const r of reader.getTable('tarieven').getData() as any[]) {
      const groep = String(r.tariefgroep || 'A');
      const t = Number(r.tarief);
      if (!isNaN(t)) tarieven.set(groep, t);
    }
  }

  // ── Data rows ──
  interface CalcRow {
    recnr: number; groep: number; paragraaf: number; volgnr: number;
    tabs: number; rectype: number; omschrijving: string | null;
    eenheid: string | null; aantal: number | null; prijs: number | null;
    kosteneh: number | null; norm: number | null;
    tariefgroep: string | null; tarief: number | null;
    onderaanneming: boolean; materieel: boolean; stelpost: boolean;
    code: string | null; artikelnr: string | null;
  }
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v); return isNaN(n) ? null : n;
  };
  const dataRows: CalcRow[] = [];
  if (tableNames.includes('data')) {
    for (const r of reader.getTable('data').getData() as any[]) {
      dataRows.push({
        recnr: num(r.recnr) || 0,
        groep: num(r.groep) || 0,
        paragraaf: num(r.paragraaf) || 0,
        volgnr: num(r.volgnr) || 0,
        tabs: num(r.tabs) || 0,
        rectype: num(r.rectype) || 0,
        omschrijving: r.omschrijving ? String(r.omschrijving) : null,
        eenheid: r.eenheid ? String(r.eenheid) : null,
        aantal: num(r.aantal),
        prijs: num(r.prijs),
        kosteneh: num(r.kosteneh),
        norm: num(r.norm),
        tariefgroep: r.tariefgroep ? String(r.tariefgroep) : null,
        tarief: num(r.tarief),
        onderaanneming: !!r.onderaanneming,
        materieel: !!r.materieel,
        stelpost: !!r.stelpost,
        code: r.code ? String(r.code) : null,
        artikelnr: r.artikelnr ? String(r.artikelnr) : null,
      });
    }
  }
  dataRows.sort((a, b) =>
    a.groep - b.groep || a.paragraaf - b.paragraaf || a.volgnr - b.volgnr || a.recnr - b.recnr
  );

  // ── Staart percentages ──
  const staartRows: Array<{ omschrijving: string | null; percentage: number | null }> = [];
  if (tableNames.includes('staart')) {
    for (const r of reader.getTable('staart').getData() as any[]) {
      staartRows.push({
        omschrijving: r.omschrijving ? String(r.omschrijving) : null,
        percentage: num(r.percentage),
      });
    }
  }

  // ── Build schedule ──
  const schedule = defaultSchedule();
  schedule.name = String(calcMeta?.calculatietitel || 'WpCalc Import');
  schedule.projectName = String(calcMeta?.calculatietitel || '');
  schedule.projectNumber = String(calcMeta?.offertenr || '');
  schedule.client = String(calcMeta?.naam || '');
  schedule.author = String(calcMeta?.calculator || '');
  schedule.tarieven = Object.fromEntries(tarieven);

  // Cache staart percentages on schedule for synthesizeStaartItems()
  (schedule as any).staartRows = staartRows.map(s => ({
    label: s.omschrijving ?? '',
    percentage: s.percentage !== null ? Math.round(s.percentage * 10000) / 100 : null,
  }));

  // ── Build items ──
  const items: CostItem[] = [];
  let sortOrder = 0;
  const chapterIds = new Map<number, string>();
  const subheaderIds = new Map<string, string>();

  for (const row of dataRows) {
    if (row.rectype === 16) continue;
    const desc = (row.omschrijving || '').trim();
    if (!desc && row.rectype !== 5) continue;

    const id = crypto.randomUUID();

    if (row.rectype === 8) {
      chapterIds.set(row.groep, id);
      items.push(makeBlankItem({
        id, parentId: null, sortOrder: sortOrder++,
        code: row.code || String(row.groep).padStart(2, '0'),
        description: desc, rowType: 'chapter', depth: 0,
      }));
    } else if (row.rectype === 4) {
      const parentId = chapterIds.get(row.groep) || null;
      const key = `${row.groep}-${row.paragraaf}`;
      subheaderIds.set(key, id);
      items.push(makeBlankItem({
        id, parentId, sortOrder: sortOrder++,
        code: row.code || '', description: desc,
        rowType: 'begrotingspost', depth: 1,
      }));
    } else if (row.rectype === 5) {
      const parentId = findCalcParentId(row, chapterIds, subheaderIds);
      if (desc) {
        items.push(makeBlankItem({
          id, parentId, sortOrder: sortOrder++,
          description: desc, rowType: 'tekstregel',
          depth: (row.tabs || 0) + 1,
        }));
      }
    } else if (row.rectype === 0) {
      const parentId = findCalcParentId(row, chapterIds, subheaderIds);
      const hasQuantity = row.aantal !== null && row.aantal !== 0;
      const hasPrice = (row.prijs !== null && row.prijs !== 0) || (row.kosteneh !== null && row.kosteneh !== 0);
      if (!desc && !hasQuantity && !hasPrice) continue;
      if (!hasQuantity && !hasPrice && desc) {
        items.push(makeBlankItem({
          id, parentId, sortOrder: sortOrder++,
          description: desc, rowType: 'tekstregel',
          depth: (row.tabs || 0) + 1,
        }));
        continue;
      }

      let resourceType: ResourceType | null = null;
      if (row.onderaanneming) resourceType = 'onderaannemer';
      else if (row.materieel) resourceType = 'materieel';
      else if (row.stelpost) resourceType = 'overig';
      else resourceType = 'materiaal';

      const tariefGroep = row.tariefgroep || 'A';
      const tariefPerUur = row.tarief || tarieven.get(tariefGroep) || 0;
      const materialPrice = row.prijs;
      const normUren = row.norm;
      const laborPrice = (normUren || 0) * tariefPerUur;
      const unitPrice = row.kosteneh || 0;
      const quantity = row.aantal;
      const total = (quantity || 0) * unitPrice;

      items.push(makeBlankItem({
        id, parentId, sortOrder: sortOrder++,
        code: row.code || row.artikelnr || '',
        description: desc, unit: mapUnitGeneric(row.eenheid),
        quantity, materialPrice, laborPrice,
        unitPrice, total,
        rowType: 'regel', depth: (row.tabs || 0) + 1,
        resourceType, normQuantity: normUren,
        normUnitPrice: materialPrice,
        tariefGroep: (tariefGroep === 'A' || tariefGroep === 'B' || tariefGroep === 'C') ? tariefGroep : null,
      }));
    }
  }

  // Normalize depth from the actual parent chain — the raw `tabs` column is a
  // visual indent that doesn't always match the hierarchy (regels directly
  // under a chapter carried tabs=1 → depth 2), which breaks subtree detection
  // and grid indentation.
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  for (const it of items) {
    let d = 0;
    const guard = new Set<string>();
    let p = it.parentId ? itemById.get(it.parentId) : undefined;
    while (p && !guard.has(p.id)) {
      guard.add(p.id);
      d++;
      p = p.parentId ? itemById.get(p.parentId) : undefined;
    }
    it.depth = d;
  }

  // Inject staart items
  const itemsWithStaart = [...items, ...synthesizeStaartItems(schedule)];

  const companyInfo: CompanyInfo = {
    name: '',
    postalAddress: String(calcMeta?.adres || ''),
    postalCity: String(calcMeta?.woonplaats || ''),
    visitAddress: '', visitCity: '',
    phone: '', fax: '', email: '',
  };

  return {
    version: FILE_FORMAT_VERSION,
    schedule, items: itemsWithStaart,
    resourceLibrary: [], companyInfo,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
}

function findCalcParentId(
  row: { groep: number; paragraaf: number },
  chapterIds: Map<number, string>,
  subheaderIds: Map<string, string>,
): string | null {
  if (row.paragraaf > 0 && row.paragraaf < 9999) {
    const key = `${row.groep}-${row.paragraaf}`;
    const subId = subheaderIds.get(key);
    if (subId) return subId;
  }
  return chapterIds.get(row.groep) || null;
}

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

/**
 * Load a budget file from any supported format:
 *   .ifcCalc / .ocs / .json / .ifcx → JSON ProjectFile
 *   .xtb                            → IBIS-TRAD SQLite (sql.js)
 *   .calc / .mdb                    → WpCalc / Access (mdb-reader)
 */
async function loadProjectFile(filePath: string): Promise<ProjectFile> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.xtb') return loadXtbProject(filePath);
  if (ext === '.calc' || ext === '.mdb') return loadCalcProject(filePath);
  // Default: JSON (.ifcCalc, .ocs, .json, .ifcx)
  return deserializeProject(readFileSync(filePath, 'utf-8'));
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

server.tool("open_budget", "Open a budget file and load it into memory. Supported formats: .ifcCalc / .ocs / .json / .ifcx (OCS native), .xtb (IBIS-TRAD SQLite), .calc / .mdb (WpCalc / Access).", {
  filePath: z.string().describe("Path to the budget file (.ifcCalc, .ocs, .json, .ifcx, .xtb, .calc, .mdb)"),
}, async ({ filePath }) => {
  try {
    const p = resolve(filePath);
    const project = await loadProjectFile(p);
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
      version: FILE_FORMAT_VERSION, schedule: b.schedule, items: b.items,
      resourceLibrary: b.project.resourceLibrary ?? [],
      companyInfo: b.project.companyInfo,
      // 2.1-vorm behouden: spreadsheets-object doorzetten als het bestond,
      // anders afleiden uit legacy subSheets — nooit stilletjes droppen.
      spreadsheets: (b.project as ProjectFile).spreadsheets
        ?? { sheets: b.project.subSheets ?? [], activeSheetId: (b.project.subSheets as Array<{ id?: string }> | undefined)?.[0]?.id ?? null },
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
      version: FILE_FORMAT_VERSION, schedule: b.schedule, items: b.items,
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
// Shadow state for sheets / branches / company / resources / documents
// Mirrors what the Tauri app holds. Mutations are forwarded over the bridge.
// ===========================================================================

interface SubSheetCell {
  value: string;
  computed?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  format?: string;
  decimals?: number;
  fontSize?: number;
}

interface SubSheet {
  id: string;
  name: string;
  columns: number;
  rows: number;
  cells: Record<string, SubSheetCell>;
}

interface BranchInfo {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
}

interface ResourceLibraryItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  resourceType: ResourceType;
  defaultUnitPrice: number | null;
  category: string;
}

interface DocumentTab {
  id: string;
  filePath: string | null;
  fileName: string;
  isModified: boolean;
  items?: CostItem[];
  schedule?: CostSchedule;
}

interface ExtendedCompanyInfo extends CompanyInfo {
  logoLeft?: string;
  logoRight?: string;
  kvk?: string;
  btw?: string;
  iban?: string;
}

interface ShadowState {
  sheets: SubSheet[];
  activeSheetId: string | null;
  branches: BranchInfo[];
  branchesEnabled: boolean;
  activeBranchId: string | null;
  resourceLibrary: ResourceLibraryItem[];
  documents: DocumentTab[];
  activeDocumentId: string | null;
}

const shadow: ShadowState = {
  sheets: [],
  activeSheetId: null,
  branches: [],
  branchesEnabled: false,
  activeBranchId: null,
  resourceLibrary: [],
  documents: [],
  activeDocumentId: null,
};

function ensureShadowFromBudget() {
  if (!currentBudget) return;
  const sched: any = currentBudget.schedule;
  if (sched.branches && shadow.branches.length === 0) {
    shadow.branches = sched.branches;
    shadow.branchesEnabled = !!sched.branchesEnabled;
    shadow.activeBranchId = sched.activeBranchId ?? null;
  }
  const lib = (currentBudget.project.resourceLibrary as ResourceLibraryItem[] | undefined);
  if (lib && shadow.resourceLibrary.length === 0) {
    shadow.resourceLibrary = lib;
  }
  const sheets = (currentBudget.project.subSheets as SubSheet[] | undefined)
    ?? (currentBudget.project as any).spreadsheets?.sheets;
  if (sheets && shadow.sheets.length === 0) {
    shadow.sheets = sheets;
  }
}

// ===========================================================================
// New tools: Spreadsheet (sub-sheets)
// ===========================================================================

server.tool("add_sheet", "Create a new spreadsheet (sub-sheet/deelberekening). Returns the new sheet id.", {
  name: z.string().optional().describe("Sheet name (default: 'Blad N')"),
}, async ({ name }) => {
  try {
    ensureShadowFromBudget();
    const id = crypto.randomUUID();
    const sheetName = name || `Blad ${shadow.sheets.length + 1}`;
    const sheet: SubSheet = { id, name: sheetName, columns: 10, rows: 50, cells: {} };
    shadow.sheets.push(sheet);
    shadow.activeSheetId = id;
    sendBridgeMutation("add_sheet", { id, name: sheetName });
    return ok({ success: true, id, name: sheetName, sheet });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("list_sheets", "List all spreadsheets (sub-sheets) in the current budget.", {}, async () => {
  try {
    ensureShadowFromBudget();
    return ok({
      activeSheetId: shadow.activeSheetId,
      count: shadow.sheets.length,
      sheets: shadow.sheets.map(s => ({
        id: s.id, name: s.name, columns: s.columns, rows: s.rows, cellCount: Object.keys(s.cells).length,
      })),
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("rename_sheet", "Rename an existing spreadsheet.", {
  id: z.string().describe("Sheet id"),
  name: z.string().describe("New sheet name"),
}, async ({ id, name }) => {
  try {
    ensureShadowFromBudget();
    const s = shadow.sheets.find(x => x.id === id);
    if (!s) throw new Error(`Sheet "${id}" not found`);
    s.name = name;
    sendBridgeMutation("rename_sheet", { id, name });
    return ok({ success: true, id, name });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("remove_sheet", "Remove a spreadsheet.", {
  id: z.string().describe("Sheet id"),
}, async ({ id }) => {
  try {
    ensureShadowFromBudget();
    const before = shadow.sheets.length;
    shadow.sheets = shadow.sheets.filter(s => s.id !== id);
    if (shadow.activeSheetId === id) shadow.activeSheetId = null;
    sendBridgeMutation("remove_sheet", { id });
    return ok({ success: true, removed: before - shadow.sheets.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("set_cell", "Set a single cell value in a spreadsheet. ref is e.g. 'A1'. Value may be a number, plain string, or '=...' formula.", {
  sheetId: z.string().describe("Sheet id"),
  ref: z.string().describe("Cell reference (A1, B2, ...)"),
  value: z.string().describe("Cell value (plain text, number-string, or '=FORMULA')"),
}, async ({ sheetId, ref, value }) => {
  try {
    ensureShadowFromBudget();
    const s = shadow.sheets.find(x => x.id === sheetId);
    if (!s) throw new Error(`Sheet "${sheetId}" not found`);
    const cell: SubSheetCell = { value };
    const n = parseFloat(value);
    if (!isNaN(n) && !value.startsWith('=')) cell.computed = n;
    s.cells[ref.toUpperCase()] = cell;
    sendBridgeMutation("set_cell", { sheetId, ref: ref.toUpperCase(), value });
    return ok({ success: true, sheetId, ref: ref.toUpperCase(), value });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_cell", "Read a single cell value from a spreadsheet.", {
  sheetId: z.string().describe("Sheet id"),
  ref: z.string().describe("Cell reference (A1, B2, ...)"),
}, async ({ sheetId, ref }) => {
  try {
    ensureShadowFromBudget();
    const s = shadow.sheets.find(x => x.id === sheetId);
    if (!s) throw new Error(`Sheet "${sheetId}" not found`);
    const cell = s.cells[ref.toUpperCase()];
    return ok({ sheetId, ref: ref.toUpperCase(), value: cell?.value ?? null, computed: cell?.computed ?? null });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("set_cells_batch", "Set multiple cells in one call. Useful for bulk inserts.", {
  sheetId: z.string().describe("Sheet id"),
  cells: z.array(z.object({
    ref: z.string().describe("Cell ref (A1)"),
    value: z.string().describe("Cell value"),
  })).describe("Array of {ref, value} pairs"),
}, async ({ sheetId, cells }) => {
  try {
    ensureShadowFromBudget();
    const s = shadow.sheets.find(x => x.id === sheetId);
    if (!s) throw new Error(`Sheet "${sheetId}" not found`);
    for (const c of cells) {
      const ref = c.ref.toUpperCase();
      const cell: SubSheetCell = { value: c.value };
      const n = parseFloat(c.value);
      if (!isNaN(n) && !c.value.startsWith('=')) cell.computed = n;
      s.cells[ref] = cell;
    }
    sendBridgeMutation("set_cells_batch", { sheetId, cells: cells.map(c => ({ ref: c.ref.toUpperCase(), value: c.value })) });
    return ok({ success: true, sheetId, written: cells.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: Branches (budget variants)
// ===========================================================================

server.tool("list_branches", "List all budget variant branches.", {}, async () => {
  try {
    ensureShadowFromBudget();
    return ok({
      enabled: shadow.branchesEnabled,
      activeBranchId: shadow.activeBranchId,
      count: shadow.branches.length,
      branches: shadow.branches,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("add_branch", "Add a new budget variant branch (optionally as a child of another).", {
  name: z.string().describe("Branch name"),
  parentId: z.string().optional().describe("Parent branch id (null/omit for top-level)"),
}, async ({ name, parentId }) => {
  try {
    ensureShadowFromBudget();
    const id = crypto.randomUUID();
    const branch: BranchInfo = { id, name, parentId: parentId ?? null };
    shadow.branches.push(branch);
    sendBridgeMutation("add_branch", { id, name, parentId: parentId ?? null });
    return ok({ success: true, branch });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("remove_branch", "Remove a branch (and all its descendants). 'main' cannot be removed.", {
  id: z.string().describe("Branch id"),
}, async ({ id }) => {
  try {
    ensureShadowFromBudget();
    if (id === 'main') throw new Error('Cannot remove main branch');
    const toRemove = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of shadow.branches) {
        if (b.parentId && toRemove.has(b.parentId) && !toRemove.has(b.id)) {
          toRemove.add(b.id);
          changed = true;
        }
      }
    }
    const before = shadow.branches.length;
    shadow.branches = shadow.branches.filter(b => !toRemove.has(b.id));
    if (shadow.activeBranchId && toRemove.has(shadow.activeBranchId)) shadow.activeBranchId = null;
    sendBridgeMutation("remove_branch", { id });
    return ok({ success: true, removed: before - shadow.branches.length, removedIds: [...toRemove] });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("rename_branch", "Rename a branch.", {
  id: z.string().describe("Branch id"),
  name: z.string().describe("New name"),
}, async ({ id, name }) => {
  try {
    ensureShadowFromBudget();
    const b = shadow.branches.find(x => x.id === id);
    if (!b) throw new Error(`Branch "${id}" not found`);
    b.name = name;
    sendBridgeMutation("rename_branch", { id, name });
    return ok({ success: true, id, name });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("set_active_branch", "Set the active branch for filtering. Pass null/empty to clear.", {
  id: z.string().optional().describe("Branch id (omit to clear)"),
}, async ({ id }) => {
  try {
    ensureShadowFromBudget();
    shadow.activeBranchId = id ?? null;
    sendBridgeMutation("set_active_branch", { id: id ?? null });
    return ok({ success: true, activeBranchId: shadow.activeBranchId });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("toggle_branches_enabled", "Toggle whether branches/variants are visible in the grid.", {}, async () => {
  try {
    ensureShadowFromBudget();
    shadow.branchesEnabled = !shadow.branchesEnabled;
    if (shadow.branchesEnabled && shadow.branches.length === 0) {
      shadow.branches.push({ id: 'main', name: 'main', parentId: null, color: '#3b82f6' });
    }
    sendBridgeMutation("toggle_branches_enabled", { enabled: shadow.branchesEnabled });
    return ok({ success: true, enabled: shadow.branchesEnabled });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: CompanyInfo / ProjectInfo
// ===========================================================================

server.tool("update_company_info", "Update the company info / letterhead used in reports.", {
  name: z.string().optional(),
  postalAddress: z.string().optional(),
  postalCity: z.string().optional(),
  visitAddress: z.string().optional(),
  visitCity: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().optional(),
  kvk: z.string().optional().describe("KvK number"),
  btw: z.string().optional().describe("BTW / VAT number"),
  iban: z.string().optional().describe("IBAN"),
  logoLeft: z.string().optional().describe("Base64-encoded PNG for the left logo"),
  logoRight: z.string().optional().describe("Base64-encoded PNG for the right logo"),
}, async (changes) => {
  try {
    const b = req();
    const ci = b.project.companyInfo as ExtendedCompanyInfo;
    for (const [k, v] of Object.entries(changes)) {
      if (v !== undefined) (ci as any)[k] = v;
    }
    b.project.companyInfo = ci;
    sendBridgeMutation("update_company_info", changes);
    return ok({ success: true, companyInfo: ci });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_company_info", "Read the current company info.", {}, async () => {
  try {
    const b = req();
    return ok({ companyInfo: b.project.companyInfo });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("update_project_info", "Update project metadata (projectName, projectNumber, client, author, reportDate, description).", {
  projectName: z.string().optional(),
  projectNumber: z.string().optional(),
  client: z.string().optional(),
  author: z.string().optional(),
  reportDate: z.string().optional().describe("ISO YYYY-MM-DD"),
  description: z.string().optional(),
  name: z.string().optional().describe("Schedule name"),
  status: z.enum(['DRAFT', 'FINAL', 'REVISED']).optional(),
  predefinedType: z.enum(['BUDGET', 'ESTIMATE', 'TENDER']).optional(),
}, async (changes) => {
  try {
    const b = req();
    const s = b.schedule as any;
    for (const [k, v] of Object.entries(changes)) {
      if (v !== undefined) s[k] = v;
    }
    sendBridgeMutation("update_schedule", changes);
    return ok({
      success: true,
      schedule: {
        name: s.name, projectName: s.projectName, projectNumber: s.projectNumber,
        client: s.client, author: s.author, reportDate: s.reportDate,
        description: s.description, status: s.status, predefinedType: s.predefinedType,
      },
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("get_project_info", "Read project metadata.", {}, async () => {
  try {
    const b = req();
    const s = b.schedule as any;
    return ok({
      schedule: {
        name: s.name, projectName: s.projectName, projectNumber: s.projectNumber,
        client: s.client, author: s.author, reportDate: s.reportDate,
        description: s.description, status: s.status, predefinedType: s.predefinedType,
        currency: s.currency, ifcGuid: s.ifcGuid,
        algemeneKosten: s.algemeneKosten, winstRisico: s.winstRisico, uitvoeringskosten: s.uitvoeringskosten,
        tarieven: s.tarieven, projectProperties: s.projectProperties, projectInfo: s.projectInfo,
      },
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: Resource Library
// ===========================================================================

server.tool("list_resources", "List resources from the library (optionally filtered by category/type/search).", {
  filter: z.object({
    resourceType: z.string().optional(),
    category: z.string().optional(),
    search: z.string().optional(),
  }).optional(),
}, async ({ filter }) => {
  try {
    ensureShadowFromBudget();
    let items = shadow.resourceLibrary;
    if (filter?.resourceType) items = items.filter(i => i.resourceType === filter.resourceType);
    if (filter?.category) {
      const q = filter.category.toLowerCase();
      items = items.filter(i => (i.category ?? '').toLowerCase().includes(q));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(i =>
        i.description.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return ok({ count: items.length, items: items.slice(0, 200) });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("add_resource", "Add a single resource to the library.", {
  code: z.string().describe("Resource code"),
  description: z.string().describe("Resource description"),
  unit: z.string().describe("Unit (e.g. m, m2, kg, uur, st)"),
  resourceType: z.enum(['onderaannemer', 'materieel', 'materiaal', 'arbeid', 'overig']).describe("Resource type"),
  defaultUnitPrice: z.number().nullable().optional().describe("Default unit price (€/unit)"),
  category: z.string().optional().describe("Category label"),
}, async ({ code, description, unit, resourceType, defaultUnitPrice, category }) => {
  try {
    ensureShadowFromBudget();
    const id = crypto.randomUUID();
    const item: ResourceLibraryItem = {
      id, code, description,
      unit: mapUnitGeneric(unit),
      resourceType: resourceType as ResourceType,
      defaultUnitPrice: defaultUnitPrice ?? null,
      category: category ?? '',
    };
    shadow.resourceLibrary.push(item);
    sendBridgeMutation("add_resource", { item });
    return ok({ success: true, item });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("update_resource", "Update fields of an existing resource library item.", {
  id: z.string().describe("Resource id"),
  partial: z.object({
    code: z.string().optional(),
    description: z.string().optional(),
    unit: z.string().optional(),
    resourceType: z.string().optional(),
    defaultUnitPrice: z.number().nullable().optional(),
    category: z.string().optional(),
  }).describe("Partial update"),
}, async ({ id, partial }) => {
  try {
    ensureShadowFromBudget();
    const item = shadow.resourceLibrary.find(r => r.id === id);
    if (!item) throw new Error(`Resource "${id}" not found`);
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) continue;
      if (k === 'unit' && typeof v === 'string') (item as any).unit = mapUnitGeneric(v);
      else (item as any)[k] = v;
    }
    sendBridgeMutation("update_resource", { id, partial });
    return ok({ success: true, item });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("remove_resource", "Remove a resource library item.", {
  id: z.string().describe("Resource id"),
}, async ({ id }) => {
  try {
    ensureShadowFromBudget();
    const before = shadow.resourceLibrary.length;
    shadow.resourceLibrary = shadow.resourceLibrary.filter(r => r.id !== id);
    sendBridgeMutation("remove_resource", { id });
    return ok({ success: true, removed: before - shadow.resourceLibrary.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("bulk_set_resource_library", "Replace the entire resource library with the given items.", {
  items: z.array(z.object({
    id: z.string().optional(),
    code: z.string(),
    description: z.string(),
    unit: z.string(),
    resourceType: z.string(),
    defaultUnitPrice: z.number().nullable().optional(),
    category: z.string().optional(),
  })).describe("Replacement resource library"),
}, async ({ items }) => {
  try {
    ensureShadowFromBudget();
    shadow.resourceLibrary = items.map(i => ({
      id: i.id ?? crypto.randomUUID(),
      code: i.code, description: i.description,
      unit: mapUnitGeneric(i.unit),
      resourceType: i.resourceType as ResourceType,
      defaultUnitPrice: i.defaultUnitPrice ?? null,
      category: i.category ?? '',
    }));
    sendBridgeMutation("set_resource_library", { items: shadow.resourceLibrary });
    return ok({ success: true, count: shadow.resourceLibrary.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: Tree manipulation
// ===========================================================================

server.tool("move_items", "Move one or more items relative to a target (before / after / inside).", {
  ids: z.array(z.string()).describe("Item ids to move"),
  targetId: z.string().describe("Target item id"),
  position: z.enum(['before', 'after', 'inside']).describe("Drop position"),
}, async ({ ids, targetId, position }) => {
  try {
    const b = req();
    const idsSet = new Set(ids);
    if (idsSet.has(targetId)) throw new Error('Cannot move an item onto itself');
    const byId = new Map(b.items.map(i => [i.id, i] as const));
    const target = byId.get(targetId);
    if (!target) throw new Error(`Target "${targetId}" not found`);
    // Validate
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`Item "${id}" not found`);
    }
    // Determine new parent
    let newParentId: string | null;
    let newParentDepth: number;
    if (position === 'inside') {
      if (!isContainer(target.rowType)) throw new Error(`Target "${targetId}" is ${target.rowType}, cannot contain children`);
      newParentId = target.id;
      newParentDepth = target.depth;
    } else {
      newParentId = target.parentId;
      newParentDepth = target.parentId
        ? (byId.get(target.parentId)?.depth ?? -1)
        : -1;
    }
    // Collect contiguous subtree blocks
    const indexOf = (id: string) => b.items.findIndex(it => it.id === id);
    const orderedIds = [...ids].sort((a, c) => indexOf(a) - indexOf(c));
    const isDescendantOf = (cand: string, anc: string): boolean => {
      let cur = byId.get(cand);
      while (cur?.parentId) {
        if (cur.parentId === anc) return true;
        cur = byId.get(cur.parentId);
      }
      return false;
    };
    const topLevelMovers = orderedIds.filter(id => !ids.some(o => o !== id && isDescendantOf(id, o)));
    const movedItemIds = new Set<string>();
    interface Block { root: CostItem; items: CostItem[] }
    const blocks: Block[] = [];
    for (const rootId of topLevelMovers) {
      const rIdx = indexOf(rootId);
      if (rIdx < 0) continue;
      const root = b.items[rIdx];
      let endIdx = rIdx + 1;
      while (endIdx < b.items.length && b.items[endIdx].depth > root.depth) endIdx++;
      const blockItems = b.items.slice(rIdx, endIdx);
      blockItems.forEach(bi => movedItemIds.add(bi.id));
      blocks.push({ root, items: blockItems });
    }
    const remaining = b.items.filter(it => !movedItemIds.has(it.id));
    const tIdx = remaining.findIndex(it => it.id === targetId);
    if (tIdx === -1) throw new Error('Target removed during move (sanity check)');
    let insertAt: number;
    if (position === 'before') insertAt = tIdx;
    else if (position === 'inside') insertAt = tIdx + 1;
    else {
      const ti = remaining[tIdx];
      let endIdx = tIdx + 1;
      while (endIdx < remaining.length && remaining[endIdx].depth > ti.depth) endIdx++;
      insertAt = endIdx;
    }
    const rewrittenBlocks: CostItem[][] = blocks.map(block => {
      const delta = (newParentDepth + 1) - block.root.depth;
      return block.items.map((bi, i) => ({
        ...bi,
        parentId: i === 0 ? newParentId : bi.parentId,
        depth: Math.max(0, bi.depth + delta),
      }));
    });
    const flatMoving = rewrittenBlocks.flat();
    let newList = [...remaining.slice(0, insertAt), ...flatMoving, ...remaining.slice(insertAt)];
    const counter = new Map<string, number>();
    newList = newList.map(it => {
      const key = it.parentId ?? '__root__';
      const next = counter.get(key) ?? 0;
      counter.set(key, next + 1);
      return { ...it, sortOrder: next };
    });
    b.items = newList;
    doRecalc();
    sendBridgeMutation("move_items", { ids, targetId, position });
    sendBridgeMutation("set_items", { items: b.items });
    return ok({ success: true, moved: ids.length, targetId, position });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("indent_item", "Indent an item (move under its previous sibling).", {
  id: z.string().describe("Item id"),
}, async ({ id }) => {
  try {
    const b = req();
    const item = b.items.find(i => i.id === id);
    if (!item) throw new Error(`Item "${id}" not found`);
    const siblings = b.items.filter(i => i.parentId === item.parentId);
    const idx = siblings.findIndex(s => s.id === id);
    if (idx <= 0) throw new Error('Cannot indent the first sibling');
    const newParent = siblings[idx - 1];
    if (!isContainer(newParent.rowType)) throw new Error(`Previous sibling ${newParent.rowType} cannot contain children`);
    b.items = b.items.map(i =>
      i.id === id ? { ...i, parentId: newParent.id, depth: newParent.depth + 1 } : i,
    );
    doRecalc();
    sendBridgeMutation("indent_item", { id });
    sendBridgeMutation("set_items", { items: b.items });
    return ok({ success: true, id, newParentId: newParent.id });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("outdent_item", "Outdent an item (move up one level).", {
  id: z.string().describe("Item id"),
}, async ({ id }) => {
  try {
    const b = req();
    const item = b.items.find(i => i.id === id);
    if (!item) throw new Error(`Item "${id}" not found`);
    if (!item.parentId) throw new Error('Item is already at top level');
    const parent = b.items.find(i => i.id === item.parentId);
    if (!parent) throw new Error('Parent missing (corrupt tree)');
    b.items = b.items.map(i =>
      i.id === id ? { ...i, parentId: parent.parentId, depth: Math.max(0, item.depth - 1) } : i,
    );
    doRecalc();
    sendBridgeMutation("outdent_item", { id });
    sendBridgeMutation("set_items", { items: b.items });
    return ok({ success: true, id, newParentId: parent.parentId });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("toggle_collapse", "Collapse or expand a container item.", {
  id: z.string().describe("Item id"),
}, async ({ id }) => {
  try {
    const b = req();
    const item = b.items.find(i => i.id === id);
    if (!item) throw new Error(`Item "${id}" not found`);
    item.isCollapsed = !item.isCollapsed;
    sendBridgeMutation("toggle_collapse", { id });
    return ok({ success: true, id, isCollapsed: item.isCollapsed });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: Document tabs
// ===========================================================================

server.tool("list_documents", "List all open document tabs.", {}, async () => {
  try {
    return ok({
      activeDocumentId: shadow.activeDocumentId,
      count: shadow.documents.length,
      documents: shadow.documents.map(d => ({
        id: d.id, fileName: d.fileName, filePath: d.filePath, isModified: d.isModified,
        itemCount: d.items?.length ?? 0,
      })),
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("add_document", "Open a new document tab (optionally pre-seeded with items / schedule).", {
  fileName: z.string().optional().describe("Tab name (default 'Nieuwe begroting')"),
  filePath: z.string().nullable().optional().describe("File path on disk (null if unsaved)"),
}, async ({ fileName, filePath }) => {
  try {
    const id = crypto.randomUUID();
    const doc: DocumentTab = {
      id,
      fileName: fileName ?? 'Nieuwe begroting',
      filePath: filePath ?? null,
      isModified: false,
    };
    shadow.documents.push(doc);
    shadow.activeDocumentId = id;
    sendBridgeMutation("add_document", { id, fileName: doc.fileName, filePath: doc.filePath });
    return ok({ success: true, id, document: doc });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("switch_document", "Make a document tab active.", {
  id: z.string().describe("Document id"),
}, async ({ id }) => {
  try {
    const d = shadow.documents.find(x => x.id === id);
    if (!d && shadow.documents.length > 0) throw new Error(`Document "${id}" not found`);
    shadow.activeDocumentId = id;
    sendBridgeMutation("switch_document", { id });
    return ok({ success: true, activeDocumentId: id });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("remove_document", "Close a document tab.", {
  id: z.string().describe("Document id"),
}, async ({ id }) => {
  try {
    const before = shadow.documents.length;
    shadow.documents = shadow.documents.filter(d => d.id !== id);
    if (shadow.activeDocumentId === id) {
      shadow.activeDocumentId = shadow.documents[0]?.id ?? null;
    }
    sendBridgeMutation("remove_document", { id });
    return ok({ success: true, removed: before - shadow.documents.length });
  } catch (e: unknown) { return err((e as Error).message); }
});

// ===========================================================================
// New tools: XML importers (CUF, TRAD-XML, RSX, ZSX, NSX)
// Inline ports of src/services/importers/* to Node (DOM via @xmldom).
// ===========================================================================

function xmlParse(text: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const err = (doc as any).getElementsByTagName?.('parsererror')?.[0];
  if (err) throw new Error(`XML parse error: ${err.textContent?.trim() ?? 'unknown'}`);
  return doc as unknown as Document;
}

function xmlGetText(el: Element | null | undefined, tag: string): string {
  if (!el) return '';
  const found = (el as any).getElementsByTagName?.(tag)?.[0];
  return found?.textContent?.trim() ?? '';
}
function xmlGetNumber(el: Element | null | undefined, tag: string): number {
  const raw = xmlGetText(el, tag);
  if (!raw) return 0;
  const t = raw.indexOf(',') >= 0 ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
function xmlGetNumberOrDefault(el: Element | null | undefined, tag: string, def: number): number {
  const raw = xmlGetText(el, tag);
  if (!raw) return def;
  const t = raw.indexOf(',') >= 0 ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : def;
}
function xmlChildren(el: any, tag: string): any[] {
  if (!el || !el.childNodes) return [];
  const out: any[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i];
    if (c.nodeType === 1 && (c.tagName === tag || c.localName === tag)) out.push(c);
  }
  return out;
}

function normalizeUnitXml(raw: string): CostUnit {
  const s = (raw || '').trim().toLowerCase();
  switch (s) {
    case 'm3': case 'm^3': case 'm³': return 'm³';
    case 'm2': case 'm^2': case 'm²': return 'm²';
    case 'm': case 'm1': case 'meter': return 'm';
    case 'stuks': case 'stuk': case 'st': return 'st';
    case 'kg': return 'kg';
    case 'ton': return 'ton';
    case 'uur': case 'h': return 'uur';
    case 'dg': case 'dgn': case 'dag': case 'dagen': return 'dgn';
    case 'km': return 'km';
    case 'keer': return 'keer';
    case 'ls': return 'ls';
    case 'week': case 'wk': return 'week';
    case 'mnd': case 'maand': return 'mnd';
    case 'post': return 'post';
    case '%': return '%';
    case 'pm': return 'pm';
    default: return 'st';
  }
}

function importCufXml(xml: string): { items: CostItem[]; schedule: Partial<CostSchedule>; warnings: string[] } {
  const doc = xmlParse(xml);
  const root = (doc as any).documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];
  const name = xmlGetText(root, 'Naam') || 'Geïmporteerde begroting';
  xmlChildren(root, 'Hoofdstuk').forEach((h: any, idx: number) => {
    const chapter = makeBlankItem({
      id: crypto.randomUUID(),
      parentId: null, sortOrder: items.length, depth: 0, rowType: 'chapter',
      code: h.getAttribute('code') ?? `H${idx + 1}`,
      description: h.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);
    xmlChildren(h, 'Post').forEach((p: any) => {
      const qty = xmlGetNumber(p, 'Hoeveelheid');
      const price = xmlGetNumber(p, 'Prijs');
      const post = makeBlankItem({
        id: crypto.randomUUID(),
        parentId: chapter.id, sortOrder: items.length, depth: 1, rowType: 'begrotingspost',
        code: p.getAttribute('code') ?? '',
        description: p.getAttribute('omschrijving') ?? '',
        quantity: qty, unit: normalizeUnitXml(xmlGetText(p, 'Eenheid')),
        unitPrice: price, total: qty * price,
      });
      items.push(post);
      xmlChildren(p, 'Middel').forEach((m: any) => {
        const t = (m.getAttribute('type') ?? '').toLowerCase();
        const rt: ResourceType =
          t === 'arbeid' ? 'arbeid' :
          t === 'materiaal' ? 'materiaal' :
          t === 'materieel' ? 'materieel' :
          (t === 'onderaanneming' || t === 'onderaannemer') ? 'onderaannemer' :
          'overig';
        items.push(makeBlankItem({
          id: crypto.randomUUID(),
          parentId: post.id, sortOrder: items.length, depth: 2, rowType: 'regel',
          code: m.getAttribute('code') ?? '',
          description: m.getAttribute('omschrijving') ?? '',
          quantity: xmlGetNumber(m, 'Hoeveelheid'),
          unit: normalizeUnitXml(xmlGetText(m, 'Eenheid')),
          unitPrice: xmlGetNumber(m, 'Prijs'),
          normFactor: xmlGetNumberOrDefault(m, 'Normfactor', 1),
          normDivisor: xmlGetNumberOrDefault(m, 'Normdeler', 1),
          resourceType: rt,
        }));
      });
      xmlChildren(p, 'Toeslag').forEach((t: any) => {
        warnings.push(`Toeslag "${t.getAttribute('code') ?? '?'}" wordt niet geïmporteerd`);
      });
    });
  });
  if (items.length === 0) warnings.push('CUF-bestand bevat geen hoofdstukken.');
  return { items, schedule: { name }, warnings };
}

function importTradxmlXml(xml: string): { items: CostItem[]; schedule: Partial<CostSchedule>; warnings: string[] } {
  const doc = xmlParse(xml);
  const root = (doc as any).documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];
  const kop = xmlChildren(root, 'Kop')[0];
  const name = xmlGetText(kop, 'Projectnaam') || 'IBIS import';
  const addChapter = (el: any, parentId: string | null, depth: number) => {
    const item = makeBlankItem({
      id: crypto.randomUUID(),
      parentId, sortOrder: items.length, depth, rowType: 'chapter',
      code: el.getAttribute('code') ?? '',
      description: el.getAttribute('omschrijving') ?? '',
    });
    items.push(item);
    return item.id;
  };
  const addActivity = (el: any, parentId: string, depth: number) => {
    const qty = xmlGetNumber(el, 'Hoeveelheid');
    const price = xmlGetNumber(el, 'Eenheidsprijs');
    items.push(makeBlankItem({
      id: crypto.randomUUID(),
      parentId, sortOrder: items.length, depth, rowType: 'begrotingspost',
      code: el.getAttribute('code') ?? '',
      description: el.getAttribute('omschrijving') ?? '',
      quantity: qty, unit: normalizeUnitXml(xmlGetText(el, 'Eenheid')),
      unitPrice: price, total: qty * price,
    }));
  };
  xmlChildren(root, 'Hoofdstuk').forEach((h: any) => {
    const hId = addChapter(h, null, 0);
    xmlChildren(h, 'Element').forEach((e: any) => {
      const eId = addChapter(e, hId, 1);
      xmlChildren(e, 'Activiteit').forEach((a: any) => addActivity(a, eId, 2));
    });
    xmlChildren(h, 'Activiteit').forEach((a: any) => addActivity(a, hId, 1));
  });
  if (items.length === 0) warnings.push('TRADXML bevat geen hoofdstukken.');
  return { items, schedule: { name }, warnings };
}

function importRsxXml(xml: string): { items: CostItem[]; schedule: Partial<CostSchedule>; warnings: string[] } {
  const doc = xmlParse(xml);
  const warnings: string[] = [];
  const items: CostItem[] = [];
  const bestek = (doc as any).getElementsByTagName('Bestek')[0] ?? null;
  const name = xmlGetText(bestek, 'Naam') || 'RAW import';
  const deelramingen = (doc as any).getElementsByTagName('Deelraming');
  for (let i = 0; i < deelramingen.length; i++) {
    const d = deelramingen[i];
    const chapter = makeBlankItem({
      id: crypto.randomUUID(),
      parentId: null, sortOrder: items.length, depth: 0, rowType: 'chapter',
      code: d.getAttribute('code') ?? '',
      description: d.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);
    const rvs = d.getElementsByTagName('Resultaatsverplichting');
    for (let j = 0; j < rvs.length; j++) {
      const rv = rvs[j];
      const qty = xmlGetNumber(rv, 'Hoeveelheid');
      const price = xmlGetNumber(rv, 'Prijs');
      items.push(makeBlankItem({
        id: crypto.randomUUID(),
        parentId: chapter.id, sortOrder: items.length, depth: 1, rowType: 'begrotingspost',
        code: rv.getAttribute('besteksnummer') ?? '',
        description: xmlGetText(rv, 'Omschrijving'),
        quantity: qty, unit: normalizeUnitXml(xmlGetText(rv, 'Eenheid')),
        unitPrice: price, total: qty * price,
      }));
    }
  }
  if (items.length === 0) warnings.push('RSX bevat geen deelramingen.');
  return { items, schedule: { name }, warnings };
}

function importZsxXml(xml: string): { resources: ResourceLibraryItem[]; warnings: string[] } {
  const doc = xmlParse(xml);
  const root = (doc as any).documentElement;
  const warnings: string[] = [];
  const resources: ResourceLibraryItem[] = [];
  if (!root) {
    warnings.push('ZSX document heeft geen root element.');
    return { resources, warnings };
  }
  const middelen = xmlChildren(root, 'Middel');
  if (middelen.length === 0) warnings.push('ZSX bevat geen <Middel> elementen.');
  for (const m of middelen) {
    const code = m.getAttribute('code') ?? '';
    const naam = m.getAttribute('naam') ?? m.getAttribute('omschrijving') ??
      xmlGetText(m, 'Naam') ?? xmlGetText(m, 'Omschrijving') ?? '';
    const typeAttr = m.getAttribute('type') ?? xmlGetText(m, 'Type') ?? '';
    const t = (typeAttr || '').toLowerCase().trim();
    const resourceType: ResourceType =
      t === 'arbeid' ? 'arbeid' :
      t === 'materiaal' ? 'materiaal' :
      t === 'materieel' ? 'materieel' :
      (t === 'onderaanneming' || t === 'onderaannemer') ? 'onderaannemer' :
      'overig';
    const unit = normalizeUnitXml(xmlGetText(m, 'Eenheid'));
    const price = xmlGetNumber(m, 'Prijs');
    resources.push({
      id: crypto.randomUUID(),
      code, description: naam, unit, resourceType,
      defaultUnitPrice: Number.isFinite(price) ? price : null,
      category: m.getAttribute('categorie') ?? '',
    });
  }
  return { resources, warnings };
}

function importNsxXml(xml: string): { norms: any[]; warnings: string[] } {
  const doc = xmlParse(xml);
  const root = (doc as any).documentElement;
  const warnings: string[] = [];
  const norms: any[] = [];
  if (!root) {
    warnings.push('NSX document heeft geen root element.');
    return { norms, warnings };
  }
  const entries = xmlChildren(root, 'Norm');
  if (entries.length === 0) warnings.push('NSX bevat geen <Norm> elementen.');
  for (const n of entries) {
    norms.push({
      id: crypto.randomUUID(),
      code: n.getAttribute('code') ?? '',
      middelCode: n.getAttribute('middelcode') ?? '',
      description: n.getAttribute('omschrijving') ?? '',
      factor: xmlGetNumberOrDefault(n, 'Factor', 1),
      divisor: xmlGetNumberOrDefault(n, 'Deler', 1),
      unit: xmlGetText(n, 'Eenheid'),
    });
  }
  return { norms, warnings };
}

function ensureBudgetForImport() {
  if (!currentBudget) {
    const schedule = defaultSchedule();
    currentBudget = {
      filePath: '',
      project: {
        version: FILE_FORMAT_VERSION, schedule, items: [],
        resourceLibrary: [], companyInfo: emptyCompanyInfo(),
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
      },
      items: [],
      schedule,
    };
  }
}

server.tool("import_cuf_xml", "Import a CUF-XML (Calculatie Uitwisselings Formaat) string into the current budget. Returns parsed items and warnings.", {
  xmlContent: z.string().describe("CUF-XML content as a string"),
  replace: z.boolean().optional().describe("Replace existing items (default: false, append)"),
}, async ({ xmlContent, replace }) => {
  try {
    ensureBudgetForImport();
    const b = req();
    const res = importCufXml(xmlContent);
    const baseItems = replace ? [] : b.items.filter(i => !isStagart(i.rowType));
    const staart = b.items.filter(i => isStagart(i.rowType));
    b.items = [...baseItems, ...res.items, ...staart];
    if (res.schedule.name) b.schedule.name = res.schedule.name;
    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });
    return ok({
      success: true, format: 'cuf', importedCount: res.items.length,
      warnings: res.warnings,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("import_tradxml", "Import an IBIS-TRAD XML string (Hoofdstuk → Element → Activiteit).", {
  xmlContent: z.string().describe("TRAD-XML content"),
  replace: z.boolean().optional().describe("Replace existing items (default: false)"),
}, async ({ xmlContent, replace }) => {
  try {
    ensureBudgetForImport();
    const b = req();
    const res = importTradxmlXml(xmlContent);
    const baseItems = replace ? [] : b.items.filter(i => !isStagart(i.rowType));
    const staart = b.items.filter(i => isStagart(i.rowType));
    b.items = [...baseItems, ...res.items, ...staart];
    if (res.schedule.name) b.schedule.name = res.schedule.name;
    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });
    return ok({
      success: true, format: 'tradxml', importedCount: res.items.length,
      warnings: res.warnings,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("import_rsx", "Import a RAW RSX (CROW) XML string into the current budget.", {
  xmlContent: z.string().describe("RSX-XML content"),
  replace: z.boolean().optional().describe("Replace existing items (default: false)"),
}, async ({ xmlContent, replace }) => {
  try {
    ensureBudgetForImport();
    const b = req();
    const res = importRsxXml(xmlContent);
    const baseItems = replace ? [] : b.items.filter(i => !isStagart(i.rowType));
    const staart = b.items.filter(i => isStagart(i.rowType));
    b.items = [...baseItems, ...res.items, ...staart];
    if (res.schedule.name) b.schedule.name = res.schedule.name;
    doRecalc();
    sendBridgeMutation("set_items", { items: b.items });
    return ok({
      success: true, format: 'rsx', importedCount: res.items.length,
      warnings: res.warnings,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("import_zsx", "Import a ZSX prijzenbestand (price list) into the resource library.", {
  xmlContent: z.string().describe("ZSX-XML content"),
  replace: z.boolean().optional().describe("Replace existing library (default: false, append)"),
}, async ({ xmlContent, replace }) => {
  try {
    ensureShadowFromBudget();
    const res = importZsxXml(xmlContent);
    if (replace) shadow.resourceLibrary = res.resources;
    else shadow.resourceLibrary = [...shadow.resourceLibrary, ...res.resources];
    sendBridgeMutation("set_resource_library", { items: shadow.resourceLibrary });
    return ok({
      success: true, format: 'zsx', importedCount: res.resources.length,
      libraryTotal: shadow.resourceLibrary.length, warnings: res.warnings,
    });
  } catch (e: unknown) { return err((e as Error).message); }
});

server.tool("import_nsx", "Import an NSX normenbestand (norms file). Returns parsed norms (no internal slice yet).", {
  xmlContent: z.string().describe("NSX-XML content"),
}, async ({ xmlContent }) => {
  try {
    const res = importNsxXml(xmlContent);
    sendBridgeMutation("import_nsx", { norms: res.norms });
    return ok({
      success: true, format: 'nsx', importedCount: res.norms.length,
      norms: res.norms.slice(0, 50), warnings: res.warnings,
    });
  } catch (e: unknown) { return err((e as Error).message); }
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
