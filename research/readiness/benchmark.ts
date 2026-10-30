import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { recalculateItems, getGrandTotal } from '@/services/calculation/calculator';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { previewPriceUpdates, capturePriceOrigin } from '@/services/pricing/priceUpdates';
import { parseTakeoff } from '@/services/ifc/ifcTakeoff';
import { compareIfcRevisions } from '@/services/revisions/ifcRevisions';
import type { CostItem, ResourceLibraryItem } from '@/types/costModel';

const sample = deserializeProject(readFileSync('public/data/voorbeeld.ifcCalc', 'utf8'));
const rowTemplate = sample.items.find(item => item.rowType === 'regel')!, chapterTemplate = sample.items.find(item => item.rowType === 'chapter')!;
const results: unknown[] = [];
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 10) / 10;
function measure(name: string, size: number, action: () => unknown) {
  const times: number[] = []; let rss = 0;
  for (let run = 0; run < 3; run++) {
    global.gc?.(); const before = process.memoryUsage().rss, start = performance.now();
    action(); times.push(Math.round((performance.now() - start) * 10) / 10); rss = Math.max(rss, process.memoryUsage().rss - before);
  }
  const sorted = [...times].sort((a, b) => a - b);
  results.push({ name, size, runsMs: times, medianMs: sorted[1], maxRssIncreaseMiB: mb(rss) });
  console.log(name, size, 'median', sorted[1], 'ms');
}
const article: ResourceLibraryItem = { id: 'benchmark:A', catalogueId: 'benchmark', catalogueVersion: '1', currency: 'EUR', source: 'Synthetic benchmark', priceDate: '2026-10-30', code: 'A', description: 'Material', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 10, category: '' };
const origin = capturePriceOrigin(article, 'EUR');
for (const count of [1000, 10_000, 50_000]) {
  const items: CostItem[] = [];
  for (let i = 0; i < count; i++) {
    const chapter = `chapter-${Math.floor(i / 100)}`;
    if (i % 100 === 0) items.push({ ...chapterTemplate, id: chapter, parentId: null, depth: 0, sortOrder: i / 100 });
    items.push({ ...rowTemplate, id: `row-${i}`, parentId: chapter, rowType: 'regel', depth: 1, sortOrder: i % 100, quantity: 2, unit: 'st', normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 10, tariefGroep: null, materialPrice: null, laborPrice: null, resourceType: 'materiaal', resourceLibraryId: article.id, priceOrigin: origin, quantityLink: null, history: undefined });
  }
  const calculated = recalculateItems(items, sample.schedule.tarieven);
  if (Math.abs(getGrandTotal(calculated) - count * 20) > .001) throw Error('Unexpected benchmark total.');
  measure('budget-recalculate', count, () => recalculateItems(items, sample.schedule.tarieven));
  const serialized = serializeProject(sample.schedule, calculated);
  measure('project-save-open', count, () => deserializeProject(serializeProject(sample.schedule, calculated)));
  measure('price-preview', count, () => {
    const plan = previewPriceUpdates(calculated, sample.schedule, [{ ...article, catalogueVersion: '2', defaultUnitPrice: 12 }]);
    if (plan.rows.filter(row => row.status === 'changed').length !== count) throw Error('Not every benchmark price was matched.');
  });
  results.push({ name: 'project-size', rows: count, bytes: Buffer.byteLength(serialized), processRssMiB: mb(process.memoryUsage().rss) });
}
const base = readFileSync('test/fixtures/ifc-lite/wall-quantities.ifc', 'utf8').split('#20=')[0];
for (const count of [1000, 5000]) {
  let text = base;
  const guid = (n: number) => n.toString(36).padStart(22, '0');
  for (let i = 0; i < count; i++) {
    const id = 20 + i * 10;
    text += `#${id}=IFCWALL('${guid(i+1)}',$,'Wall ${i}',$,$,#11,#17,$,.NOTDEFINED.);\n#${id+1}=IFCQUANTITYVOLUME('NetVolume',$,$,2.4,$);\n#${id+2}=IFCELEMENTQUANTITY('${guid(100000+i)}',$,'Qto_WallBaseQuantities',$,$,(#${id+1}));\n#${id+3}=IFCRELDEFINESBYPROPERTIES('${guid(200000+i)}',$,$,$,(#${id}),#${id+2});\n`;
  }
  text += 'ENDSEC;\nEND-ISO-10303-21;\n';
  const bytes = new TextEncoder().encode(text);
  const times: number[] = []; let model: Awaited<ReturnType<typeof parseTakeoff>> | undefined;
  for (let run = 0; run < 3; run++) { const start = performance.now(); model = await parseTakeoff(Uint8Array.from(bytes).buffer, 'generated.ifc'); times.push(Math.round((performance.now() - start) * 10) / 10); }
  if (model!.elements.length !== count) throw Error('IFC benchmark element mismatch.');
  results.push({ name: 'ifc-parse-quantities', elements: count, bytes: bytes.length, runsMs: times, medianMs: [...times].sort((a,b)=>a-b)[1], includesGeometryRendering: false });
  const next = { ...model!, id: 'new-revision', elements: model!.elements.map((element, i) => ({ ...element, expressId: element.expressId + 1_000_000, quantities: element.quantities.map(q => ({ ...q, value: q.value * (i % 10 === 0 ? 2 : 1) })) })) };
  measure('ifc-revision-comparison', count, () => compareIfcRevisions(model!, next));
}
for (const size of [1, 10, 30]) {
  const source = { id: 'synthetic-pdf', fileName: 'synthetic.pdf', dataBase64: Buffer.alloc(size * 1024 * 1024).toString('base64'), measurements: [], pageScales: {} };
  const schedule = { ...sample.schedule, pdfWorkspace: { version: 1 as const, activeSourceId: source.id, sources: [source] } };
  measure('embedded-pdf-project-save-open', size, () => deserializeProject(serializeProject(schedule, sample.items)));
}
writeFileSync(process.argv[2] ?? '/tmp/ocs-safeguards-performance.json', JSON.stringify({
  version: JSON.parse(readFileSync('package.json','utf8')).version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, memoryGiB: Math.round(totalmem()/1024**3) },
  limitations: ['Synthetic generated budgets and IFC data; no user files', 'PDF test measures embedded bytes serialization, not PDF rendering', 'IFC tests parse quantities and compare metadata, not GPU mesh rendering', 'Process RSS delta is not a peak or phone/cloud capacity guarantee', 'Three runs per measurement; no statistical performance guarantee'], results,
}, null, 2) + '\n');
