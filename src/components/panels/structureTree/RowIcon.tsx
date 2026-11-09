import React from 'react';
import type { RowType } from '@/types/costModel';

/**
 * Structuurboom: het kleine icoon vóór elke rij.
 */

/** Klein icoon per rijtype: map, blokje (post), ruit (bewakingspost), streep (regel). */
export const RowIcon: React.FC<{ rowType: RowType }> = ({ rowType }) => {
  switch (rowType) {
    case 'chapter':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      );
    case 'begrotingspost':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <rect x="3" y="3" width="4" height="4" rx="0.5" />
        </svg>
      );
    case 'bewakingspost':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 2.2 7.8 5 5 7.8 2.2 5z" />
        </svg>
      );
    default:
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <line x1="3" y1="5" x2="7" y2="5" />
        </svg>
      );
  }
};
