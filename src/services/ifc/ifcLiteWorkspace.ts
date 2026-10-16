import { useAppStore } from '@/state/appStore';
import { parseTakeoff, aggregateTakeoff, type TakeoffModel } from './ifcTakeoff';
import type { MeshData } from '@ifc-lite/geometry';
import { recalculateItems } from '@/services/calculation/calculator';
export interface IfcSession {model:TakeoffModel; meshes:MeshData[]; selected:number[]; isolated:boolean; cameraRevision:number}
const sessions=new Map<string,IfcSession>();
const listeners=new Set<()=>void>();
let revision=0;
export const subscribeIfc=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const ifcRevision=()=>revision;
const notify=()=>{revision++;listeners.forEach(fn=>fn());};
export const getIfcSession=(documentId:string)=>sessions.get(documentId);
export async function loadIfcModel(buffer:ArrayBuffer,fileName:string) {
  const docId=useAppStore.getState().activeDocumentId;
  if(!docId)throw Error('Open eerst een begroting.');
  const model=await parseTakeoff(buffer,fileName);
  const {GeometryProcessor}=await import('@ifc-lite/geometry');
  const geometry=new GeometryProcessor({preferNative:false,enableInstancing:false});
  const meshes:MeshData[]=[];
  try {await geometry.init();for await(const event of geometry.processStreaming(new Uint8Array(buffer)))if(event.type==='batch')meshes.push(...event.meshes);} finally {geometry.dispose();}
  if(useAppStore.getState().activeDocumentId!==docId)throw Error('Actieve begroting is gewijzigd tijdens het laden; laad het model opnieuw.');
  sessions.set(docId,{model,meshes,selected:[],isolated:false,cameraRevision:0});
  const s=useAppStore.getState();const saved=s.schedule.ifcTakeoff??{models:[],entries:[]};
  s.setSchedule({ifcTakeoff:{...saved,models:[...saved.models.filter(m=>m.id!==model.id),model]}});
  s.updateDocument(docId,{isModified:true});notify();
  return {modelId:model.id,fileName,elementCount:model.elements.length,meshCount:meshes.length};
}
export async function ifcCommand(action:string,p:Record<string,unknown>) {
  const s=useAppStore.getState();
  if(action==='load') {
    if(typeof p.dataBase64!=='string'||typeof p.fileName!=='string')throw Error('fileName en dataBase64 zijn verplicht.');
    if(p.dataBase64.length>140*1024*1024)throw Error('IFC is groter dan 100 MB.');
    return loadIfcModel(Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0)).buffer,p.fileName);
  }
  const session=sessions.get(s.activeDocumentId);
  if(action==='listModels')return s.schedule.ifcTakeoff?.models.map(m=>({id:m.id,fileName:m.fileName,elementCount:m.elements.length}))??[];
  const model=session?.model??s.schedule.ifcTakeoff?.models.find(m=>m.id===p.modelId);
  if(!model)throw Error('Laad eerst een IFC-model, of geef een opgeslagen modelId mee.');
  if(action==='listElements')return model.elements.filter(e=>!p.search||`${e.type} ${e.name}`.toLowerCase().includes(String(p.search).toLowerCase()));
  if(action==='getSelection')return {modelId:model.id,elementIds:session?.selected??[]};
  if(action==='select') {
    if(!session)throw Error('Open het model eerst in de 3D-weergave.');
    if(!Array.isArray(p.elementIds)||p.elementIds.some(id=>!Number.isInteger(id)||!model.elements.some(e=>e.expressId===id)))throw Error('Ongeldige elementselectie.');
    session.selected=[...new Set(p.elementIds as number[])];notify();return {elementIds:session.selected};
  }
  if(action==='isolate'||action==='fit') {if(!session)throw Error('Open het model in de 3D-weergave.');if(action==='fit')session.cameraRevision++;else session.isolated=p.enabled!==false;notify();return {success:true};}
  if(action==='takeoff') {
    const ids=(p.elementIds??session?.selected) as number[];
    if(!Array.isArray(ids))throw Error('elementIds is verplicht.');
    const q=aggregateTakeoff(model,ids,String(p.quantityKey));
    if(p.itemId==null)return q;
    const item=s.items.find(i=>i.id===p.itemId);if(!item||!['regel','begrotingspost','bewakingspost'].includes(item.rowType))throw Error('Selecteer een begrotingspost of rekenregel.');
    if(s.items.some(i=>i.parentId===item.id)&&item.rowType==='regel')throw Error('Ongeldige rekenregel met kinderen.');
    const sorted=[...new Set(ids)].sort((a,b)=>a-b);
    const fragmentId=`${model.id}:${sorted.join(',')}:${q.key}`;
    const entry={fragmentId,label:`${model.fileName} · ${q.label} (${sorted.length} elementen)`,modelId:model.id,elementIds:sorted,quantityKey:q.key,[q.kind]:q.value};
    const saved=s.schedule.ifcTakeoff??{models:[model],entries:[]};
    s.pushHistory(s.items,'IFC-hoeveelheid overnemen');
    s.setSchedule({ifcTakeoff:{...saved,entries:[...saved.entries.filter(e=>e.fragmentId!==fragmentId),entry]}});
    useAppStore.setState({items:recalculateItems(s.items.map(i=>i.id===item.id?{...i,unit:q.unit as typeof i.unit,quantity:q.value,quantityLink:{source:'ifc',fragmentId,quantity:q.kind}}:i),s.schedule.tarieven)});
    s.updateDocument(s.activeDocumentId,{isModified:true});return {...q,itemId:item.id,fragmentId};
  }
  throw Error(`Onbekende IFC-actie: ${action}`);
}
