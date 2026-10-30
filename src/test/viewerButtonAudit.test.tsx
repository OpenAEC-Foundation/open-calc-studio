import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { ThreeDViewer } from '@/components/viewers/ThreeDViewer';
import { getIfcSession,loadIfcModel } from '@/services/ifc/ifcLiteWorkspace';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
const fixture=vi.hoisted(()=>({model:{id:'viewer-button-model',fileName:'Synthetic.ifc',elements:[20,30].map(id=>({id:`e${id}`,expressId:id,globalId:`g${id}`,type:'IfcWall',name:`Wall ${id}`,quantities:[{key:'NetVolume',kind:'volume',label:'Net volume',unit:'m³',value:id===20?2:4}]}))}}));
vi.mock('@/services/ifc/ifcTakeoff',async original=>({...await original<typeof import('@/services/ifc/ifcTakeoff')>(),parseTakeoff:vi.fn(async()=>fixture.model)}));
vi.mock('@ifc-lite/geometry',()=>({GeometryProcessor:class{async init(){} async *processStreaming(){} dispose(){}}}));
vi.mock('three',async original=>({...await original<typeof import('three')>(),WebGLRenderer:class{domElement=document.createElement('canvas');setPixelRatio(){}setSize(){}render(){}dispose(){}}}));
vi.mock('@/components/grid/CostGrid',()=>({CostGrid:()=> <div>Estimate grid adapter</div>}));
const initial=useAppStore.getState();let node:HTMLDivElement,root:Root;
const tr=(key:string)=>i18next.t('workspace.'+key,{defaultValue:i18next.t(key)});
const button=(key:string)=>[...node.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===tr(key))!;
async function click(key:string){expect(button(key),key).toBeTruthy();await act(async()=>button(key).click());}
beforeEach(async()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;await i18next.changeLanguage('en');useAppStore.setState(initial,true);const s=useAppStore.getState();s.addDocument({id:crypto.randomUUID(),items:[]});const post=s.addItem(s.addChapter(null));s.setActiveCell(s.getGridRows().findIndex(i=>i.id===post),2,post);node=document.createElement('div');document.body.append(node);root=createRoot(node);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('empty model disables operations that need geometry or a selection',async()=>{await act(async()=>root.render(<ThreeDViewer/>));expect(button('ifc.fit')).toBeDisabled();expect(button('ifc.isolate')).toBeDisabled();expect(button('ifc.takeoff')).toBeDisabled();});
it('Fit and Isolate change the real IFC session, and Apply links the selected quantity once',async()=>{
 await loadIfcModel(new ArrayBuffer(0),'Synthetic.ifc');await act(async()=>root.render(<ThreeDViewer/>));const state=useAppStore.getState(),session=getIfcSession(state.activeDocumentId)!;const before=session.cameraRevision;await click('ifc.fit');expect(session.cameraRevision).toBe(before+1);
 const checkboxes=node.querySelectorAll<HTMLInputElement>('.ifc-element-list input');await act(async()=>{checkboxes[0].click();checkboxes[1].click();});expect(session.selected).toHaveLength(2);await click('ifc.isolate');expect(session.isolated).toBe(true);await click('ifc.isolate');expect(session.isolated).toBe(false);
 const quantity=node.querySelector<HTMLSelectElement>('.ifc-takeoff select')!;await act(async()=>{quantity.value='NetVolume';quantity.dispatchEvent(new Event('change',{bubbles:true}));});await click('ifc.takeoff');expect(useAppStore.getState().items.find(item=>item.id===state.activeItemId)).toMatchObject({quantity:6,unit:'m³',quantityLink:{source:'ifc'}});expect(useAppStore.getState().undoStack).toHaveLength(1);
});
it('Open IFC requests an IFC file and the split slider updates the actual split',async()=>{const picker=vi.spyOn(HTMLInputElement.prototype,'click').mockImplementation(()=>{});await act(async()=>root.render(<ThreeDViewer/>));await click('ifc.open');expect((picker.mock.contexts[0] as HTMLInputElement).accept).toBe('.ifc');const range=node.querySelector<HTMLInputElement>('input[type=range]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(range,'65');range.dispatchEvent(new Event('input',{bubbles:true}));});expect(useAppStore.getState().ifcSplitPercent).toBe(65);});
