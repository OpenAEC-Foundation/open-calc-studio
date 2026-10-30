import { useAppStore } from '@/state/appStore';
import { createPdfQuantityResolver, createPdfSource, emptyPdfWorkspace, importOpenPdfMeasurements, measurePoints, replaceOpenPdfMeasurements } from '@/services/pdf/pdfWorkspace';
import type { PdfPoint, SavedPdfMeasurement } from '@/types/pdfWorkspace';
import { recalculateItems } from '@/services/calculation/calculator';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { captureQuantityOrigin } from '@/services/quantity/quantityOrigin';

export async function pdfCommand(action:string,p:Record<string,unknown>) {
  const s=useAppStore.getState(); const docId=s.activeDocumentId;
  if(!docId)throw Error('Open eerst een begroting.');
  const w=structuredClone(s.schedule.pdfWorkspace??emptyPdfWorkspace());
  const commit=()=>{const current=useAppStore.getState();if(current.activeDocumentId!==docId||current.schedule.pdfWorkspace!==s.schedule.pdfWorkspace)throw Error('Begroting of PDF-workspace gewijzigd; probeer opnieuw.');current.setSchedule({pdfWorkspace:w});
    const pdf = createPdfQuantityResolver(w);
    const items=current.items.map(item=>{const link=item.quantityLink;if(link?.source!=='pdf')return item;
      const value=pdf.resolve(link);
      return value===null?item:{...item,quantity:value};});
    useAppStore.setState({items:recalculateItems(items,current.schedule.tarieven)});
    current.updateDocument(docId,{isModified:true});};
  if(action==='list')return w.sources.map(({dataBase64,...source})=>source);
  if(action==='add') {
    if(typeof p.dataBase64!=='string'||typeof p.fileName!=='string')throw Error('fileName en dataBase64 zijn verplicht.');
    if(p.dataBase64.length>42*1024*1024)throw Error('PDF groter dan 30 MB.');
    const source=await createPdfSource(new File([Uint8Array.from(atob(p.dataBase64),c=>c.charCodeAt(0))],p.fileName));
    if(!w.sources.some(v=>v.id===source.id))w.sources.push(source);w.activeSourceId=source.id;commit();return {sourceId:source.id};
  }
  const index=w.sources.findIndex(v=>v.id===p.sourceId);if(index<0)throw Error('Onbekende PDF-bron.');
  const source=w.sources[index];
  if(action==='select'){w.activeSourceId=source.id;commit();return {sourceId:source.id};}
  if(action==='removeSource'){w.sources.splice(index,1);if(w.activeSourceId===source.id)w.activeSourceId=w.sources[0]?.id??null;commit();return {removed:true};}
  if(action==='removeMeasurement') {if(!source.measurements.some(m=>m.id===p.measurementId))throw Error('Onbekende meting.');source.measurements=source.measurements.filter(m=>m.id!==p.measurementId);commit();return {removed:true};}
  if(action==='link') {
    const measurement=source.measurements.find(m=>m.id===p.measurementId);if(!measurement)throw Error('Onbekende meting.');
    const item=s.items.find(i=>i.id===p.itemId);if(!item||!['regel','begrotingspost','bewakingspost'].includes(item.rowType))throw Error('Selecteer een begrotingspost of rekenregel.');
    s.pushHistory(s.items,'PDF-hoeveelheid koppelen');
    const link = {source:'pdf' as const,measurementId:measurement.id,kind:measurement.type};
    useAppStore.setState({items:recalculateItems(s.items.map(i=>i.id===p.itemId?{...i,quantity:measurement.value,unit:measurement.type==='area'?'m²':'m',quantityLink:link,quantityOrigin:captureQuantityOrigin(link,s)}:i),s.schedule.tarieven)});
    s.updateDocument(docId,{isModified:true});return {quantity:measurement.value};
  }
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({data:Uint8Array.from(atob(source.dataBase64),c=>c.charCodeAt(0))});
  const doc=await task.promise;
  try {
    if(action==='importMeasurements') {w.sources[index]=replaceOpenPdfMeasurements(source,importOpenPdfMeasurements(p.export,source,doc.numPages));commit();return {count:w.sources[index].measurements.length};}
    const page=Number(p.page);if(!Number.isInteger(page)||page<1||page>doc.numPages)throw Error('Ongeldige PDF-pagina.');
    if(action==='calibrate') {
      const points=p.points as PdfPoint[];const distance=Number(p.distanceMeters);
      if(!Array.isArray(points)||points.length!==2||!Number.isFinite(distance)||distance<=0)throw Error('Gebruik twee punten en een positieve afstand in meters.');
      const pointDistance=measurePoints(points,'length',1000);if(pointDistance<=0)throw Error('Kalibratiepunten vallen samen.');
      const scale=distance*1000/pointDistance;source.pageScales[String(page)]=scale;
      source.measurements=source.measurements.map(m=>m.page===page&&m.origin==='open-calc-studio'?{...m,mmPerPoint:scale,value:measurePoints(m.points,m.type,scale)}:m);commit();return {mmPerPoint:scale};
    }
    if(action==='measure') {
      if(p.type!=='length'&&p.type!=='area')throw Error('type moet length of area zijn.');
      const points=p.points as PdfPoint[];if(!Array.isArray(points))throw Error('Meetpunten ontbreken.');
      const scale=source.pageScales[String(page)];const value=measurePoints(points,p.type,scale);
      const m:SavedPdfMeasurement={id:crypto.randomUUID(),label:String(p.label??'MCP-meting'),type:p.type,page,points,mmPerPoint:scale,value,origin:'open-calc-studio'};
      source.measurements.push(m);commit();return m;
    }
    throw Error(`Onbekende PDF-actie: ${action}`);
  }finally{await task.destroy();}
}
