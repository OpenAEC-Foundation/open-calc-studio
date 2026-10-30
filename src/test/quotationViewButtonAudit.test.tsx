import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { OfferteView } from '@/components/offerte/OfferteView';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
const initial=useAppStore.getState();let root:Root,node:HTMLDivElement,section:string;
const state=()=>useAppStore.getState();
function byText(key:string){const label=i18next.t(key);const button=[...node.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.textContent?.trim()==='+ '+label);expect(button,label).toBeTruthy();return button!;}
async function click(element:HTMLElement){expect(element).toBeTruthy();await act(async()=>element.click());}
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);state().addDocument({id:'quotation-view-audit',items:[]});section=state().addSection('technisch','Synthetic specification');state().setActiveSectionId(section);state().updateDocument('quotation-view-audit',{isModified:false});node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root.render(<OfferteView/>));});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.restoreAllMocks();});
it('quotation Add item, properties, layers and item delete update the intended section',async()=>{
 await click(byText('offerte.addItem'));let item=state().offerte.secties[0].items[0];expect(item).toBeTruthy();await click(node.querySelector('.offerte-expand-btn')!);await click(byText('offerte.addProperty'));expect(state().offerte.secties[0].items[0].properties).toHaveLength(1);await click(byText('offerte.addLayer'));expect(state().offerte.secties[0].items[0].layers).toHaveLength(1);await click(node.querySelector('.offerte-layers-table .item-del')!);expect(state().offerte.secties[0].items[0].layers).toHaveLength(0);await click(node.querySelector('.offerte-props-table .item-del')!);expect(state().offerte.secties[0].items[0].properties).toHaveLength(0);await click(node.querySelector('.offerte-items-table>tbody>tr .item-del')!);expect(state().offerte.secties[0].items).toHaveLength(0);expect(state().documents[0].isModified).toBe(true);
});
it('section move up/down and delete act on the clicked section',async()=>{
 let other='';await act(async()=>{other=state().addSection('vrij','Other section');});let row=[...node.querySelectorAll<HTMLElement>('.offerte-nav-item')].find(r=>r.textContent?.includes('Other section'))!;await click(row.querySelector('.nav-btn')!);expect(state().offerte.secties[0].id).toBe(other);row=[...node.querySelectorAll<HTMLElement>('.offerte-nav-item')].find(r=>r.textContent?.includes('Other section'))!;await click(row.querySelectorAll<HTMLButtonElement>('.nav-btn')[1]);expect(state().offerte.secties[1].id).toBe(other);await click(row.querySelector('.nav-btn.del')!);expect(state().offerte.secties.some(s=>s.id===other)).toBe(false);
});
it.each([['__termijnen','offerte.addPaymentTerm','betalingstermijnen'],['__garanties','offerte.addWarranty','garanties']])('%s add/delete updates its actual records',async(id,label,field)=>{
 await act(async()=>state().setActiveSectionId(id));const read=()=>state().offerte[field as 'garanties'];const before=read().length;await click(byText(label));expect(read()).toHaveLength(before+1);const deletes=node.querySelectorAll<HTMLButtonElement>('.item-del');await click(deletes[deletes.length-1]);expect(read()).toHaveLength(before);
});
