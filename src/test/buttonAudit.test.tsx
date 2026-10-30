import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import HomeTab from '@/components/ribbon/HomeTab';
import SpreadsheetTab from '@/components/ribbon/SpreadsheetTab';
import TekstopmaakTab from '@/components/ribbon/TekstopmaakTab';
import { SubSheetEditor } from '@/components/grid/SubSheetEditor';
import { QuantityPicker } from '@/components/common/QuantityPicker';
import FindReplaceDialog from '@/components/grid/FindReplaceDialog';
import { ProjectInfoSettings } from '@/components/report/ProjectInfoSettings';
import StatusBar from '@/components/layout/StatusBar';
import i18next from '@/i18n/config';

const initial=useAppStore.getState();
let node:HTMLDivElement,root:Root,chapter:string,post:string,second:string;
const row=(id=post)=>useAppStore.getState().items.find(item=>item.id===id)!;
const tr=(key:string,ns='ribbon')=>i18next.t(key,{ns});
function button(text:string,scope:ParentNode=document){const element=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text||b.getAttribute('title')===text||b.getAttribute('aria-label')===text);expect(element,`Button ${text}`).toBeTruthy();return element!;}
async function click(text:string){await act(async()=>button(text).click());}
async function render(element:React.ReactNode){await act(async()=>root.render(element));}
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function select(id:string){const s=useAppStore.getState();s.setActiveCell(s.getGridRows().findIndex(item=>item.id===id),2,id);}
beforeEach(async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 await i18next.changeLanguage('en');useAppStore.setState(initial,true);
 const s=useAppStore.getState();s.addDocument({id:'button-audit',items:[]});chapter=s.addChapter(null);post=s.addItem(chapter);second=s.addItem(chapter);
 s.updateItem(post,'description','Concrete');s.updateItem(second,'description','Masonry');s.updateItem(post,'quantity',2);s.updateItem(post,'normUnitPrice',10);select(post);
 s.updateDocument('button-audit',{isModified:false});useAppStore.setState({undoStack:[],redoStack:[]});
 vi.spyOn(window,'alert').mockImplementation(()=>{});vi.spyOn(window,'confirm').mockReturnValue(true);
 node=document.createElement('div');document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.restoreAllMocks();});

