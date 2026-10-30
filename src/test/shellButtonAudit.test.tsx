import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import TitleBar from '@/components/layout/TitleBar';
import { WorkspaceLayoutBar } from '@/components/layout/WorkspaceLayoutBar';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
const m=vi.hoisted(()=>({save:vi.fn(async()=>{}),minimize:vi.fn(async()=>{}),maximize:vi.fn(async()=>{}),close:vi.fn(async()=>{}),second:vi.fn(async()=>{})}));
vi.mock('@/hooks/useFileOperations',()=>({useFileOperations:()=>({saveFile:m.save})}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({minimize:m.minimize,toggleMaximize:m.maximize,close:m.close,isMaximized:async()=>false,onResized:async()=>()=>{},setTitle:async()=>{}})}));
vi.mock('@tauri-apps/plugin-os',()=>({platform:()=> 'linux'}));
vi.mock('@tauri-apps/api/core',()=>({invoke:async()=>{}}));
vi.mock('@/services/workspaces/companion',()=>({openCompanionWindow:m.second}));
const initial=useAppStore.getState();let node:HTMLDivElement,root:Root;
const tr=(key:string)=>i18next.t(key);
const wt=(key:string)=>i18next.t('workspace.'+key);
async function click(element:HTMLElement){expect(element).toBeTruthy();await act(async()=>element.click());}
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:'shell-audit',items:[]});s.addItem(s.addChapter(null));node=document.createElement('div');document.body.append(node);root=createRoot(node);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete(window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.restoreAllMocks();});
it('titlebar Save, Preferences and Feedback reach their actual parent actions',async()=>{const settings=vi.fn(),feedback=vi.fn();await act(async()=>root.render(<TitleBar onSettingsClick={settings} onFeedbackClick={feedback}/>));await click(node.querySelector(`[aria-label="${tr('save')}"]`)!);expect(m.save).toHaveBeenCalledOnce();await click(node.querySelector(`[aria-label="${tr('preferences')}"]`)!);expect(settings).toHaveBeenCalledOnce();await click(node.querySelector('.send-feedback-btn')!);expect(feedback).toHaveBeenCalledOnce();});
it('native minimize, maximize and close reach the current window adapter',async()=>{Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});await act(async()=>root.render(<TitleBar/>));await click(node.querySelector('.titlebar-minimize')!);await click(node.querySelector('.titlebar-maximize')!);await click(node.querySelector('.titlebar-close')!);expect(m.minimize).toHaveBeenCalledOnce();expect(m.maximize).toHaveBeenCalledOnce();expect(m.close).toHaveBeenCalledOnce();});
it('titlebar Undo/Redo restores values and reflects availability',async()=>{const s=useAppStore.getState(),post=s.items.find(i=>i.rowType==='begrotingspost')!;s.pushHistory(s.items,'Synthetic edit');s.updateItem(post.id,'description','Changed');await act(async()=>root.render(<TitleBar/>));await click(node.querySelector(`[aria-label="${tr('undo')}"]`)!);expect(useAppStore.getState().items.find(i=>i.id===post.id)?.description).not.toBe('Changed');await click(node.querySelector(`[aria-label="${tr('redo')}"]`)!);expect(useAppStore.getState().items.find(i=>i.id===post.id)?.description).toBe('Changed');});
it('workspace save/update/delete and second screen have concrete effects',async()=>{
 await act(async()=>root.render(<WorkspaceLayoutBar/>));const byText=(label:string)=>[...node.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 await input(node.querySelector('input')!,'Synthetic layout');await click(byText(wt('layouts.saveNew')));let state=useAppStore.getState();expect(state.settings.workspaceLayouts?.some(layout=>layout.name==='Synthetic layout')).toBe(true);const id=state.activeWorkspaceLayoutId;await act(async()=>state.setGridZoom(125));await click([...node.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Synthetic layout'))!);expect(useAppStore.getState().settings.workspaceLayouts?.find(layout=>layout.id===id)?.gridZoom).toBe(125);await click(byText(wt('layouts.delete')));expect(useAppStore.getState().settings.workspaceLayouts?.some(layout=>layout.id===id)).toBe(false);await click(byText(wt('companion.open')));expect(m.second).toHaveBeenCalledOnce();
});
