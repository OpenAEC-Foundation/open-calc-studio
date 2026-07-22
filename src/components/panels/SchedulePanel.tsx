import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import './panels.css';

export const SchedulePanel: React.FC = () => {
  const { t } = useTranslation();
  // Gerenderde rijenlijst: hoofdstuk-klik moet naar de grid-rij-index springen.
  const { items, schedule, activeRow, setActiveCell, toggleCollapse, getGridRows } = useAppStore();
  const visibleItems = getGridRows();
  const chapters = items.filter((i) => i.rowType === 'chapter');

  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--theme-text)', padding: '4px 8px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {schedule.name}
      </div>
      {chapters.map((chapter) => {
        const visIdx = visibleItems.findIndex((v) => v.id === chapter.id);
        return (
          <div
            key={chapter.id}
            className={`schedule-item${visIdx === activeRow ? ' active' : ''}`}
            style={{ paddingLeft: chapter.depth * 12 + 8 }}
            onClick={() => visIdx >= 0 && setActiveCell(visIdx, 1, chapter.id)}
          >
            <button
              className="grid-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(chapter.id);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {chapter.isCollapsed
                  ? <polyline points="3,2 7,5 3,8" />
                  : <polyline points="2,3 5,7 8,3" />
                }
              </svg>
            </button>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--theme-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chapter.code || chapter.description || t('chapter')}
            </span>
          </div>
        );
      })}
    </div>
  );
};
