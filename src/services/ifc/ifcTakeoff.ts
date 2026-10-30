import { uiText } from '@/i18n/uiText';
import { IfcParser, extractQuantitiesOnDemand, extractProjectUnits } from '@ifc-lite/parser';
export type QuantityKind = 'volume' | 'area' | 'length' | 'count';
export interface TakeoffQuantity { key:string; label:string; kind:QuantityKind; value:number; unit:string }
export interface TakeoffElement { id:string; expressId:number; globalId:string; name:string; type:string; quantities:TakeoffQuantity[] }
export interface TakeoffModel { id:string; fileName:string; elements:TakeoffElement[]; revision?: { label: string; previousModelId?: string; importedAt: string } }
export interface TakeoffEntry { fragmentId:string; label:string; modelId:string; elementIds:number[]; quantityKey:string; volume?:number; area?:number; length?:number; count?:number }
export interface IfcTakeoff { models:TakeoffModel[]; entries:TakeoffEntry[] }
export async function parseTakeoff(buffer:ArrayBuffer, fileName:string):Promise<TakeoffModel> {
  if (buffer.byteLength > 100 * 1024 * 1024) throw Error('IFC exceeds 100 MiB.');
  const hash=await crypto.subtle.digest('SHA-256',buffer);
  const id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const store=await new IfcParser().parseColumnar(buffer);
  const units=extractProjectUnits(new Uint8Array(buffer),store.entityIndex);
  const kinds:Record<number,[QuantityKind,string,string]>={0:['length','IfcLengthMeasure','m'],1:['area','IfcAreaMeasure','m²'],2:['volume','IfcVolumeMeasure','m³'],3:['count','IfcCountMeasure','st'],6:['count','IfcCountMeasure','st']};
  const elements:TakeoffElement[]=[];
  for(const expressId of store.entities.expressId) {
    const quantities:TakeoffQuantity[]=[];
    for(const set of extractQuantitiesOnDemand(store,expressId))for(const q of set.quantities) {
      const kind=kinds[q.type]; if(!kind)continue;
      const scale=q.explicitUnitSiScale ?? (kind[0]==='count'?1:units.unitForMeasure(kind[1])?.siScale);
      if(scale==null||!Number.isFinite(q.value)||!Number.isFinite(scale))continue;
      quantities.push({key:`${set.name}/${q.name}`,label:`${set.name} · ${q.name}`,kind:kind[0],value:q.value*scale,unit:kind[2]});
    }
    if(!store.entities.hasGeometry(expressId)&&!quantities.length)continue;
    elements.push({id:`${id}:${expressId}`,expressId,globalId:store.entities.getGlobalId(expressId),name:store.entities.getName(expressId)||`#${expressId}`,type:store.entities.getTypeName(expressId),quantities});
  }
  return {id,fileName,elements,revision:{label:fileName,importedAt:new Date().toISOString()}};
}
export function aggregateTakeoff(model:TakeoffModel, ids:number[], key:string):TakeoffQuantity {
  const unique=[...new Set(ids)]; if(!unique.length)throw Error(uiText("ifc.error.empty", "Select at least one IFC element."));
  const elementIndex = new Map(model.elements.map(element => [element.expressId, element]));
  const elements=unique.map(id=>{const e=elementIndex.get(id);if(!e)throw Error(uiText('ifc.error.unknown', 'Unknown element #{{id}}.', { id }));return e;});
  if(key==='__count__')return {key,label:uiText("ifc.count", "Element count"),kind:'count',value:elements.length,unit:'st'};
  const values=elements.map(e=>{const q=e.quantities.find(q=>q.key===key);if(!q)throw Error(uiText('ifc.error.missingQuantity', '{{name}} does not have this quantity; nothing was applied.', { name: e.name }));return q;});
  if(values.some(q=>q.kind!==values[0].kind))throw Error(uiText("ifc.error.dimensions", "Quantities have different dimensions."));
  return {...values[0],value:values.reduce((sum,q)=>sum+q.value,0)};
}
