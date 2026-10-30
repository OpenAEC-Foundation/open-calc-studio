import { it, expect } from 'vitest';
import { reviewBudget } from '@/services/review/budgetReview';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import type { CostItem } from '@/types/costModel';
import type { PdfSource, PdfWorkspace } from '@/types/pdfWorkspace';

it('resolves 6000 distinct PDF-linked rows with one scan per review and refreshes after source replacement',()=>{
 const template=createDefaultItems()[0];
 const items:CostItem[]=Array.from({length:6000},(_,i)=>({...template,rowType:'regel',id:`r${i}`,parentId:null,quantity:1,unit:'m²',normUnitPrice:1,excelLink:null,quantityLink:{source:'pdf',kind:'area',measurementId:`m${i}`}}));
 const measurements=items.map((_,i)=>({id:`m${i}`,label:`Area ${i}`,type:'area' as const,page:1,value:1,points:[],mmPerPoint:1000,origin:'open-calc-studio' as const}));
 let scans=0;
 const source:PdfSource={id:'p',fileName:'Synthetic.pdf',dataBase64:'',pageScales:{},get measurements(){scans++;return measurements;}};
 const workspace:PdfWorkspace={version:1,activeSourceId:'p',sources:[source]};
 const context={items,schedule:{...createDefaultSchedule(),pdfWorkspace:workspace},subSheets:[]};
 expect(reviewBudget(context).counts.all).toBe(0);expect(scans).toBe(1);
 expect(reviewBudget({...context,items:items.map(item=>({...item,normUnitPrice:2}))}).counts.all).toBe(0);expect(scans).toBe(2);
 measurements[0].value=5;expect(reviewBudget(context).issues.find(issue=>issue.itemId==='r0')?.source?.value).toBe(5);
 const updated={...workspace,sources:[{...source,measurements:[{...measurements[0],value:2},...measurements.slice(1)]}]};
 expect(reviewBudget({...context,schedule:{...context.schedule,pdfWorkspace:updated}}).issues.filter(issue=>issue.code==='different-quantity')).toHaveLength(1);
 expect(reviewBudget({...context,schedule:{...context.schedule,pdfWorkspace:{...workspace,sources:[]}}}).counts.source).toBe(6000);
});
