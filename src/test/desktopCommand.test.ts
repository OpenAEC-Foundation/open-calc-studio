import {beforeEach,describe,it,expect} from 'vitest';
import {useAppStore} from '../state/appStore';
import {executeDesktopCommand} from '../services/mcp/desktopCommand';
import catalogue from '../services/mcp/desktopActions.json';
const initial=useAppStore.getState();
beforeEach(()=>{useAppStore.setState(initial,true);useAppStore.getState().addDocument({fileName:'MCP test',items:[]});});
describe('MCP desktop command boundary',()=>{
 it('covers every JSON-callable store action and explicitly lists callback-only hooks',()=>{
  const methods=Object.keys(useAppStore.getState()).filter(k=>typeof(useAppStore.getState() as any)[k]==='function');
  expect(methods.filter(k=>!(k in catalogue.actions)&&!(k in catalogue.excluded))).toEqual([]);
 });
 it('uses the actual desktop sheet identifier and confirms the cell write',async()=>{
  const result=await executeDesktopCommand('addSubSheet',{name:'Hoeveelheden'}) as {result:string};
  await executeDesktopCommand('setSubSheetCell',{sheetId:result.result,cellRef:'A1',value:'12.5'});
  expect(useAppStore.getState().subSheets.find(s=>s.id===result.result)?.cells.A1.value).toBe('12.5');
 });
 it('validates types and enum values before invoking a store action',async()=>{
  await expect(executeDesktopCommand('setActiveContentTab',{tab:'nonexistent'})).rejects.toThrow();
  await expect(executeDesktopCommand('setGridZoom',{zoom:'large'})).rejects.toThrow();
  await expect(executeDesktopCommand('__proto__',{})).rejects.toThrow('Unknown action');
  expect(useAppStore.getState().gridZoom).toBe(initial.gridZoom);
 });
 it('does not return API credentials in app state',async()=>{
  const state=await executeDesktopCommand('getState') as object;
  expect(Object.keys(state).some(k=>/token|apiKey|secret/i.test(k))).toBe(false);
 });
 it('makes the IFC split view reachable and preserves saved quantities in native project',async()=>{
  await executeDesktopCommand('setActiveContentTab',{tab:'viewer3d'});
  expect(useAppStore.getState().activeContentTab).toBe('viewer3d');
  useAppStore.getState().setSchedule({ifcTakeoff:{models:[],entries:[{fragmentId:'model:20:volume',label:'Wall',modelId:'model',elementIds:[20],quantityKey:'NetVolume',volume:2.4}]}});
  const project=await executeDesktopCommand('getProject') as any;
  expect(project.schedule.ifcTakeoff.entries[0].volume).toBe(2.4);
  expect(useAppStore.getState().ifcQuantities[0].volume).toBe(2.4);
 });
});
