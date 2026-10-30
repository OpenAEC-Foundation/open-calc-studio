import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import UnsavedChangesDialog from '@/components/common/UnsavedChangesDialog';
import ProgressModal from '@/components/common/ProgressModal';
import CostItemPicker from '@/components/common/CostItemPicker';
import { HostFileDialog,pickHostFile } from '@/components/common/HostFileDialog';
import ColumnMappingDialog from '@/components/backstage/ColumnMappingDialog';
import WizardModal from '@/components/wizard/WizardModal';
import { ColumnHeaderMenu } from '@/components/grid/ColumnHeaderMenu';
import { getColumnsForView } from '@/components/grid/gridConstants';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { QuantityPicker } from '@/components/common/QuantityPicker';
import i18next from '@/i18n/config';
const initial=useAppStore.getState();let root:Root,node:HTMLDivElement,post:string;
const tr=(key:string,ns='common')=>i18next.t(key,{ns});
const click=async(element:HTMLElement)=>{expect(element).toBeTruthy();await act(async()=>element.click());};
const byText=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()===text)!;
async function mount(component:React.ReactNode){await act(async()=>root.render(component));}

beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:'dialog-audit',items:[]});post=s.addItem(s.addChapter(null));s.updateItem(post,'description','Concrete');s.updateDocument('dialog-audit',{isModified:false});useAppStore.setState({undoStack:[],redoStack:[]});node=document.createElement('div');document.body.append(node);root=createRoot(node);if(!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView=()=>{};vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete window.openaecHost;vi.restoreAllMocks();});
it.each([['save','save'],['dontSave','discard'],['cancel','cancel']])('unsaved dialog %s returns %s',async(key,value)=>{const result=vi.fn();await mount(<UnsavedChangesDialog open fileName="Synthetic" onResult={result}/>);await click(byText(tr(key)));expect(result).toHaveBeenCalledWith(value);});
it('unsaved dialog close means Cancel',async()=>{const result=vi.fn();await mount(<UnsavedChangesDialog open fileName="Synthetic" onResult={result}/>);await click(document.querySelector('.modal-close-btn')!);expect(result).toHaveBeenCalledWith('cancel');});
it('progress cancellation reaches the running operation',async()=>{const cancel=vi.fn();await mount(<ProgressModal open onCancel={cancel}/>);await click(byText(tr('cancel')));expect(cancel).toHaveBeenCalledOnce();});
it('cost picker selection, link, unlink and both cancel buttons return exact callbacks',async()=>{
 const select=vi.fn(),unlink=vi.fn(),cancel=vi.fn();const props={open:true,offerteOnderdeel:'Concrete',offerteOmschrijving:'',linkedChapterId:null,currentLinkedId:post,onSelect:select,onUnlink:unlink,onCancel:cancel};await mount(<CostItemPicker {...props}/>);
 await click(document.querySelector('.cost-picker-list button')!);await click(byText(tr('costItemPicker.link','dialogs')));expect(select).toHaveBeenCalled();await click(byText(tr('costItemPicker.unlink','dialogs')));expect(unlink).toHaveBeenCalledOnce();await click(byText(tr('costItemPicker.cancel','dialogs')));await click(document.querySelector('.modal-close')!);expect(cancel).toHaveBeenCalledTimes(2);
});
it.each(['latest','history','cancel'])('host file picker %s resolves the intended file or cancellation',async(mode)=>{
 window.openaecHost={list:async()=>[{id:'file-a',name:'Hosted synthetic estimate',modified:'2026-10-29'}],versions:async()=>[{version:7,modified:'2026-10-28',author:'Synthetic'}],open:async()=>{throw Error('unused');},save:async()=>{throw Error('unused');}};
 await mount(<HostFileDialog/>);let pending!:ReturnType<typeof pickHostFile>;await act(async()=>{pending=pickHostFile();});
 if(mode==='cancel'){await click(document.querySelector('.modal-close-btn')!);expect(await pending).toBeNull();return;}
 await click(document.querySelector('.host-file-list button')!);if(mode==='latest'){await click(byText(tr('host.openLatest')));expect(await pending).toEqual({id:'file-a'});}else{await click([...document.querySelectorAll<HTMLButtonElement>('.host-file-list button')].find(b=>b.textContent?.includes('7'))!);expect(await pending).toEqual({id:'file-a',version:7});}
});
it('column mapping imports the selected mapping, cancels, and rejects an unmapped description',async()=>{
 const confirm=vi.fn(),close=vi.fn();await mount(<ColumnMappingDialog open data={{headers:['Description','Quantity','Price'],rows:[['Concrete','2','10']],sourceName:'Synthetic.csv'}} onConfirm={confirm} onClose={close}/>);
 const buttons=document.querySelectorAll<HTMLButtonElement>('.cmd-actions button');expect(buttons[1]).not.toBeDisabled();await click(buttons[1]);expect(confirm).toHaveBeenCalledOnce();await click(buttons[0]);expect(close).toHaveBeenCalledOnce();
 const selects=document.querySelectorAll('select');await act(async()=>{for(const select of selects){select.value='ignore';select.dispatchEvent(new Event('change',{bubbles:true}));}});expect(document.querySelector('.cmd-btn-primary')).toBeDisabled();
});
it('wizard select, calculate, back and insert create actual cost rows and protect unsaved changes',async()=>{
 const close=vi.fn();await mount(<WizardModal open onClose={close}/>);await click(document.querySelector('.wizard-card')!);await click(byText(tr('wizard.calculate')));expect(document.querySelector('.wizard-preview')).toBeTruthy();await click(byText(tr('wizard.back')));await click(byText(tr('wizard.calculate')));const before=useAppStore.getState().items.length;await click(byText(tr('wizard.insertIntoBudget')));expect(useAppStore.getState().items.length).toBeGreaterThan(before);expect(useAppStore.getState().documents[0].isModified).toBe(true);expect(useAppStore.getState().undoStack).toHaveLength(1);expect(close).toHaveBeenCalledOnce();
});
it('hide columns and Show all change the actual grid settings',async()=>{
 const columns=getColumnsForView('wpcalc'),column=columns.find(column=>column.key==='quantity')!;const close=vi.fn();await mount(<ColumnHeaderMenu x={0} y={0} columns={columns} column={column} gridView="wpcalc" onClose={close}/>);await click(document.querySelector('.grid-context-menu button')!);expect(useAppStore.getState().hiddenColumns['wpcalc:quantity']).toBe(true);const buttons=document.querySelectorAll<HTMLButtonElement>('.grid-context-menu>button');await click(buttons[buttons.length-1]);expect(useAppStore.getState().hiddenColumns['wpcalc:quantity']).not.toBe(true);
});
it('resource insertion uses the selected source and forms one undo entry',async()=>{
 const s=useAppStore.getState();s.setResourceLibrary([{id:'resource',code:'R1',description:'Synthetic concrete',unit:'m³',defaultUnitPrice:100,resourceType:'materiaal',category:'Synthetic',source:'Synthetic fixture'}]);s.openResourcePicker(post);await mount(<ResourcePicker/>);await click(document.querySelector('.resource-picker-footer button')!);expect(useAppStore.getState().items.some(item=>item.resourceLibraryId==='resource'&&item.normUnitPrice===100)).toBe(true);expect(useAppStore.getState().undoStack).toHaveLength(1);
});
it('PDF length/area sums and IFC quantity buttons return exact values',async()=>{
 useAppStore.setState({pdfMeasurements:[{id:'l',label:'Length',type:'length',page:1,value:3},{id:'a',label:'Area',type:'area',page:1,value:8}],ifcQuantities:[{fragmentId:'f',label:'Wall',volume:2,area:8,length:3,count:1}]});const pick=vi.fn();await mount(<QuantityPicker onPick={pick} onClose={vi.fn()}/>);await click(byText('📄 '+tr('quantityPicker.tabPdf','dialogs')));await click(byText(tr('quantityPicker.sumLengths','dialogs')));expect(pick).toHaveBeenLastCalledWith(expect.objectContaining({kind:'sum-length'}),3);await click(byText(tr('quantityPicker.sumAreas','dialogs')));expect(pick).toHaveBeenLastCalledWith(expect.objectContaining({kind:'sum-area'}),8);await click(byText('🏗️ '+tr('quantityPicker.tabIfc','dialogs')));await click([...node.querySelectorAll('button')].find(b=>b.textContent?.startsWith('volume:'))!);expect(pick).toHaveBeenLastCalledWith({source:'ifc',fragmentId:'f',quantity:'volume'},2);
});
