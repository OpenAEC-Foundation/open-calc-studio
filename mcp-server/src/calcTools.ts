import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, type ZodTypeAny } from 'zod';
import definitions from '../../src/services/mcp/siteAppTools.json';
import { desktopRequest } from './appTools';

/**
 * The `calc_*` tools of the SuperCloud assistant (`window.__OPDS_APP__`, `mcp-tools.json`) under the same names on the
 * desktop. They run in the app through the command `calc.tool`: the same code as on the site, so a prompt or skill
 * written for one works on the other. The existing tools without prefix stay as they are.
 */
interface Schema { type?: string; enum?: unknown[]; anyOf?: Schema[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; description?: string }

/**
 * The part of JSON Schema that siteAppTools.json uses, as zod, so `tools/list` shows the same parameters. The SDK takes a
 * raw shape, so unknown top-level fields pass here; the app refuses them against the JSON schema (`unknown field`).
 */
export function zodFromSchema(schema: Schema): ZodTypeAny {
  let type: ZodTypeAny;
  if (schema.anyOf?.length === 1) return zodFromSchema({ ...schema.anyOf[0], description: schema.description ?? schema.anyOf[0].description });
  if (schema.anyOf) type = z.union(schema.anyOf.map(zodFromSchema) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  else if (schema.enum) {
    const literals = schema.enum.map(value => z.literal(value as string | number | boolean | null));
    type = literals.length === 1 ? literals[0] : z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }
  else if (schema.type === 'null') type = z.null();
  else if (schema.type === 'string') type = z.string();
  else if (schema.type === 'number') type = z.number();
  else if (schema.type === 'boolean') type = z.boolean();
  else if (schema.type === 'array') type = z.array(schema.items ? zodFromSchema(schema.items) : z.unknown());
  else if (schema.type === 'object') {
    const object = z.object(shapeFromSchema(schema));
    type = schema.additionalProperties === false ? object.strict() : object.passthrough();
  } else type = z.unknown();
  return schema.description ? type.describe(schema.description) : type;
}

function shapeFromSchema(schema: Schema): Record<string, ZodTypeAny> {
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => {
    const type = zodFromSchema(value);
    return [key, required.has(key) ? type : type.optional()];
  }));
}

const ok = (result: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] });
const error = (e: unknown) => ({ content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true as const });

export const calcToolNames = definitions.tools.map(tool => tool.name);

export function registerCalcTools(server: McpServer) {
  for (const tool of definitions.tools) {
    server.tool(tool.name, `${tool.description} Requires the running desktop app.`, shapeFromSchema(tool.inputSchema as Schema), async args => {
      try { return ok(await desktopRequest('calc.tool', { name: tool.name, args })); } catch (e) { return error(e); }
    });
  }
}
