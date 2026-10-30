import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import RapportageTab from '@/components/ribbon/RapportageTab';
import OfferteTab from '@/components/ribbon/OfferteTab';
import { outputCurrentReport } from '@/services/report/reportOutput';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
const mocks=vi.hoisted(()=>({invoke:vi.fn(async()=>undefined),save:vi.fn(async():Promise<string|null>=>'/audit/export.pdf'),openPath:vi.fn(async()=>{}),print:vi.fn(async()=>{}),excel:vi.fn(async()=>{})}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-dialog',()=>({save:mocks.save}));
vi.mock('@tauri-apps/plugin-opener',()=>({openPath:mocks.openPath}));
vi.mock('@tauri-apps/api/path',()=>({tempDir:async()=>'/audit/tmp',join:async(...parts:string[])=>parts.join('/')}));
vi.mock('@/services/print/printService',async original=>({...await original<typeof import('@/services/print/printService')>(),printBudget:mocks.print}));
vi.mock('@/services/export/inschrijfstaatExporter',()=>({exportInschrijfstaat:mocks.excel}));
const initial=useAppStore.getState();let root:Root,node:HTMLDivElement;
const tr=(key:string)=>i18next.t(key,{ns:'ribbon'});
function button(key:string){const label=tr(key);const found=[...document.querySelectorAll('button')].find(b=>(b.querySelector('.ribbon-btn-label')?.textContent ?? b.textContent)?.trim()===label);expect(found,`Button ${label}`).toBeTruthy();return found!;}
async function click(key:string){await act(async()=>button(key).click());}
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:'report-buttons',items:[]});s.addItem(s.addChapter(null));s.updateDocument('report-buttons',{isModified:false});node=document.createElement('div');document.body.append(node);root=createRoot(node);vi.clearAllMocks();mocks.save.mockResolvedValue('/audit/export.pdf');vi.spyOn(window,'alert').mockImplementation(()=>{});delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.restoreAllMocks();});
function native(){Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});}
it.each(['werkbeschrijving','hoofdaanneming','onderaanneming','inschrijfstaat','nacalculatie','bouw1','ibis','directie'])('report selector opens the intended %s report',async(view)=>{
 await act(async()=>root.render(<RapportageTab/>));const index=['werkbeschrijving','hoofdaanneming','onderaanneming','inschrijfstaat','nacalculatie','bouw1','ibis','directie'].indexOf(view);await act(async()=>node.querySelectorAll<HTMLButtonElement>('.ribbon-groups .ribbon-group:first-child button')[index].click());expect(useAppStore.getState()).toMatchObject({reportView:view,activeContentTab:'rapport'});
});
it.each(['print','pdfExport'])('web %s opens browser printing instead of calling unavailable native APIs',async(key)=>{await act(async()=>root.render(<RapportageTab/>));await click('rapportage.'+key);expect(mocks.print).toHaveBeenCalledOnce();expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();});
it.each(['ibis','directie','bouw1'])('native print uses the proper %s generator, portable temp path and selected options',async(view)=>{
 native();useAppStore.setState({reportView:view as 'ibis',pageSize:'A3',pageOrientation:'portrait',includeCover:true,includeSummary:true});await act(async()=>root.render(<RapportageTab/>));await click('rapportage.print');
 const call=mocks.invoke.mock.calls[0] as unknown as [string,{request:Record<string,unknown>;outputPath:string}];expect(call[0]).toBe(view==='bouw1'?'generate_pdf_report':'generate_ibis_report');expect(call[1].outputPath).toMatch(/^\/audit\/tmp\/ocs-/);expect(call[1].request).toMatchObject({reportView:view,pageSize:'A3',pageOrientation:'portrait',includeCover:true,includeSummary:true});expect(mocks.openPath).toHaveBeenCalledWith(call[1].outputPath);
});
it('PDF export cancellation does not generate or open a file',async()=>{native();mocks.save.mockResolvedValue(null);await act(async()=>root.render(<RapportageTab/>));await click('rapportage.pdfExport');expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.openPath).not.toHaveBeenCalled();});
it('refuses exporting a different document if the active tab changes during file selection',async()=>{native();mocks.save.mockImplementationOnce(async()=>{useAppStore.getState().addDocument({id:'different',items:[]});return '/audit/export.pdf';});await expect(outputCurrentReport('export')).rejects.toThrow('active document changed');expect(mocks.invoke).not.toHaveBeenCalled();});
it('export errors are visible to the user',async()=>{native();mocks.invoke.mockRejectedValueOnce(Error('Synthetic export failure'));await act(async()=>root.render(<RapportageTab/>));await click('rapportage.pdfExport');expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Synthetic export failure'));expect(mocks.openPath).not.toHaveBeenCalled();});
it('page sizes, orientations, properties and logos have observable outcomes',async()=>{
 await act(async()=>root.render(<RapportageTab/>));for(const [key,field,value]of [['A3','pageSize','A3'],['A4','pageSize','A4'],['rapportage.portrait','pageOrientation','portrait'],['rapportage.landscape','pageOrientation','landscape']]){await click(key);expect(useAppStore.getState()[field as 'pageSize']).toBe(value);}
 await click('rapportage.properties');expect(document.querySelector('[role=dialog]')).toBeTruthy();const checkbox=document.querySelector<HTMLInputElement>('[role=dialog] input')!;await act(async()=>checkbox.click());expect(useAppStore.getState().showHoeveelheid).toBe(false);
 await act(async()=>document.querySelector<HTMLButtonElement>('[role=dialog] .modal-close-btn')!.click());await click('rapportage.logos');
 const visibleDialogs=document.querySelectorAll('[role=dialog]:not([aria-hidden="true"])');
 expect(visibleDialogs).toHaveLength(1);expect(visibleDialogs[0].querySelector('h2')?.textContent).toBe(tr('rapportage.logosModalTitle'));
 expect(document.querySelector('.rapport-props-dialog:not([aria-hidden="true"])')).toBeNull();
});
it('Excel export button reaches the exporter',async()=>{await act(async()=>root.render(<RapportageTab/>));await click('rapportage.excelExport');expect(mocks.excel).toHaveBeenCalledOnce();});
it.each(['particulier','raw','eenvoudig'])('quotation type %s changes the document and its modified flag',async(type)=>{await act(async()=>root.render(<OfferteTab/>));await click('offerte.'+type);expect(useAppStore.getState().offerte.type).toBe(type);expect(useAppStore.getState().documents[0].isModified).toBe(true);});
it.each(['technisch','opties','vrij','meerwerk'])('quotation section %s can be added and removed',async(type)=>{await act(async()=>root.render(<OfferteTab/>));const count=useAppStore.getState().offerte.secties.length;await click('offerte.'+type);expect(useAppStore.getState().offerte.secties).toHaveLength(count+1);expect(useAppStore.getState().offerte.secties.find(section=>section.id===useAppStore.getState().activeSectionId)?.type).toBe(type);await click('offerte.remove');expect(useAppStore.getState().offerte.secties).toHaveLength(count);});
it.each([['gegevens','__meta'],['termijnen','__termijnen'],['garanties','__garanties']])('quotation %s opens the intended editor',async(key,id)=>{await act(async()=>root.render(<OfferteTab/>));await click('offerte.'+key);expect(useAppStore.getState().activeSectionId).toBe(id);expect(button('offerte.remove')).toBeDisabled();});
it.each(['send','concept'])('quotation %s creates an actual snapshot',async(key)=>{await act(async()=>root.render(<OfferteTab/>));await click('offerte.'+key);expect(useAppStore.getState().snapshots).toHaveLength(1);});
it('quotation PDF controls explain the desktop requirement in the web app',async()=>{await act(async()=>root.render(<OfferteTab/>));expect(button('offerte.printBtn')).toBeDisabled();expect(button('offerte.pdfQuotation')).toBeDisabled();expect(button('offerte.printBtn').title).toContain('desktop');});
it.each(['printBtn','pdfQuotation'])('native quotation %s creates and opens the quotation PDF',async(key)=>{native();await act(async()=>root.render(<OfferteTab/>));expect(button('offerte.'+key)).not.toBeDisabled();await click('offerte.'+key);expect(mocks.invoke).toHaveBeenCalledWith('generate_offerte_pdf',expect.objectContaining({request:expect.objectContaining({offerte:expect.anything()})}));await vi.waitFor(()=>expect(mocks.openPath).toHaveBeenCalledOnce());});