describe('home ribbon button outcomes',()=>{
 it.each([['home.chapter','chapter'],['home.budgetPost','begrotingspost'],['home.monitorPost','bewakingspost'],['home.calculationRule','regel'],['home.textLine','tekstregel'],['home.blankLine','witregel'],['home.addRegelDirect','regel']])('inserts the intended row with %s and can undo and redo it',async(key,type)=>{
  await render(<HomeTab/>);const count=useAppStore.getState().items.filter(item=>item.rowType===type).length;
  await click(tr(key));expect(useAppStore.getState().items.filter(item=>item.rowType===type)).toHaveLength(count+1);
  await click(tr('home.undo'));expect(useAppStore.getState().items.filter(item=>item.rowType===type)).toHaveLength(count);
  await click(tr('home.redo'));expect(useAppStore.getState().items.filter(item=>item.rowType===type)).toHaveLength(count+1);
 });
 it.each(['home.copy','home.cut'])('%s includes all selected rows',async(key)=>{
  const s=useAppStore.getState(),rows=s.getGridRows();s.setSelectionRange(rows.findIndex(r=>r.id===post),rows.findIndex(r=>r.id===second));await render(<HomeTab/>);await click(tr(key));
  expect(useAppStore.getState().clipboardItems.map(item=>item.id)).toEqual([post,second]);
 });
 it('delete removes the selected rows as one undoable edit',async()=>{
  const s=useAppStore.getState(),rows=s.getGridRows();s.setSelectionRange(rows.findIndex(r=>r.id===post),rows.findIndex(r=>r.id===second));await render(<HomeTab/>);await click(tr('budget.deleteRow'));
  expect(useAppStore.getState().items.some(item=>[post,second].includes(item.id))).toBe(false);expect(useAppStore.getState().undoStack).toHaveLength(1);
  await click(tr('home.undo'));expect(row()).toBeTruthy();expect(row(second)).toBeTruthy();
 });
 it('disables commands whose target is missing or incompatible',async()=>{
  select(chapter);await render(<HomeTab/>);expect(button(tr('home.monitorPost'))).toBeDisabled();
  await act(async()=>useAppStore.setState({activeItemId:null,activeRow:-1}));expect(button(tr('home.copy'))).toBeDisabled();expect(button(tr('home.cut'))).toBeDisabled();
 });
 it('copies and pastes actual rows and restores the paste with undo',async()=>{
  await render(<HomeTab/>);await click(tr('home.copy'));await click(tr('home.paste'));expect(useAppStore.getState().items.filter(i=>i.description==='Concrete')).toHaveLength(2);await click(tr('home.undo'));expect(useAppStore.getState().items.filter(i=>i.description==='Concrete')).toHaveLength(1);
 });
 it.each([['home.viewUi1','st'],['home.viewUi2','wpcalc'],['home.viewUi3','simple']])('switches %s to %s',async(key,value)=>{await render(<HomeTab/>);await click(tr(key));expect(useAppStore.getState().gridView).toBe(value);});
 it('toggles quantity display and change tracking, and selects both mark styles',async()=>{
  await render(<HomeTab/>);const before=useAppStore.getState().showHoeveelheid;await click(tr('home.quantity'));expect(useAppStore.getState().showHoeveelheid).toBe(!before);
  await click(tr('home.trackChanges'));expect(useAppStore.getState().schedule.changeTrackingSince).toBeTruthy();await click(tr('home.cellOnly'));expect(useAppStore.getState().schedule.changeDisplayMode).toBe('cell');await click(tr('home.wholeRow'));expect(useAppStore.getState().schedule.changeDisplayMode).toBe('row');await click(tr('home.clearMarks'));expect(useAppStore.getState().schedule.changeTrackingSince).toBeTruthy();
 });
 it('creates a real option set and allows disabling variants',async()=>{
  await render(<HomeTab/>);await click(tr('home.optionSet'));const s=useAppStore.getState();expect(s.schedule.branchesEnabled).toBe(true);expect(s.schedule.branches).toHaveLength(4);await click(tr('home.variants'));expect(useAppStore.getState().schedule.branchesEnabled).toBe(false);
 });
 it('scales prices on apply, keeps invalid values unapplied, and can undo',async()=>{
  await render(<HomeTab/>);await click(tr('home.pricesPct'));const field=document.querySelector<HTMLInputElement>('.price-scale-input')!;
  await input(field,'-100');expect(button(tr('home.apply'))).toBeDisabled();expect(row().normUnitPrice).toBe(10);
  await input(field,'10');await click(tr('home.apply'));expect(row().normUnitPrice).toBe(11);await click(tr('home.undo'));expect(row().normUnitPrice).toBe(10);
 });
 it('opens project data and closes its dialog',async()=>{await render(<HomeTab/>);await click(tr('home.projectData'));expect(document.querySelector('[role=dialog]')).toHaveTextContent(tr('projectInfo.keyFigures','common'));await click(tr('close','common'));expect(document.querySelector('[role=dialog]')).toHaveAttribute('aria-hidden','true');});
});

