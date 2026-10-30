import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { FileTabBar } from '@/components/layout/FileTabBar';
import { useAppStore } from '@/state/appStore';
import { deserializeProject } from '@/services/file/fileService';
import i18next from '@/i18n/config';
const mocks=vi.hoisted(()=>({choice:'save',save:vi.fn(),newFile:vi.fn(),write:vi.fn(async(..._args:unknown[])=>{}),window:vi.fn()}));
vi.mock('@/hooks/useFileOperations',()=>({useFileOperations:()=>({saveFile:mocks.save,newFile:mocks.newFile,openRecentFile:vi.fn()})}));
vi.mock('@/components/common/UnsavedChangesDialog',()=>({showUnsavedChangesDialog:vi.fn(async()=>mocks.choice)}));
vi.mock('@/services/windowBridge',()=>({onWindowBridgeMessage:()=>()=>{},sendCloseDetached:vi.fn()}));
vi.mock('@tauri-apps/api/path',()=>({appDataDir:async()=>'/audit/'}));
vi.mock('@tauri-apps/plugin-fs',()=>({mkdir:async()=>{},writeTextFile:mocks.write}));
vi.mock('@tauri-apps/api/webviewWindow',()=>({WebviewWindow:class{constructor(...args:unknown[]){mocks.window(...args);}}}));
const initial=useAppStore.getState();let root:Root,node:HTMLDivElement;
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:'A',fileName:'Project A',items:[]});s.addChapter(null);s.setSchedule({projectName:'Project A'});s.setCompanyInfo({...s.companyInfo,name:'Company A'});s.addDocument({id:'B',fileName:'Project B',items:[]});s.addChapter(null);s.setSchedule({projectName:'Project B'});s.setCompanyInfo({...s.companyInfo,name:'Company B'});node=document.createElement('div');document.body.append(node);root=createRoot(node);vi.clearAllMocks();mocks.choice='save';mocks.save.mockImplementation(async()=>{const state=useAppStore.getState();state.updateDocument(state.activeDocumentId,{isModified:false});});delete(window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete(window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.restoreAllMocks();});
async function mount(){await act(async()=>root.render(<FileTabBar/>));}
function tab(id:string){return [...node.querySelectorAll<HTMLButtonElement>('.file-tab')].find(b=>b.textContent?.includes('Project '+id))!;}
async function context(id:string){await act(async()=>tab(id).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:5,clientY:5})));}
function menu(key:string){return [...node.querySelectorAll<HTMLButtonElement>('.grid-context-menu button')].find(b=>b.textContent?.trim()===i18next.t(key))!;}
it('Save on closing an inactive modified tab saves that exact tab and retains the current document',async()=>{
 const seen:string[]=[];mocks.save.mockImplementation(async()=>{const s=useAppStore.getState();seen.push(s.activeDocumentId);s.updateDocument(s.activeDocumentId,{isModified:false});});await mount();await act(async()=>tab('A').querySelector<HTMLElement>('.file-tab-close')!.click());expect(seen).toEqual(['A']);expect(useAppStore.getState().documents.map(doc=>doc.id)).toEqual(['B']);expect(useAppStore.getState().activeDocumentId).toBe('B');
});
it.each(['cancel','discard'])('%s on the close prompt preserves or removes the intended tab',async(choice)=>{mocks.choice=choice;await mount();await act(async()=>tab('A').querySelector<HTMLElement>('.file-tab-close')!.click());expect(useAppStore.getState().documents.some(doc=>doc.id==='A')).toBe(choice==='cancel');expect(mocks.save).not.toHaveBeenCalled();expect(useAppStore.getState().activeDocumentId).toBe('B');});
it('cancelled Save As does not close a modified document',async()=>{mocks.save.mockImplementation(async()=>{});await mount();await act(async()=>tab('A').querySelector<HTMLElement>('.file-tab-close')!.click());expect(useAppStore.getState().documents.some(doc=>doc.id==='A')).toBe(true);});
it('Open in new window serializes the requested inactive tab with its own project and company',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});await mount();await context('A');await act(async()=>menu('openInNewWindow').click());await vi.waitFor(()=>expect(mocks.window).toHaveBeenCalledOnce());const project=deserializeProject(String(mocks.write.mock.calls[0][1]));expect(project.schedule.projectName).toBe('Project A');expect(project.companyInfo?.name).toBe('Company A');expect((JSON.parse(String(mocks.write.mock.calls[0][1])) as {items:{id:string}[]}).items.map(i=>i.id)).toEqual(useAppStore.getState().documents.find(d=>d.id==='A')!.items.map(i=>i.id));expect(useAppStore.getState().activeDocumentId).toBe('B');
});
it('View beside targets the context tab without switching the active document',async()=>{await mount();await context('A');await act(async()=>menu('viewBeside').click());expect(useAppStore.getState().splitDocumentId).toBe('A');expect(useAppStore.getState().activeDocumentId).toBe('B');});
it('document tabs switch content and the add-tab button calls New',async()=>{await mount();await act(async()=>tab('A').click());expect(useAppStore.getState().activeDocumentId).toBe('A');await act(async()=>node.querySelector<HTMLButtonElement>('.file-tab-add')!.click());expect(mocks.newFile).toHaveBeenCalledOnce();});
