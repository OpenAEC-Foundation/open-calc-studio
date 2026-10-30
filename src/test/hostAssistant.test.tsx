import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect } from 'vitest';
import { useOwnAssistant } from '@/hooks/useOwnAssistant';
import type { SiteHost } from '@/services/file/siteHost';

it('removes the independent assistant when a host is injected after startup and restores it after removal',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 function Harness(){return useOwnAssistant()?<button>Own assistant</button>:null;}
 try{
  await act(async()=>root.render(<Harness/>));expect(node.querySelector('button')).toBeTruthy();
  window.openaecHost={open:async()=>{throw Error('unused');},save:async()=>{throw Error('unused');},list:async()=>[],versions:async()=>[]} satisfies SiteHost;
  await act(async()=>window.dispatchEvent(new Event('openaec-host-ready')));expect(node.querySelector('button')).toBeNull();
  delete window.openaecHost;await act(async()=>window.dispatchEvent(new Event('openaec-host-ready')));expect(node.querySelector('button')).toBeTruthy();
 }finally{await act(async()=>root.unmount());node.remove();delete window.openaecHost;}
});
