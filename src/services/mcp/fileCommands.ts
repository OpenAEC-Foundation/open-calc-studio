import { useAppStore } from '@/state/appStore';
import { openImportResult, openProjectJson } from '@/services/file/openProject';
import { importBudget } from '@/lib/importers';
import { serializeProject } from '@/services/file/fileService';
export async function fileCommand(action:string,p:Record<string,unknown>) {
 const s=useAppStore.getState();
 if(action==='import') {
  if(typeof p.fileName!=='string'||typeof p.dataBase64!=='string')throw Error('fileName and dataBase64 are required.');
  const data=Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0));const text=new TextDecoder().decode(data);
  if(/\.(ifccalc|ocs|ifcx|json)$/i.test(p.fileName))return {documentId:openProjectJson(text,p.fileName)};
  const format=String(p.format??'').toLowerCase();
  const readers=await import('@/services/importers');
  const map={cuf:readers.importCuf,tradxml:readers.importTradxml,rsx:readers.importRsx,s01:readers.importS01,sufx:readers.importSufx,rsu:readers.importRsu,zsx:readers.importZsx,nsx:readers.importNsx,bmecat:readers.importBmecat};
  const reader=Object.prototype.hasOwnProperty.call(map,format)?map[format as keyof typeof map]:null;
  const result=reader?reader(text):await importBudget(data.buffer,p.fileName);
  if('resources' in result)s.setResourceLibrary([...s.resourceLibrary,...result.resources]);
  if('items' in result)return {documentId:openImportResult(result,p.fileName),warnings:result.warnings};
  return result;
 }
 if(action!=='export')throw Error('Unknown file command');
 if(typeof p.outputPath!=='string'||!p.outputPath.trim())throw Error('outputPath is required.');
 const fs=await import('@tauri-apps/plugin-fs');
 if(!p.overwrite&&await fs.exists(p.outputPath))throw Error('Output exists; choose a new path or explicitly set overwrite:true.');
 let bytes:Uint8Array;let warnings:string[]=[];
 const format=String(p.format??'');
 if(format==='wpcalc') {
  const {buildExportRequest}=await import('@/services/export/wpcalcExporter');
  const {invoke}=await import('@tauri-apps/api/core');
  await invoke('export_wpcalc',{request:buildExportRequest(s.schedule,s.items,s.companyInfo),outputPath:p.outputPath});return {outputPath:p.outputPath};
 }
 if(format==='bc3')bytes=(await import('@/services/export/bc3Exporter')).buildBc3Bytes(s.schedule,s.items).bytes;
 else if(format==='inschrijfstaat')bytes=new Uint8Array(await (await (await import('@/services/export/inschrijfstaatExporter')).exportInschrijfstaatAsync(s.schedule,s.items,s.companyInfo)).arrayBuffer());
 else if(format==='native') {const project=JSON.parse(serializeProject(s.schedule,s.items,s.companyInfo,{sheets:s.subSheets,activeSheetId:s.activeSubSheetId},s.offerte,s.snapshots));project.resourceLibrary=s.resourceLibrary;bytes=new TextEncoder().encode(JSON.stringify(project,null,2));}
 else {
  const exporters=await import('@/services/exporters');
  const map={onlv:exporters.exportOnlv,cuf:exporters.exportCuf,tradxml:exporters.exportTradxml,rsx:exporters.exportRsx};
  if(!Object.prototype.hasOwnProperty.call(map,format))throw Error(`Unsupported export format: ${format}`);
  const result=map[format as keyof typeof map]({schedule:s.schedule,items:s.items});warnings=result.warnings;bytes=new TextEncoder().encode(result.xml);
 }
 await fs.writeFile(p.outputPath,bytes,{createNew:!p.overwrite});return {outputPath:p.outputPath,byteCount:bytes.length,warnings};
}
