import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import Backstage from '@/components/backstage/Backstage';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
const mock=vi.hoisted(()=>({newFile:vi.fn(),save:vi.fn(async()=>{}),saveAs:vi.fn(async()=>{}),open:vi.fn(async()=>{}),recent:vi.fn(async()=>{}),print:vi.fn(async()=>{}),nativeClose:vi.fn(async()=>{})}));
vi.mock('@/hooks/useFileOperations',()=>({useFileOperations:()=>({newFile:mock.newFile,saveFile:mock.save,saveFileAs:mock.saveAs,openFile:mock.open,openRecentFile:mock.recent})}));
vi.mock('@/services/report/reportOutput',()=>({outputCurrentReport:mock.print}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({close:mock.nativeClose})}));
const initial=useAppStore.getState();let node:HTMLDivElement,root:Root,close:ReturnType<typeof vi.fn<() => void>>,settings:ReturnType<typeof vi.fn<() => void>>,picker:ReturnType<typeof vi.spyOn>,downloads:{name:string;href:string}[];
const tr=(key:string)=>i18next.t(key,{ns:'backstage'});
function menu(key:string){const label=tr(key);const result=[...node.querySelectorAll<HTMLButtonElement>('.backstage-item')].find(button=>button.querySelector('.backstage-item-label')?.textContent===label);expect(result,label).toBeTruthy();return result!;}
async function click(element:HTMLElement){await act(async()=>element.click());}
async function mount(){await act(async()=>root.render(<Backstage open onClose={close} onOpenSettings={settings}/>));}
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:'backstage-audit',items:[]});const post=s.addItem(s.addChapter(null));s.updateItem(post,'description','Synthetic concrete');s.updateItem(post,'quantity',2);s.updateItem(post,'normUnitPrice',10);s.updateDocument('backstage-audit',{isModified:false});node=document.createElement('div');document.body.append(node);root=createRoot(node);close=vi.fn();settings=vi.fn();vi.clearAllMocks();downloads=[];
 picker=vi.spyOn(HTMLInputElement.prototype,'click').mockImplementation(()=>{});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){downloads.push({name:this.download,href:this.href});});
 if(!URL.createObjectURL)URL.createObjectURL=()=>'';if(!URL.revokeObjectURL)URL.revokeObjectURL=()=>{};vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic-download');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(window,'alert').mockImplementation(()=>{});
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete(window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.restoreAllMocks();});
it.each([['new','newFile'],['save','save'],['saveAs','saveAs']])('file menu %s calls the proper operation and closes',async(key,op)=>{await mount();await click(menu(key));expect(mock[op as 'save']).toHaveBeenCalledOnce();expect(close).toHaveBeenCalled();});
it('Open browse and recent-file buttons reach their own file operations',async()=>{useAppStore.getState().updateSettings({recentFiles:['/audit/recent.ifcCalc']});await mount();await click(menu('open'));const buttons=node.querySelectorAll<HTMLButtonElement>('.bs-panel-option');await click(buttons[0]);expect(mock.open).toHaveBeenCalledOnce();await click(node.querySelector<HTMLButtonElement>('.bs-recent-item')!);expect(mock.recent).toHaveBeenCalledWith('/audit/recent.ifcCalc');});
it('Print uses the shared current-report path and Preferences opens settings',async()=>{await mount();await click(menu('printMenu'));expect(mock.print).toHaveBeenCalledWith('print');await click(menu('preferences'));expect(settings).toHaveBeenCalledOnce();});
it('About displays this build and the back button closes the menu',async()=>{await mount();await click(menu('about'));expect(node.querySelector('.bs-about-version')).toHaveTextContent(__APP_VERSION__);await click(node.querySelector('.backstage-back')!);expect(close).toHaveBeenCalledOnce();});
it.each(['.ifc','.cuf','.csv','.s01','.sufx','.xml','.rsx','.rsu','.bc3','.onlv','.x83','.xpwe','.x84','.zsx','.xml','.nsx'].map((extension,index)=>[extension,index] as const))('import button %# selects the expected %s file family without editing a project',async(extension,index)=>{
 const before=JSON.stringify(useAppStore.getState().items);await mount();await click(menu('import'));const buttons=node.querySelectorAll<HTMLButtonElement>('.bs-panel-options button');expect(buttons).toHaveLength(16);await click(buttons[index]);await vi.waitFor(()=>expect(picker).toHaveBeenCalledOnce());const element=picker.mock.contexts[0] as HTMLInputElement;expect(element.type).toBe('file');expect(element.accept).toContain(extension);expect(JSON.stringify(useAppStore.getState().items)).toBe(before);
});
it.each(['.ifc','.xlsx','.cuf','.bc3','.onlv','.xml','.rsx'].map((extension,index)=>[extension,index] as const))('export button %# produces an actual %s download',async(extension,index)=>{
 const before=JSON.stringify(useAppStore.getState().items);await mount();await click(menu('export'));const buttons=node.querySelectorAll<HTMLButtonElement>('.bs-panel-options button');await click(buttons[index]);await vi.waitFor(()=>expect(downloads.length).toBeGreaterThan(0));expect(downloads[0].name.toLowerCase()).toMatch(new RegExp(extension.replace('.','\\.')+'$'));expect(downloads[0].href).toContain('blob:');expect(JSON.stringify(useAppStore.getState().items)).toBe(before);
});
it('Exit is explicitly unavailable in the browser and closes the native window when enabled',async()=>{await mount();expect(menu('exit')).toBeDisabled();Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});await act(async()=>root.render(<Backstage open onClose={close} onOpenSettings={settings}/>));await click(menu('exit'));await vi.waitFor(()=>expect(mock.nativeClose).toHaveBeenCalledOnce());});
