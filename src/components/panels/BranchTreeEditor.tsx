import React, { useState } from 'react';
import { useAppStore } from '@/state/appStore';
import type { Branch } from '@/types/costModel';

/** Tree editor for budget variant branches (git-like) */
export const BranchTreeEditor: React.FC = () => {
  const schedule = useAppStore(s => s.schedule);
  const addBranch = useAppStore(s => s.addBranch);
  const removeBranch = useAppStore(s => s.removeBranch);
  const renameBranch = useAppStore(s => s.renameBranch);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addingUnderId, setAddingUnderId] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');

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
                title="Sub-branch toevoegen"
                style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
                onClick={() => { setAddingUnderId(branch.id); setNewBranchName(''); }}
              >+</button>
              {!isMain && (
                <button
                  title="Verwijder"
                  style={{ fontSize: 11, padding: '2px 6px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--theme-danger)' }}
                  onClick={() => {
                    if (confirm(`Variant '${branch.name}' verwijderen? (incl. sub-varianten)`)) removeBranch(branch.id);
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
              placeholder="Naam sub-variant..."
              onChange={e => setNewBranchName(e.target.value)}
              onBlur={() => {
                if (newBranchName.trim()) addBranch(newBranchName.trim(), branch.id);
                setAddingUnderId(null); setNewBranchName('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (newBranchName.trim()) addBranch(newBranchName.trim(), branch.id);
                  setAddingUnderId(null); setNewBranchName('');
                } else if (e.key === 'Escape') {
                  setAddingUnderId(null); setNewBranchName('');
                }
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
          Schakel begrotingsvarianten in via het lint: <b>Begroting → Varianten</b>.
        </div>
      )}

      {enabled && (
        <>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 8 }}>
            Maak varianten zoals een git-tree. Elke regel in de begroting kan aan een variant toegewezen worden. Dubbelklik op een naam om te hernoemen.
          </div>
          <div style={{ border: '1px solid var(--theme-border)', borderRadius: 4, padding: 8, background: 'var(--theme-surface)' }}>
            {roots.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', padding: '8px 0' }}>
                Nog geen varianten. Klik hieronder om 'main' aan te maken.
              </div>
            ) : (
              roots.map(r => renderBranch(r, 0))
            )}
            {roots.length === 0 && (
              <button
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid var(--theme-border)', background: 'var(--theme-bg)', borderRadius: 3, cursor: 'pointer', color: 'var(--theme-text)' }}
                onClick={() => addBranch('main', null)}
              >+ main branch aanmaken</button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
