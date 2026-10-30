import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IfcElementBrowser } from '@/components/viewers/IfcElementBrowser';
import { ifcCommand, loadIfcModel, getIfcSession } from '@/services/ifc/ifcLiteWorkspace';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import type { TakeoffModel } from '@/services/ifc/ifcTakeoff';

const fixture = vi.hoisted(() => ({ model: { id: 'paged-model', fileName: 'Synthetic.ifc', elements: Array.from({length:501},(_,i)=>({id:`e${i+1}`,expressId:i+1,globalId:`g${i+1}`,name:`Element ${i+1}`,type:i%2===0?'IfcWall':'IfcSlab',quantities:[]})) } }));
vi.mock('@/services/ifc/ifcTakeoff', async original => ({ ...await original<typeof import('@/services/ifc/ifcTakeoff')>(), parseTakeoff: vi.fn(async () => fixture.model) }));
vi.mock('@ifc-lite/geometry', () => ({ GeometryProcessor: class { async init(){} async *processStreaming(){} dispose(){} } }));
let root: Root, node: HTMLDivElement;
beforeEach(async()=>{ (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState({documents:[],activeDocumentId:'',items:[]});useAppStore.getState().addDocument({id:'ifc-paging',items:[]});node=document.createElement('div');document.body.append(node);root=createRoot(node); });
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.restoreAllMocks();});
function button(text: string){return [...node.querySelectorAll('button')].find(button=>button.textContent===text)!;}
async function click(text: string){await act(async()=>button(text).click());}

it('makes elements after 300 reachable, reports counts and selects every search result through the actual command', async()=>{
 await loadIfcModel(new ArrayBuffer(0),fixture.model.fileName);
 const run=vi.fn(async(action:string,params:Record<string,unknown>)=>ifcCommand(action,params));
 await act(async()=>root.render(<IfcElementBrowser model={fixture.model as TakeoffModel} selected={[]} run={run}/>));
 expect(node.querySelectorAll('[type=checkbox]')).toHaveLength(100);expect(node.querySelector('[role=status]')).toHaveTextContent('1–100 of 501');
 for(let i=0;i<3;i++)await click('Next page');expect(node.querySelector('.ifc-element-list')).toHaveTextContent('Element 301');expect(node.querySelector('[role=status]')).toHaveTextContent('301–400');
 const search=node.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'IfcWall');search.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(node.querySelector('[role=status]')).toHaveTextContent('1–100 of 251');
 await click('Select all results (251)');expect(getIfcSession('ifc-paging')?.selected).toHaveLength(251);expect(getIfcSession('ifc-paging')?.selected).toContain(501);
 await act(async()=>root.render(<IfcElementBrowser model={fixture.model as TakeoffModel} selected={getIfcSession('ifc-paging')!.selected} run={run}/>));
 await click('Clear selection');expect(getIfcSession('ifc-paging')?.selected).toEqual([]);
});
it('rejects unknown IDs and malformed filter input without changing the selection',async()=>{
 await loadIfcModel(new ArrayBuffer(0),fixture.model.fileName);await ifcCommand('select',{elementIds:[501]});
 await expect(ifcCommand('select',{elementIds:[502]})).rejects.toThrow();await expect(ifcCommand('selectFiltered',{search:4})).rejects.toThrow();
 expect((await ifcCommand('getSelection',{}) as {elementIds:number[]}).elementIds).toEqual([501]);
});
