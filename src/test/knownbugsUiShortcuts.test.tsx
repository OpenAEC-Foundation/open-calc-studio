import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

let node: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

describe('knownbug 39: Ctrl+, opent de voorkeuren', () => {
  it('roept onOpenSettings aan bij Ctrl+, en Cmd+,', async () => {
    const open = vi.fn();
    function Harness() { useKeyboardShortcuts({ onOpenSettings: open }); return null; }
    await act(async () => root.render(<Harness />));
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(event);
      return event;
    };
    expect(press({ ctrlKey: true }).defaultPrevented).toBe(true);
    press({ metaKey: true });
    press({}); // zonder Ctrl niets
    expect(open).toHaveBeenCalledTimes(2);
  });
});
