// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseTakeoff,aggregateTakeoff} from '../services/ifc/ifcTakeoff';
describe('IFC-Lite quantity takeoff',()=>{
 it('reads actual IFC QTO, converts millimetres and aggregates without double counting',async()=>{
  const bytes=readFileSync('test/fixtures/ifc-lite/wall-quantities.ifc');
  const model=await parseTakeoff(Uint8Array.from(bytes).buffer,'walls.ifc');
  expect(model.elements.map(e=>e.expressId)).toContain(20);
  expect(aggregateTakeoff(model,[20,30,20],'Qto_WallBaseQuantities/Length').value).toBe(6);
  expect(aggregateTakeoff(model,[20,30],'Qto_WallBaseQuantities/NetSideArea').value).toBe(18);
  expect(aggregateTakeoff(model,[20,30],'Qto_WallBaseQuantities/NetVolume').value).toBeCloseTo(3.6);
  expect(aggregateTakeoff(model,[20,30,20],'__count__').value).toBe(2);
  expect(()=>aggregateTakeoff(model,[20,999],'__count__')).toThrow('Onbekend');
  expect(()=>aggregateTakeoff(model,[20],'GrossVolume')).toThrow('niet');
 });
});
