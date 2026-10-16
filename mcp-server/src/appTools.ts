import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync,writeFileSync } from 'node:fs';
import { basename,extname,resolve } from 'node:path';
import catalogue from '../../src/services/mcp/desktopActions.json';
import { workspaceActions } from '../../src/services/mcp/workspaceActionCatalogue';
const ok=(result:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(result,null,2)}]});
const error=(e:unknown)=>({content:[{type:'text' as const,text:e instanceof Error?e.message:String(e)}],isError:true as const});
export async function desktopRequest(action:string,params:Record<string,unknown>={}) {
  const base=new URL(process.env.OCS_DESKTOP_API_URL??'http://127.0.0.1:9742');
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.protocol!=='http:')throw Error('Desktop API must be a local HTTP address.');
  const response=await fetch(new URL('/api/v1/command',base),{method:'POST',headers:{'content-type':'application/json',...(process.env.OCS_API_TOKEN?{authorization:`Bearer ${process.env.OCS_API_TOKEN}`}:{})},body:JSON.stringify({action,params}),signal:AbortSignal.timeout(95000)});
  if(!response.ok)throw Error(`Desktop action failed (${response.status}): ${await response.text()}`);
  const body=await response.json() as {success:boolean;result?:unknown;error?:string};
  if(!body.success)throw Error(body.error??'Desktop rejected the action');return body.result;
}
export function registerAppTools(server:McpServer, loadProject:(path:string)=>Promise<{project:unknown;warnings:unknown}>) {
  server.tool('app_list_actions','List all desktop functions and their exact named parameters. Call app_action to execute one. Includes budget editing, sheets, snapshots, offers, UI, accounts/cloud, PDF measurements and IFC-Lite selection/takeoff.',{group:z.string().optional(),action:z.string().optional()},async({group,action})=>ok({actions:Object.fromEntries(Object.entries(catalogue.actions).filter(([name,v])=>(!action||name===action)&&(!group||v.group.toLowerCase()===group.toLowerCase())).map(([name,v])=>[name,action?v:{group:v.group,signature:v.signature}])),workspaceActions,callbackOnlyHooks:catalogue.excluded}));
  server.tool('app_get_state','Read the live desktop budget, view and selection. Does not read a stale MCP shadow document.',{},async()=>{try{return ok(await desktopRequest('getState'));}catch(e){return error(e);}});
  server.tool('app_action','Execute a desktop function from app_list_actions using named parameters. Requires the running app. Returns after execution or an actual error. For PDF/IFC use pdf.* and ifc.* actions. Uses the real desktop document; standalone tools use separate server state.',{action:z.string(),params:z.record(z.string(),z.unknown()).optional()},async({action,params})=>{try{return ok(await desktopRequest(action,params));}catch(e){return error(e);}});
  for(const kind of ['ifc','pdf'] as const)server.tool(`app_open_${kind}`,`Read a local ${kind.toUpperCase()} file and open it in the current desktop budget.`,{filePath:z.string()},async({filePath})=>{try{const path=resolve(filePath);if(extname(path).toLowerCase()!==`.${kind}`)throw Error(`Expected .${kind}`);const bytes=readFileSync(path);if(bytes.length>(kind==='pdf'?30:100)*1024*1024)throw Error('File is too large');const result=await desktopRequest(kind==='pdf'?'pdf.add':'ifc.load',{fileName:basename(path),dataBase64:bytes.toString('base64')});await desktopRequest('setActiveContentTab',{tab:kind==='pdf'?'pdf':'viewer3d'});return ok(result);}catch(e){return error(e);}});
  server.tool('app_open_budget','Open a supported budget file as a new live desktop document, including all native project data.',{filePath:z.string()},async({filePath})=>{try{const path=resolve(filePath);const {project,warnings}=await loadProject(path);const native=['.ifccalc','.ocs','.json','.ifcx'].includes(extname(path).toLowerCase());return ok({result:await desktopRequest('openProject',{json:JSON.stringify(project),fileName:basename(path),...(native?{filePath:path}:{})}),warnings});}catch(e){return error(e);}});
  server.tool('app_save_budget','Save the complete live desktop project to a new native file. Never overwrites an existing file.',{filePath:z.string()},async({filePath})=>{try{const path=resolve(filePath);if(!['.ifccalc','.ocs','.json','.ifcx'].includes(extname(path).toLowerCase()))throw Error('Use a native extension');const project=await desktopRequest('getProject');writeFileSync(path,JSON.stringify(project,null,2),{flag:'wx'});return ok({filePath:path});}catch(e){return error(e);}});
}
