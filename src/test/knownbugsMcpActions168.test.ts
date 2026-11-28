import {describe,it,expect,beforeEach} from 'vitest';
import {execFileSync} from 'node:child_process';
import {useAppStore} from '../state/appStore';
import {executeDesktopCommand} from '../services/mcp/desktopCommand';

// Knownbug 168: de MCP-actielijst liep achter op de slices, dus geldige calls werden geweigerd.
const initial=useAppStore.getState();
beforeEach(()=>{useAppStore.setState(initial,true);useAppStore.getState().addDocument({fileName:'MCP test',items:[]});});

describe('MCP desktop action catalogue (knownbug 168)',()=>{
 it('accepts schedule fields that exist in the store types',async()=>{
  await executeDesktopCommand('setSchedule',{schedule:{priceCountry:'NL',priceLibraries:['nl']}});
  expect(useAppStore.getState().schedule.priceCountry).toBe('NL');
 });
 it('is up to date with the store slices',()=>{
  expect(()=>execFileSync(process.execPath,['scripts/generate-mcp-actions.mjs','--check'],{stdio:'pipe'})).not.toThrow();
 },120000);
});
