// CLI evidence for #69; inputs stay local and are not copied into the repository.
// Bundle with esbuild (see docs/ifcx-interoperability.md).
import { readFileSync } from 'node:fs';
import { importIfcx } from '../src/services/importers/ifcxImporter';
import { recalculateItems, getGrandTotal } from '../src/services/calculation/calculator';
import { serializeProject, deserializeProject } from '../src/services/file/fileService';
import { createDefaultSchedule } from '../src/data/defaultBudget';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide the estimate and resolved quantity IFCX files.');
const data = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).data);
const result = importIfcx(JSON.stringify({ data }));
const calculated = recalculateItems(result.items);
const reopened = deserializeProject(serializeProject({ ...createDefaultSchedule(), ...result.schedule }, calculated));
let maximumDelta = 0;
for (const item of recalculateItems(reopened.items)) {
  if (item.rowType !== 'begrotingspost') continue;
  const original = result.items.find(source => source.id === item.id)!;
  maximumDelta = Math.max(maximumDelta, Math.abs(item.total - original.total));
  if (JSON.stringify(item.quantityOrigin) !== JSON.stringify(original.quantityOrigin)) throw new Error(`Lost provenance: ${item.id}`);
}
if (maximumDelta > 1e-7) throw new Error(`Amounts changed after recalculation: ${maximumDelta}`);
console.log(JSON.stringify({ rows: result.items.length, currency: result.schedule.currency,
  directCostsOnly: result.schedule.directCostsOnly, total: getGrandTotal(calculated),
  maximumAmountDeltaAfterSaveReopen: maximumDelta, warnings: result.warnings }, null, 2));
