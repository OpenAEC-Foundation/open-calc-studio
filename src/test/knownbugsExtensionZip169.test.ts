import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';

// Knownbug 169: ZIP-installatie koos het verkeerde hoofdbestand en de fout bleef stil.
const saved:{id:string;mainCode:string}[]=[];
vi.mock('../extensions/extensionLoader',()=>({
 saveExtensionToDb:vi.fn(async(rec:{id:string;mainCode:string})=>{saved.push(rec);}),
 removeExtensionFromDb:vi.fn(),
 enableExtension:vi.fn(async()=>{}),
 disableExtension:vi.fn(async()=>{}),
 getActivePlugins:()=>new Map(),
}));
import {installFromFile} from '../extensions/extensionService';

/** Minimale ZIP met alleen local file headers, methode 0 (stored). */
function storedZip(files:Record<string,string>):Uint8Array {
 const enc=new TextEncoder(); const parts:number[]=[];
 for(const [name,text] of Object.entries(files)){
  const n=enc.encode(name), d=enc.encode(text);
  const h=new DataView(new ArrayBuffer(30));
  h.setUint32(0,0x04034b50,true); h.setUint16(8,0,true);
  h.setUint32(18,d.length,true); h.setUint32(22,d.length,true);
  h.setUint16(26,n.length,true); h.setUint16(28,0,true);
  parts.push(...new Uint8Array(h.buffer),...n,...d);
 }
 return new Uint8Array(parts);
}

function pickFile(bytes:Uint8Array){
 const realCreate=document.createElement.bind(document);
 vi.spyOn(document,'createElement').mockImplementation(((tag:string)=>{
  const el=realCreate(tag) as HTMLInputElement;
  if(tag==='input'){
   el.click=()=>{
    const file={name:'ext.zip',arrayBuffer:async()=>bytes.slice().buffer} as unknown as File;
    el.onchange?.({target:{files:[file]}} as unknown as Event);
   };
  }
  return el;
 }) as typeof document.createElement);
}

const manifest=(main:string)=>JSON.stringify({id:'demo',name:'Demo',version:'1.0.0',main});

beforeEach(()=>{saved.length=0;});
afterEach(()=>{vi.restoreAllMocks();});

describe('extension ZIP install (knownbug 169)',()=>{
 it('keeps a main file in a subfolder when the ZIP has no shared root folder',async()=>{
  pickFile(storedZip({'manifest.json':manifest('dist/main.js'),'dist/main.js':'/*main*/'}));
  expect(await installFromFile()).toEqual({ok:true});
  expect(saved[0]?.mainCode).toBe('/*main*/');
 });
 it('matches the main file on its exact path, not on a suffix',async()=>{
  pickFile(storedZip({'demo/manifest.json':manifest('main.js'),'demo/domain.js':'/*domain*/','demo/main.js':'/*main*/'}));
  expect(await installFromFile()).toEqual({ok:true});
  expect(saved[0]?.mainCode).toBe('/*main*/');
 });
 it('ignores macOS archive metadata when finding the shared root folder',async()=>{
  pickFile(storedZip({'demo/manifest.json':manifest('main.js'),'demo/main.js':'/*main*/','__MACOSX/demo/._manifest.json':'xx','__MACOSX/demo/._main.js':'xx'}));
  expect(await installFromFile()).toEqual({ok:true});
  expect(saved[0]?.mainCode).toBe('/*main*/');
 });
 it('reports why an install failed',async()=>{
  pickFile(storedZip({'manifest.json':manifest('missing.js')}));
  expect(await installFromFile()).toEqual({ok:false,error:'Main file "missing.js" not found in ZIP'});
 });
});
