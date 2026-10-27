import { useTranslation } from 'react-i18next';
import { uiText } from '@/i18n/uiText';
/** IFC-Lite geometry and quantities, rendered with Three.js/WebGL in a split workspace. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useAppStore } from '@/state/appStore';
import { CostGrid } from '@/components/grid/CostGrid';
import { getIfcSession, subscribeIfc, ifcRevision, ifcCommand, loadIfcModel } from '@/services/ifc/ifcLiteWorkspace';
import { aggregateTakeoff } from '@/services/ifc/ifcTakeoff';
import './ThreeDViewer.css';

export function ThreeDViewer() {
  const { i18n } = useTranslation();
  const docId=useAppStore(s=>s.activeDocumentId);
  const targetId=useAppStore(s=>s.activeItemId);
  const items=useAppStore(s=>s.items);
  const revision=useSyncExternalStore(subscribeIfc,ifcRevision);
  const session=getIfcSession(docId);
  const mount=useRef<HTMLDivElement>(null);
  const rendererState=useRef<{scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;group:THREE.Group;fit:()=>void}|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  const [search,setSearch]=useState(''); const [key,setKey]=useState('__count__'); const width=useAppStore(s=>s.ifcSplitPercent); const setWidth=useAppStore(s=>s.setIfcSplitPercent);
  const selected=session?.selected??[];
  const first=session?.model.elements.find(e=>e.expressId===selected[0]);
  const options=first?.quantities.filter(q=>selected.every(id=>session?.model.elements.find(e=>e.expressId===id)?.quantities.some(v=>v.key===q.key&&v.kind===q.kind)))??[];
  const metric=key==='__count__'||options.some(q=>q.key===key)?key:'__count__';
  const total=session&&selected.length?aggregateTakeoff(session.model,selected,metric):null;
  const target=items.find(i=>i.id===targetId);
  const eligible=!!target&&['regel','begrotingspost','bewakingspost'].includes(target.rowType);
  const run=async(action:string,params:Record<string,unknown>={})=>{try{setError('');await ifcCommand(action,params);}catch(e){setError(String(e));}};
  const load=async(file:File)=>{if(loading)return;setLoading(true);setError('');try{if(file.size>100*1024*1024)throw Error(uiText("ifc.maxSize", "Use an IFC file up to 100 MB."));await loadIfcModel(await file.arrayBuffer(),file.name);}catch(e){setError(String(e));}finally{setLoading(false);}};

  useEffect(()=>{
    const container=mount.current;if(!container)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});}catch(e){setError(uiText('ifc.unavailable', '3D view unavailable: {{error}}', { error: String(e) }));return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#e6edf3');
    scene.add(new THREE.HemisphereLight(0xffffff,0x617181,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,20,10);scene.add(light);
    const camera=new THREE.PerspectiveCamera(45,1,0.01,100000);camera.position.set(10,10,10);
    const controls=new OrbitControls(camera,renderer.domElement);const group=new THREE.Group();scene.add(group);
    const render=()=>renderer.render(scene,camera);controls.addEventListener('change',render);
    const fit=()=>{const box=new THREE.Box3().setFromObject(group);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3());const distance=Math.max(box.getSize(new THREE.Vector3()).length(),1);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(distance,distance*.7,distance));camera.near=Math.max(distance/10000,.001);camera.far=Math.max(distance*100,1000);camera.updateProjectionMatrix();controls.update();render();};
    const resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}});resize.observe(container);
    let down={x:0,y:0};const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const click=(e:MouseEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const bounds=renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1),camera);const hit=ray.intersectObjects(group.children).find(h=>h.object.visible);const current=getIfcSession(docId);if(!current)return;const id=hit?.object.userData.expressId as number|undefined;let ids=id?[id]:[];if(id&&(e.ctrlKey||e.metaKey))ids=current.selected.includes(id)?current.selected.filter(v=>v!==id):[...current.selected,id];void run('select',{elementIds:ids});};
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('click',click);
    rendererState.current={scene,camera,controls,group,fit};render();
    return()=>{resize.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('click',click);group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});renderer.dispose();renderer.domElement.remove();rendererState.current=null;};
  },[docId]);
  useEffect(()=>{
    const r=rendererState.current;if(!r)return;
    for(const child of [...r.group.children]){if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}r.group.remove(child);}
    for(const m of session?.meshes??[]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));const material=new THREE.MeshStandardMaterial({color:new THREE.Color(m.color[0],m.color[1],m.color[2]),opacity:m.color[3],transparent:m.color[3]<1,side:THREE.DoubleSide,roughness:.8});const mesh=new THREE.Mesh(g,material);if(m.origin)mesh.position.fromArray(m.origin);mesh.userData.expressId=m.expressId;r.group.add(mesh);}
    r.fit();r.controls.dispatchEvent({type:'change'});
  },[docId,session?.meshes]);
  useEffect(()=>{const r=rendererState.current;if(!r)return;for(const o of r.group.children){const m=o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;const isSelected=selected.includes(m.userData.expressId);m.material.emissive.set(isSelected?0x006699:0x000000);m.visible=!session?.isolated||isSelected;}r.controls.dispatchEvent({type:'change'});},[revision,docId]);
  useEffect(()=>{rendererState.current?.fit();},[session?.cameraRevision]);
  return <div className="ifc-workspace">
    <header><strong>{uiText("ifc.title", "3D & Estimate · IFC-Lite")}</strong><button disabled={loading} onClick={()=>input.current?.click()}>{uiText("ifc.open", "Open IFC")}</button><input ref={input} type="file" accept=".ifc" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value='';}}/><button onClick={()=>run('fit')} disabled={!session}>{uiText("ifc.fit", "Fit all")}</button><button onClick={()=>run('isolate',{enabled:!session?.isolated})} disabled={!selected.length}>{uiText("ifc.isolate", "Isolate selection")}</button><label>{uiText("ifc.split", "Split")}<input type="range" min="30" max="70" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label></header>
    {error&&<div role="alert" className="ifc-error">{error}</div>}
    <div className="ifc-columns">
      <section className="ifc-model" style={{width:`${width}%`}} aria-label={uiText("ifc.model", "IFC model")} onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>{e.preventDefault();e.stopPropagation();const file=e.dataTransfer.files[0];if(file)void load(file);}}>
        <div className="ifc-canvas" ref={mount}/>
        {(!session||loading)&&<div className="ifc-status" role="status">{loading?uiText("ifc.loading", "IFC-Lite is loading geometry and quantities…"):uiText("ifc.drop", "Open or drop an IFC file. Click an element; Ctrl/⌘-click to select several.")}</div>}
        <div className="ifc-elements"><input aria-label={uiText("ifc.search", "Search elements")} placeholder={uiText("ifc.searchHint", "Search by name or IFC type")} value={search} onChange={e=>setSearch(e.target.value)}/><span>{session?.model.fileName} · {uiText('ifc.selected', '{{count}} selected', { count: selected.length })}</span><div className="ifc-element-list">{session?.model.elements.filter(e=>`${e.name} ${e.type}`.toLowerCase().includes(search.toLowerCase())).slice(0,300).map(e=><label key={e.id}><input type="checkbox" checked={selected.includes(e.expressId)} onChange={()=>run('select',{elementIds:selected.includes(e.expressId)?selected.filter(id=>id!==e.expressId):[...selected,e.expressId]})}/>{e.type} · {e.name}</label>)}</div></div>
        <div className="ifc-takeoff"><select aria-label={uiText("ifc.quantity", "IFC quantity")} value={metric} onChange={e=>setKey(e.target.value)}><option value="__count__">{uiText("ifc.count", "Element count")}</option>{options.map(q=><option key={q.key} value={q.key}>{q.label} ({q.unit})</option>)}</select><strong>{total?`${total.value.toLocaleString(i18n.language,{maximumFractionDigits:4})} ${total.unit}`:uiText("ifc.select", "Select elements")}</strong><button disabled={!total||!eligible} onClick={()=>run('takeoff',{quantityKey:metric,itemId:targetId})}>{uiText("ifc.takeoff", "Apply to selected item")}</button><small>{eligible?`${target?.nr} ${target?.description}`:uiText("ifc.target", "Select an estimate item or calculation line on the right.")} {uiText("ifc.quantityHelp", "Quantities come from IFC quantity sets; check gross/net values.")}</small></div>
      </section>
      <section className="ifc-budget" aria-label={uiText("ifc.budgetLabel", "Estimate beside IFC")}><CostGrid/></section>
    </div>
  </div>;
}
