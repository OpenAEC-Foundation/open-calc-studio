import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';
import { CalculationWizard } from '@/components/wizard/CalculationWizard';
import { ReviewCenter } from '@/components/review/ReviewCenter';
import Modal from '@/components/common/Modal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useQuantityLinkSync } from '@/hooks/useQuantityLinkSync';
import { reviewBudget } from '@/services/review/budgetReview';
import i18next from '@/i18n/config';

vi.mock('@/hooks/useFileOperations', () => ({ useFileOperations: () => ({newFile:vi.fn(),openFile:vi.fn(),saveFile:vi.fn(),saveFileAs:vi.fn()}) }));
const initial=useAppStore.getState();
let root:Root|undefined, node:HTMLDivElement, chapter:string, post:string;
beforeEach(async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 await i18next.changeLanguage('en');useAppStore.setState(initial,true);
 const state=useAppStore.getState();state.addDocument({id:'isolated-audit',items:[],fileName:'Synthetic audit'});
 chapter=state.addChapter(null);post=state.addItem(chapter);
 state.updateItem(post,'description','Audit post');state.updateItem(post,'quantity',2);state.updateItem(post,'normUnitPrice',10);
 state.setActiveContentTab('grid');state.updateDocument('isolated-audit',{isModified:false});useAppStore.setState({undoStack:[],redoStack:[]});
 node=document.createElement('div');document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;node?.remove();vi.restoreAllMocks();});
const row=()=>useAppStore.getState().items.find(item=>item.id===post)!;
async function mount(component:React.ReactNode){await act(async()=>root!.render(component));}
async function click(element:HTMLElement){await act(async()=>element.click());}
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function button(text:string,scope:ParentNode=node){const result=[...scope.querySelectorAll('button')].find(button=>button.textContent?.trim()===text);expect(result,`Button ${text}`).toBeTruthy();return result!;}
async function openMobile(){await mount(<MobileWorkspace/>);await click([...node.querySelectorAll<HTMLButtonElement>('.mobile-item-body')].find(button=>button.textContent?.includes('Audit post'))!);}

