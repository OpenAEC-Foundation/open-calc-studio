import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { SpreadsheetReturnBar } from '@/components/grid/SubSheetTabBar';
import { useAppStore } from '@/state/appStore';

describe('spreadsheet navigation', () => {
  it('returns from an Excel sheet to the estimate and clears the active sheet', async () => {
    useAppStore.setState({ activeContentTab: 'spreadsheet', activeSubSheetId: 'sheet-1' });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<SpreadsheetReturnBar />); });
      const button = container.querySelector('button');
      expect(button).not.toBeNull();
      await act(async () => { button!.click(); });
      expect(useAppStore.getState().activeContentTab).toBe('grid');
      expect(useAppStore.getState().activeSubSheetId).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });
});