describe('spreadsheet commands reach the selected cells',()=>{
 it('new and delete sheet change the document and navigation',async()=>{
  await render(<SpreadsheetTab/>);await click(tr('spreadsheet.newSheet'));expect(useAppStore.getState().subSheets).toHaveLength(1);expect(useAppStore.getState().activeContentTab).toBe('spreadsheet');await click(tr('spreadsheet.deleteSheet'));expect(useAppStore.getState().subSheets).toHaveLength(0);
 });
 it('disables formatting when the editor has no active sheet',async()=>{await render(<SpreadsheetTab/>);expect(button(tr('spreadsheet.bold'))).toBeDisabled();expect(button(tr('spreadsheet.decimalUp'))).toBeDisabled();});
 it.each([['spreadsheet.bold','bold',true],['spreadsheet.italic','italic',true],['spreadsheet.alignLeft','align','left'],['spreadsheet.alignCenter','align','center'],['spreadsheet.alignRight','align','right'],['spreadsheet.decimalUp','decimals',3],['spreadsheet.decimalDown','decimals',1]])('%s changes the selected cell',async(key,field,value)=>{
  const s=useAppStore.getState(),id=s.addSubSheet('Quantities');s.setActiveContentTab('spreadsheet');s.setSubSheetCell(id,'A1','12');await render(<><SpreadsheetTab/><SubSheetEditor sheetId={id}/></>);
  const cell=node.querySelector('.subsheet-cell')!;await act(async()=>cell.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));await click(tr(key));expect(useAppStore.getState().subSheets[0].cells.A1[field as 'bold']).toBe(value);
 });
});

describe('text formatting buttons',()=>{
 it.each([['tekstopmaak.bold','textBold',true],['tekstopmaak.italic','textItalic',true],['tekstopmaak.underline','textUnderline',true],['tekstopmaak.larger','textSize',12],['tekstopmaak.smaller','textSize',10],['tekstopmaak.alignLeft','textAlign','left'],['tekstopmaak.alignCenter','textAlign','center'],['tekstopmaak.alignRight','textAlign','right']])('%s formats text and creates undo history',async(key,field,value)=>{
  const s=useAppStore.getState(),id=s.addTekstregel(post);select(id);await render(<TekstopmaakTab/>);await click(tr(key));expect(row(id)[field as 'textBold']).toBe(value);expect(useAppStore.getState().undoStack).toHaveLength(1);
 });
 it('disables all formatting for a price row and clears text formatting',async()=>{
  await render(<TekstopmaakTab/>);expect([...node.querySelectorAll('button')].every(b=>b.disabled)).toBe(true);
  const s=useAppStore.getState();let id='';await act(async()=>{id=s.addTekstregel(post);s.updateItem(id,'textBold',true);s.updateItem(id,'textSize',18);select(id);});await click(tr('tekstopmaak.clearFormat'));expect(row(id)).toMatchObject({textBold:false,textItalic:false,textUnderline:false,textAlign:'left',textSize:null});
 });
});

