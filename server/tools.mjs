import { COST_ROW_TYPES } from '../src/types/costModel.ts';
import { calculateProject, getStaartBreakdown } from '../src/lib/core.ts';
const rowTypes = new Set(COST_ROW_TYPES);
const numberFields = ['quantity','normQuantity','normFactor','normDivisor','normUnitPrice','laborPrice','materialPrice','unitPrice','total','staartPercentage','staartDoelbedrag','staartVastBedrag','staartAfrondingStap','staartBtwBasis'];
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !project.schedule || typeof project.schedule !== 'object' || Array.isArray(project.schedule) || !Array.isArray(project.items)) throw new ApiError(400, 'INVALID_PROJECT', 'Expected a project with schedule and items.');
  if (project.items.length > 20000) throw new ApiError(413, 'TOO_MANY_ITEMS', 'At most 20,000 items are accepted.');
  const parents = new Map();
  for (const item of project.items) {
    if (!item || typeof item.id !== 'string' || !item.id || parents.has(item.id) || !rowTypes.has(item.rowType)) throw new ApiError(400, 'INVALID_ITEM', 'Each item needs a unique id and a supported rowType.');
    if (item.parentId != null && typeof item.parentId !== 'string') throw new ApiError(400, 'INVALID_PARENT', 'parentId must be a string or null.');
    for (const field of numberFields) if (item[field] != null && (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || Math.abs(item[field]) > 1e15)) throw new ApiError(400, 'INVALID_NUMBER', `Invalid ${field}.`);
    parents.set(item.id, item.parentId ?? null);
  }
  for (const id of parents.keys()) {
    const seen = new Set(); let parent = id;
    while (parent != null && parents.has(parent)) {
      if (seen.has(parent) || seen.size > 256) throw new ApiError(400, 'INVALID_TREE', 'The project tree has a cycle or exceeds 256 levels.');
      seen.add(parent); parent = parents.get(parent);
    }
  }
  if (project.schedule.tarieven && (typeof project.schedule.tarieven !== 'object' || Array.isArray(project.schedule.tarieven) || Object.values(project.schedule.tarieven).some(value => typeof value !== 'number' || !Number.isFinite(value)))) throw new ApiError(400, 'INVALID_TARIFF', 'Tariffs must be finite numbers.');
  return project;
}

export const projectSchema = {
  type: 'object', required: ['schedule', 'items'], additionalProperties: true,
  properties: {
    version: { type: 'string' },
    schedule: { type: 'object', additionalProperties: true, properties: { tarieven: { type: 'object', additionalProperties: { type: 'number' } } } },
    items: { type: 'array', maxItems: 20000, items: {
      type: 'object', required: ['id', 'rowType'], additionalProperties: true,
      properties: { id: { type: 'string', minLength: 1 }, parentId: { type: ['string', 'null'] }, rowType: { type: 'string', enum: [...COST_ROW_TYPES] },
        ...Object.fromEntries(numberFields.map(field => [field, { type: ['number', 'null'], minimum: -1e15, maximum: 1e15 }])) },
    } },
  },
};
export const tools = [
  { name: 'calculate_project', description: 'Recalculate an inline native estimate with the same calculator as the desktop; returns project and totals.',
    inputSchema: { type: 'object', properties: { project: projectSchema }, required: ['project'], additionalProperties: false } },
  { name: 'get_project_totals', description: 'Calculate and summarize an inline estimate without changing it.',
    inputSchema: { type: 'object', properties: { project: projectSchema }, required: ['project'], additionalProperties: false } },
];
export function executeTool(name, args) {
  if (!tools.some(tool => tool.name === name)) throw new ApiError(404, 'UNKNOWN_TOOL', 'Unknown calculation tool.');
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'project')) throw new ApiError(400, 'INVALID_ARGUMENTS', 'Only inline project data is accepted; server paths and desktop commands are not available.');
  const calculated = calculateProject(validateProject(args.project));
  for (const item of calculated.items) if (!Number.isFinite(item.total) || !Number.isFinite(item.unitPrice)) throw new ApiError(422, 'CALCULATION_OVERFLOW', 'The calculated amount is outside the numeric range.');
  const totals = getStaartBreakdown(calculated.items);
  return name === 'get_project_totals' ? { totals } : { project: calculated, totals };
}
export { ApiError };
