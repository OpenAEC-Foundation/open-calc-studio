import { IfcParser, extractQuantitiesOnDemand, extractProjectUnits } from '@ifc-lite/parser';
export type QuantityKind = 'volume' | 'area' | 'length' | 'count';
export interface TakeoffQuantity { key:string; label:string; kind:QuantityKind; value:number; unit:string }
export interface TakeoffElement { id:string; expressId:number; globalId:string; name:string; type:string; quantities:TakeoffQuantity[] }
export interface TakeoffModel { id:string; fileName:string; elements:TakeoffElement[] }
export interface TakeoffEntry { fragmentId:string; label:string; modelId:string; elementIds:number[]; quantityKey:string; volume?:number; area?:number; length?:number; count?:number }
export interface IfcTakeoff { models:TakeoffModel[]; entries:TakeoffEntry[] }
export async function parseTakeoff(buffer:ArrayBuffer, fileName:string):Promise<TakeoffModel> {
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
  return {id,fileName,elements};
}
export function aggregateTakeoff(model:TakeoffModel, ids:number[], key:string):TakeoffQuantity {
  const unique=[...new Set(ids)]; if(!unique.length)throw Error('Selecteer ten minste één IFC-element.');
  const elements=unique.map(id=>{const e=model.elements.find(e=>e.expressId===id);if(!e)throw Error(`Onbekend element #${id}.`);return e;});
  if(key==='__count__')return {key,label:'Aantal elementen',kind:'count',value:elements.length,unit:'st'};
  const values=elements.map(e=>{const q=e.quantities.find(q=>q.key===key);if(!q)throw Error(`${e.name} heeft deze hoeveelheid niet; er is niets overgenomen.`);return q;});
  if(values.some(q=>q.kind!==values[0].kind))throw Error('Hoeveelheden hebben verschillende dimensies.');
  return {...values[0],value:values.reduce((sum,q)=>sum+q.value,0)};
}
