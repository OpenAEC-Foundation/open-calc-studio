import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { builtinWorkspaceLayouts } from '@/state/slices/workspaceSlice';
import type { WorkspaceLayout } from '@/types/workspaceLayout';
import { openCompanionWindow } from '@/services/workspaces/companion';
import { isEmbedded } from '@/lib/hostRoot';
import { uiText } from '@/i18n/uiText';

const EMPTY_LAYOUTS: WorkspaceLayout[] = [];

export function WorkspaceLayoutBar() {
  useTranslation();
  const saved = useAppStore(s => s.settings.workspaceLayouts ?? EMPTY_LAYOUTS);
  const active = useAppStore(s => s.activeWorkspaceLayoutId);
  const apply = useAppStore(s => s.applyWorkspaceLayout);
  const save = useAppStore(s => s.saveWorkspaceLayout);
  const remove = useAppStore(s => s.deleteWorkspaceLayout);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const custom = saved.find(layout => layout.id === active);
  function saveLayout(overwrite: boolean) {
    try { save(overwrite && custom ? custom.name : name, overwrite ? custom?.id : undefined); setName(''); setMessage(uiText('layouts.saved', 'Workspace saved.')); }
    catch (error) { setMessage(String((error as Error).message)); }
  }
  return <div className="workspace-layout-bar" aria-label={uiText('layouts.title', 'Workspaces')}>
    <span className="oa-mono-label">{uiText('layouts.title', 'Workspaces')}</span>
    <div className="workspace-layout-presets">
      {builtinWorkspaceLayouts().map(layout => <button type="button" className="oa-button oa-button--quiet oa-button--compact" aria-pressed={active === layout.id} key={layout.id} onClick={() => { apply(layout.id); setMessage(''); }}>{layout.name}</button>)}
    </div>
    <select className="oa-field" aria-label={uiText('layouts.savedList', 'Saved workspaces')} value={custom?.id ?? ''} onChange={event => { if (event.target.value) { apply(event.target.value); setMessage(''); } }}>
      <option value="">{uiText('layouts.savedList', 'Saved workspaces')}</option>
      {saved.map(layout => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
    </select>
    {!isEmbedded() && <button type="button" className="oa-button oa-button--quiet oa-button--compact" onClick={() => { void openCompanionWindow().catch(error => setMessage((error as Error).message)); }}>{uiText('companion.open', 'Second screen')}</button>}
    {message && <span className="workspace-layout-message" role="status">{message}</span>}
    <details className="workspace-layout-editor">
      <summary className="oa-button oa-button--quiet oa-button--compact">{uiText('layouts.manage', 'Save / manage')}</summary>
      <div className="workspace-layout-popover">
        <p>{uiText('layouts.includes', 'Save the current view, panel widths, zoom and visible columns.')}</p>
        <label className="oa-label">{uiText('layouts.name', 'Workspace name')}<input className="oa-field" maxLength={80} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && name.trim()) { event.preventDefault(); saveLayout(false); } }} /></label>
        <button className="oa-button oa-button--primary" disabled={!name.trim()} onClick={() => saveLayout(false)}>{uiText('layouts.saveNew', 'Save as new workspace')}</button>
        {custom && <><button className="oa-button" onClick={() => saveLayout(true)}>{uiText('layouts.overwrite', 'Update “{{name}}”', { name: custom.name })}</button><button className="oa-button oa-button--danger" onClick={() => { remove(custom.id); setMessage(uiText('layouts.deleted', 'Workspace deleted.')); }}>{uiText('layouts.delete', 'Delete workspace')}</button></>}
        <span role="status">{message}</span>
      </div>
    </details>
  </div>;
}
