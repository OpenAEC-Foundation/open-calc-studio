import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { Branch } from '@/types/costModel';

/** Tree editor for budget variant branches (git-like) */
export const BranchTreeEditor: React.FC = () => {
  const { t } = useTranslation();
  const schedule = useAppStore(s => s.schedule);
  const addBranch = useAppStore(s => s.addBranch);
  const removeBranch = useAppStore(s => s.removeBranch);
  const renameBranch = useAppStore(s => s.renameBranch);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addingUnderId, setAddingUnderId] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  // Enter (or Escape) followed by blur may fire both handlers before the re-render;
  // this guard makes each add-session commit at most once.
  const addSessionDone = useRef(false);

  const startAdding = (parentId: string) => {
    addSessionDone.current = false;
    setAddingUnderId(parentId); setNewBranchName('');
  };
  const finishAdding = (parentId: string | null) => {
    if (addSessionDone.current) return;
    addSessionDone.current = true;
    const name = newBranchName.trim();
    if (parentId && name) addBranch(name, parentId);
    setAddingUnderId(null); setNewBranchName('');
  };

  const enabled = schedule.branchesEnabled ?? false;
  const branches = schedule.branches ?? [];

  // Build tree
  const roots = branches.filter(b => b.parentId === null);
  const childrenOf = (id: string) => branches.filter(b => b.parentId === id);

  const renderBranch = (branch: Branch, depth: number) => {
    const children = childrenOf(branch.id);
    const isEditing = editingId === branch.id;
    const isMain = branch.id === 'main';

    return (
      <div key={branch.id}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0', paddingLeft: depth * 16,
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--theme-text-muted)' }}>├─</span>
          {isEditing ? (
            <>
              <input
                className="prop-input"
                style={{ flex: 1, fontSize: 12, height: 22 }}
                value={editName}
                autoFocus
                onChange={e => setEditName(e.target.value)}
                onBlur={() => {
                  if (editName.trim()) renameBranch(branch.id, editName.trim());
                  setEditingId(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (editName.trim()) renameBranch(branch.id, editName.trim());
                    setEditingId(null);
                  } else if (e.key === 'Escape') {
                    setEditingId(null);
                  }
                }}
              />
            </>
          ) : (
            <>
              <span
                style={{
                  flex: 1,
                  fontWeight: isMain ? 600 : 400,
                  color: 'var(--theme-text)',
                  cursor: isMain ? 'default' : 'pointer',
                }}
                onDoubleClick={() => {
                  if (!isMain) { setEditingId(branch.id); setEditName(branch.name); }
                }}
              >
                {branch.name}
              </span>
              <button
                title={t('branches.addSub')}
                style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
                onClick={() => startAdding(branch.id)}
              >+</button>
              {!isMain && (
                <button
                  title={t('branches.delete')}
                  style={{ fontSize: 11, padding: '2px 6px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--theme-danger)' }}
                  onClick={() => {
                    if (confirm(t('branches.confirmDelete', { name: branch.name }))) removeBranch(branch.id);
                  }}
                >✕</button>
              )}
            </>
          )}
        </div>
        {children.map(c => renderBranch(c, depth + 1))}
        {addingUnderId === branch.id && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', paddingLeft: (depth + 1) * 16, fontSize: 12 }}>
            <span style={{ color: 'var(--theme-text-muted)' }}>└─</span>
            <input
              className="prop-input"
              style={{ flex: 1, fontSize: 12, height: 22 }}
              autoFocus
              value={newBranchName}
              placeholder={t('branches.namePlaceholder')}
              onChange={e => setNewBranchName(e.target.value)}
              onBlur={() => finishAdding(branch.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') finishAdding(branch.id);
                else if (e.key === 'Escape') finishAdding(null);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 12 }}>
      {!enabled && (
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
          {t('branches.enableHint')} <b>{t('branches.enableHintPath')}</b>.
        </div>
      )}

      {enabled && (
        <>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 8 }}>
            {t('branches.explain')}
          </div>
          <div style={{ border: '1px solid var(--theme-border)', borderRadius: 4, padding: 8, background: 'var(--theme-surface)' }}>
            {roots.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', padding: '8px 0' }}>
                {t('branches.empty')}
              </div>
            ) : (
              roots.map(r => renderBranch(r, 0))
            )}
            {roots.length === 0 && (
              <button
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--theme-border)', background: 'var(--theme-bg)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
                onClick={() => addBranch('main', null, 'main')}
              >{t('branches.createMain')}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
