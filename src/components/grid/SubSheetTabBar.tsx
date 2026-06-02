import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import './SubSheetEditor.css';

export function SubSheetTabBar() {
  const { t } = useTranslation();
  const subSheets = useAppStore((s) => s.subSheets);
  const activeSubSheetId = useAppStore((s) => s.activeSubSheetId);
  const activeContentTab = useAppStore((s) => s.activeContentTab);
  const setActiveContentTab = useAppStore((s) => s.setActiveContentTab);
  const setActiveSubSheet = useAppStore((s) => s.setActiveSubSheet);
  const addSubSheet = useAppStore((s) => s.addSubSheet);
  const renameSubSheet = useAppStore((s) => s.renameSubSheet);
  const removeSubSheet = useAppStore((s) => s.removeSubSheet);

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const budgetActive = activeContentTab === 'grid';

  const handleAdd = () => {
    const id = addSubSheet();
    setActiveContentTab('spreadsheet');
    setActiveSubSheet(id);
  };

  const handleSheetClick = (id: string) => {
    setActiveSubSheet(id);
    setActiveContentTab('spreadsheet');
  };

  const handleRename = (id: string) => {
    const sheet = subSheets.find((ss) => ss.id === id);
    const name = window.prompt('Hernoem blad:', sheet?.name ?? '');
    if (name && name.trim()) renameSubSheet(id, name.trim());
    setMenu(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Dit blad verwijderen?')) removeSubSheet(id);
    setMenu(null);
  };

  return (
    <div className="subsheet-tab-bar">
      {/* Begroting tab - always first */}
      <button
        className={`subsheet-tab subsheet-tab-main${budgetActive ? ' active' : ''}`}
        onClick={() => setActiveContentTab('grid')}
      >
        {t('budget')}
      </button>

      {/* One tab per sub-sheet */}
      {subSheets.map((ss) => {
        const isActive = activeContentTab === 'spreadsheet' && activeSubSheetId === ss.id;
        return (
          <button
            key={ss.id}
            className={`subsheet-tab${isActive ? ' active' : ''}`}
            onClick={() => handleSheetClick(ss.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: ss.id, x: e.clientX, y: e.clientY });
            }}
          >
            <span>{ss.name}</span>
          </button>
        );
      })}

      {/* + button */}
      <button
        className="subsheet-tab-add"
        onClick={handleAdd}
        title={t('addNewSubsheet')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </button>

      {menu && (
        <div
          className="subsheet-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => handleRename(menu.id)}>Hernoemen</button>
          <button onClick={() => handleDelete(menu.id)}>Verwijderen</button>
        </div>
      )}
    </div>
  );
}