describe('Usability audit regressions: protect estimate data and navigation',()=>{
 it('U01: mobile Done preserves an explicit zero price without creating undo history',async()=>{
  useAppStore.getState().updateItem(post,'normUnitPrice',0);expect(reviewBudget(useAppStore.getState()).counts.price).toBe(0);
  await openMobile();await click(button('Done'));
  expect(row().normUnitPrice).toBe(0);expect(reviewBudget(useAppStore.getState()).counts.price).toBe(0);expect(useAppStore.getState().canUndo()).toBe(false);
 });
 it('U02: committing mobile edits creates exactly one undo step',async()=>{
  await openMobile();const price=node.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input')[3];await input(price,'25');await click(button('Done'));
  expect(row().normUnitPrice).toBe(25);expect(useAppStore.getState().undoStack).toHaveLength(1);
  const state=useAppStore.getState();await act(async()=>state.setItems(state.undo()!));expect(row().normUnitPrice).toBe(10);
 });
 it('U03: English decimal input preserves fractions on mobile',async()=>{
  await openMobile();await input(node.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input')[2],'1.234');await click(button('Done'));
  expect(row().quantity).toBe(1.234);
 });
 it('U04: mobile displays the project currency',async()=>{
  useAppStore.getState().setSchedule({currency:'USD'});await mount(<MobileWorkspace/>);
  const text=node.querySelector('.mobile-summary strong')!.textContent;expect(text).toContain('$');expect(text).not.toContain('€');
 });
 it('U05: Delete in review does not remove the previous grid row',async()=>{
  const state=useAppStore.getState();state.setActiveCell(state.getGridRows().findIndex(item=>item.id===post),1,post);state.setActiveContentTab('review');
  function Harness(){useKeyboardShortcuts();return <button>Review action</button>;}
  await mount(<Harness/>);const target=button('Review action');target.focus();
  await act(async()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true})));
  expect(useAppStore.getState().items.some(item=>item.id===post)).toBe(true);
 });
 it('U06: Ctrl+Z inside a text input preserves native text undo',async()=>{
  const state=useAppStore.getState();state.pushHistory(state.items,'Prior price edit');state.updateItem(post,'normUnitPrice',20);
  function Harness(){useKeyboardShortcuts();return <input aria-label="Draft note" defaultValue="A note"/>;}
  await mount(<Harness/>);const target=node.querySelector('input')!;target.focus();const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});
  await act(async()=>target.dispatchEvent(event));expect(row().normUnitPrice).toBe(20);expect(event.defaultPrevented).toBe(false);
 });
 it('U07: mobile hides inactive variants consistently with the grid',async()=>{
  const state=useAppStore.getState(), alternative=state.addItem(chapter);state.updateItem(alternative,'description','Inactive alternative');state.updateItem(alternative,'branchId','alt');
  state.setSchedule({branchesEnabled:true,activeBranchId:'main',branches:[{id:'main',parentId:null,name:'Main'},{id:'alt',parentId:'main',name:'Alternative'}]});
  expect(useAppStore.getState().getGridRows().some(item=>item.id===alternative)).toBe(false);await mount(<MobileWorkspace/>);
  expect(node.querySelector('.mobile-item-list')).not.toHaveTextContent('Inactive alternative');
 });
 it('U08: hidden invalid wizard fields have a visible recovery route',async()=>{
  const state=useAppStore.getState(), other=state.addChapter(null), otherPost=state.addItem(other);state.updateItem(otherPost,'description','Other post');
  await mount(<CalculationWizard/>);await click(button(i18next.t('wizardUI.steps.quantities'),node.querySelector('.calc-wizard-steps')!));
  const field=node.querySelector<HTMLInputElement>('.calc-wizard-row input[inputmode="decimal"]')!;await input(field,'oops');expect(field).toHaveAttribute('aria-invalid','true');
  const select=node.querySelector<HTMLSelectElement>('.calc-wizard-tools select')!;await act(async()=>{select.value=other;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(node.querySelector('[aria-invalid="true"]')).toBeNull();expect(button(i18next.t('wizardUI.next'))).toBeDisabled();expect(button(i18next.t('wizardUI.editor'))).not.toBeDisabled();
  expect(node.querySelector('[role=alert]')).toHaveTextContent(i18next.t('wizardUI.invalidSummary',{count:1}));
  await click(button(i18next.t('wizardUI.findInvalid')));expect(node.querySelector('[aria-invalid=true]')).toHaveValue('oops');
  await click(button(i18next.t('wizardUI.discardInvalid')));expect(button(i18next.t('wizardUI.next'))).not.toBeDisabled();expect(row().quantity).toBe(2);
 });
 it('U09: wizard and review agree that explicit zero prices are valid',async()=>{
  useAppStore.getState().updateItem(post,'normUnitPrice',0);await mount(<><ReviewCenter/><CalculationWizard/></>);
  expect(node.querySelector('.review-empty')).toHaveTextContent(i18next.t('review.empty'));
  await click(button(i18next.t('wizardUI.steps.review'),node.querySelector('.calc-wizard-steps')!));
  expect(node.querySelector('.calc-wizard-body')).not.toHaveTextContent(i18next.t('wizardUI.missingPrices'));
 });
 it('U10: mobile requires explicit unlink before changing an authoritative quantity',async()=>{
  const state=useAppStore.getState(), sheet=state.addSubSheet('Source');state.setSubSheetCell(sheet,'A1','2');state.updateItem(post,'quantityLink',{source:'spreadsheet',sheetId:sheet,cellRef:'A1'});
  function Harness(){useQuantityLinkSync();return <MobileWorkspace/>;}
  await mount(<Harness/>);await click([...node.querySelectorAll<HTMLButtonElement>('.mobile-item-body')].find(button=>button.textContent?.includes('Audit post'))!);
  expect(node.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input')[2]).toHaveAttribute('readonly');
  await click(button(i18next.t('mobile.unlinkQuantity')));
  expect(node.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input')[2]).not.toHaveAttribute('readonly');
  await input(node.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input')[2],'9');await click(button('Done'));expect(row().quantity).toBe(9);expect(row().quantityLink).toBeNull();
  await act(async()=>state.setSubSheetCell(sheet,'B1','8'));expect(row().quantity).toBe(9);
  expect(useAppStore.getState().undoStack).toHaveLength(1);
  await act(async()=>state.setItems(state.undo()!));expect(row().quantity).toBe(2);expect(row().quantityLink?.source).toBe('spreadsheet');
 });
 it('U11: generic dialogs have an accessible name and move focus inside',async()=>{
  await mount(<><button id="audit-behind">Background</button><Modal open={true} onClose={()=>{}} title="Settings"><input aria-label="Setting"/></Modal></>);
  const modal=document.querySelector('.modal-dialog')!;expect(modal).toBeTruthy();expect(modal).toHaveAttribute('role','dialog');expect(modal).toHaveAttribute('aria-modal','true');expect(document.getElementById(modal.getAttribute('aria-labelledby')!)).toHaveTextContent('Settings');
  expect(modal.contains(document.activeElement)).toBe(true);
 });
});

describe('additional editing and dialog safeguards', () => {
 it('keeps grid Delete available and undoable inside the actual grid', async () => {
  const state=useAppStore.getState();state.setActiveCell(state.getGridRows().findIndex(item=>item.id===post),1,post);
  function Harness(){useKeyboardShortcuts();return <div className="cost-grid-wrapper" tabIndex={0}>Grid</div>;}
  await mount(<Harness/>);const target=node.querySelector('div')!;target.focus();
  await act(async()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true})));
  expect(useAppStore.getState().items.some(item=>item.id===post)).toBe(false);
  expect(useAppStore.getState().undoStack).toHaveLength(1);
  await act(async()=>state.setItems(state.undo()!));expect(row().normUnitPrice).toBe(10);
 });
 it('does not intercept contenteditable undo or delete keys in dialogs', async () => {
  const state=useAppStore.getState();state.pushHistory(state.items,'Price');state.updateItem(post,'normUnitPrice',20);
  function Harness(){useKeyboardShortcuts();return <div className="cost-grid-wrapper"><div contentEditable suppressContentEditableWarning>Draft</div></div>;}
  await mount(<Harness/>);const target=node.querySelector('[contenteditable]')!;
  const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});await act(async()=>target.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);expect(row().normUnitPrice).toBe(20);
 });
 it('retains fractional draft digits and groups a focused wizard edit into one undo step', async () => {
  await mount(<CalculationWizard/>);await click(button(i18next.t('wizardUI.steps.quantities'),node.querySelector('.calc-wizard-steps')!));
  const field=node.querySelector<HTMLInputElement>('.calc-wizard-row input[inputmode="decimal"]')!;
  await act(async()=>field.focus());
  for(const value of ['1','1.','1.0','1.05']){await input(field,value);expect(field).toHaveValue(value);}
  expect(row().quantity).toBe(1.05);expect(useAppStore.getState().undoStack).toHaveLength(1);
  await act(async()=>field.blur());
  const state=useAppStore.getState();await act(async()=>state.setItems(state.undo()!));expect(row().quantity).toBe(2);
 });
 it('cancels an unlink draft without changing the estimate or history', async () => {
  const state=useAppStore.getState();const sheet=state.addSubSheet('Source');state.setSubSheetCell(sheet,'A1','2');state.updateItem(post,'quantityLink',{source:'spreadsheet',sheetId:sheet,cellRef:'A1'});
  await openMobile();await click(button(i18next.t('mobile.unlinkQuantity')));await click(node.querySelector('.mobile-edit-head button')!);
  expect(row().quantityLink?.source).toBe('spreadsheet');expect(state.canUndo()).toBe(false);
 });
 it('traps Tab in the top dialog, closes only that dialog and restores its opener', async () => {
  let closeInner!:()=>void;
  const outerClose=vi.fn();
  function Harness(){const [inner,setInner]=React.useState(false);closeInner=()=>setInner(false);return <Modal open onClose={outerClose} title="Outer"><button id="inner-opener" onClick={()=>setInner(true)}>Open inner</button><Modal open={inner} onClose={closeInner} title="Inner"><input aria-label="Inner field"/><button id="last-dialog-button">Last</button></Modal></Modal>;}
  await mount(<Harness/>);document.getElementById('inner-opener')!.focus();await click(document.getElementById('inner-opener')!);
  const last=document.getElementById('last-dialog-button')!;last.focus();
  const tab=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});await act(async()=>last.dispatchEvent(tab));expect(tab.defaultPrevented).toBe(true);expect(document.activeElement).toBe(document.querySelectorAll('.modal-close-btn')[1]);
  await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(outerClose).not.toHaveBeenCalled();expect(document.activeElement).toBe(document.getElementById('inner-opener'));
 });
});