describe('pickers, search and project actions',()=>{
 it('does not link a nonexistent spreadsheet cell as a fictitious zero',async()=>{
  const s=useAppStore.getState();s.addSubSheet('Source');const pick=vi.fn();await render(<QuantityPicker onPick={pick} onClose={vi.fn()}/>);await input(node.querySelector('input')!,'Z99');await click(tr('quantityPicker.linkCell','dialogs'));expect(pick).not.toHaveBeenCalled();expect(window.alert).toHaveBeenCalled();
 });
 it('links a valid zero cell and closes the picker',async()=>{
  const s=useAppStore.getState(),id=s.addSubSheet('Source');s.setSubSheetCell(id,'A1','0');const pick=vi.fn(),close=vi.fn();await render(<QuantityPicker onPick={pick} onClose={close}/>);await input(node.querySelector('input')!,'a1');await click(tr('quantityPicker.linkCell','dialogs'));expect(pick).toHaveBeenCalledWith({source:'spreadsheet',sheetId:id,cellRef:'A1'},0);expect(close).toHaveBeenCalledOnce();
 });
 it('does not enable a PDF area sum when only lengths exist',async()=>{
  useAppStore.setState({pdfMeasurements:[{id:'l',label:'Length',type:'length',page:1,value:2}]});await render(<QuantityPicker onPick={vi.fn()} onClose={vi.fn()}/>);await click('📄 '+tr('quantityPicker.tabPdf','dialogs'));expect(button(tr('quantityPicker.sumAreas','dialogs'))).toBeDisabled();
 });
 it('find-next expands parents and selects the target without making the project dirty',async()=>{
  const s=useAppStore.getState();s.toggleCollapse(chapter);await render(<FindReplaceDialog open onClose={vi.fn()}/>);await input(node.querySelector('input')!,'Concrete');await click(tr('findReplace.next','grid'));await act(async()=>new Promise(resolve=>requestAnimationFrame(() => resolve())));expect(useAppStore.getState().activeItemId).toBe(post);expect(row(chapter).isCollapsed).toBe(false);expect(useAppStore.getState().documents[0].isModified).toBe(false);
 });
 it('replace-all changes matching values in one undo step',async()=>{await render(<FindReplaceDialog open onClose={vi.fn()}/>);const fields=node.querySelectorAll('input');await input(fields[0],'Concrete');await input(fields[1],'Steel');await click(tr('findReplace.all','grid'));expect(row().description).toBe('Steel');expect(useAppStore.getState().undoStack).toHaveLength(1);});
 it('add/remove key figures marks the project as modified',async()=>{await render(<ProjectInfoSettings/>);await click('+ '+tr('projectInfo.addKeyFigure','common'));expect(useAppStore.getState().documents[0].isModified).toBe(true);expect(useAppStore.getState().schedule.projectProperties?.some(p=>!p.isDefault)).toBe(true);await click(tr('delete','common'));expect(useAppStore.getState().schedule.projectProperties?.some(p=>!p.isDefault)).toBe(false);});
 it('all zoom buttons update their own zoom, including reset',async()=>{
  await render(<StatusBar/>);const ui=node.querySelectorAll('.status-zoom')[0],grid=node.querySelectorAll('.status-zoom')[1];
  const buttons=ui.querySelectorAll('button');await act(async()=>buttons[2].click());expect(useAppStore.getState().uiZoom).toBeGreaterThan(100);await act(async()=>buttons[1].click());expect(useAppStore.getState().uiZoom).toBe(100);await act(async()=>buttons[0].click());expect(useAppStore.getState().uiZoom).toBeLessThan(100);
  const gb=grid.querySelectorAll('button');await act(async()=>gb[2].click());expect(useAppStore.getState().gridZoom).toBe(110);await act(async()=>gb[1].click());await click('100%');expect(useAppStore.getState().gridZoom).toBe(100);await act(async()=>gb[0].click());expect(useAppStore.getState().gridZoom).toBe(90);
 });
});

it('copies a selected collapsed cost hierarchy with its calculation lines',async()=>{
 const state=useAppStore.getState(),rule=state.addRegel(post);state.updateItem(rule,'quantity',3);state.updateItem(rule,'normUnitPrice',12);state.toggleCollapse(post);select(post);await render(<HomeTab/>);await click(tr('home.copy'));expect(useAppStore.getState().clipboardItems.map(item=>item.id)).toEqual([post,rule]);await click(tr('home.paste'));const clone=useAppStore.getState().items.find(item=>item.description==='Concrete'&&item.id!==post)!;expect(clone.total).toBe(row().total);expect(useAppStore.getState().items.some(item=>item.parentId===clone.id&&item.rowType==='regel')).toBe(true);
});
it('keeps multi-row ribbon actions available when the active endpoint is a synthetic footer',async()=>{
 const state=useAppStore.getState();state.setGridView('wpcalc');const rows=useAppStore.getState().getGridRows(),footer=rows.findIndex(row=>row.id.startsWith('footer:'));state.setActiveCell(footer,2,rows[footer].id);state.setSelectionRange(rows.findIndex(row=>row.id===post),footer);await render(<HomeTab/>);await click(tr('home.copy'));expect(useAppStore.getState().clipboardItems.map(item=>item.id)).toEqual([post,second]);
});

it('custom dialog buttons cannot undo or delete the estimate behind the dialog',async()=>{
 const state=useAppStore.getState();state.pushHistory(state.items,'Prior edit');state.updateItem(post,'normUnitPrice',20);function Harness(){useKeyboardShortcuts();return <div className="cost-grid-wrapper"><div className="modal-dialog"><button>Dialog action</button></div></div>;}await render(<Harness/>);const target=button('Dialog action');await act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));target.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));});expect(row().normUnitPrice).toBe(20);expect(state.canUndo()).toBe(true);
});
