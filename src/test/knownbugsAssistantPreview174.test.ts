import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';

// Knownbug 174: assistant.preview met actions: [null] gaf een kale TypeError.
const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'preview-doc', items: createDefaultItems() });
});

describe('assistant.preview input (knownbug 174)', () => {
  it.each([[null], [42], ['add_regel'], [[]]])('rejects action %j with a clear message', async (action) => {
    const attempt = executeDesktopCommand('assistant.preview', { actions: [action] });
    await expect(attempt).rejects.toThrow('Action 1: invalid action.');
  });
});
