import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { defaultSettings } from '@/utils/settings';
import { changeLanguage } from '@/i18n/config';
import { builtinWorkspaceLayouts } from '@/state/slices/workspaceSlice';

const initial = useAppStore.getState();
beforeEach(async () => {
  await changeLanguage('en');
  useAppStore.setState({ ...initial, settings: { ...defaultSettings, workspaceLayouts: [] } }, true);
  useAppStore.getState().addDocument({ id: 'ws-doc' });
});
const names = () => (useAppStore.getState().settings.workspaceLayouts ?? []).map(l => l.name);

describe('knownbug 211: een opgeslagen werkruimte bijwerken', () => {
  it('houdt hem op dezelfde plek in de lijst', () => {
    const s = useAppStore.getState();
    const first = s.saveWorkspaceLayout('Eerste');
    s.saveWorkspaceLayout('Tweede');
    s.saveWorkspaceLayout('Derde');
    s.saveWorkspaceLayout('Eerste bijgewerkt', first);
    expect(names()).toEqual(['Eerste bijgewerkt', 'Tweede', 'Derde']);
  });
});

describe('knownbug 212: dubbele namen', () => {
  it('weigert een naam die al bestaat, ook met andere hoofdletters of spaties', () => {
    const s = useAppStore.getState();
    s.saveWorkspaceLayout('Site');
    expect(() => s.saveWorkspaceLayout(' site ')).toThrow('A workspace with this name already exists.');
    expect(names()).toEqual(['Site']);
  });

  it('weigert de naam van een ingebouwde indeling', () => {
    expect(() => useAppStore.getState().saveWorkspaceLayout('review')).toThrow(/already exists/);
  });

  it('bijwerken onder de eigen naam en met nieuwe hoofdletters mag wel', () => {
    const s = useAppStore.getState();
    const id = s.saveWorkspaceLayout('Site');
    s.saveWorkspaceLayout('Other');
    expect(() => s.saveWorkspaceLayout('SITE', id)).not.toThrow();
    expect(() => s.saveWorkspaceLayout('Other', id)).toThrow(/already exists/);
    expect(names()).toEqual(['SITE', 'Other']);
  });

  it('een werkruimte met een naam die nu bezet is, blijft onder die naam bij te werken', async () => {
    // Opgeslagen in het Nederlands als 'Review' (toen geen ingebouwde naam), daarna
    // UI in het Engels; plus een dubbele naam van vóór deze controle.
    const s = useAppStore.getState();
    s.updateSettings({ workspaceLayouts: [
      { ...builtinWorkspaceLayouts()[0], id: 'mine', name: 'Review' },
      { ...builtinWorkspaceLayouts()[0], id: 'dup1', name: 'Site' },
      { ...builtinWorkspaceLayouts()[0], id: 'dup2', name: 'site' },
    ] });
    expect(() => s.saveWorkspaceLayout('Review', 'mine')).not.toThrow();
    expect(() => s.saveWorkspaceLayout('site', 'dup2')).not.toThrow();
    expect(() => s.saveWorkspaceLayout('Site', 'dup2')).not.toThrow();
    // Hernoemen naar een bezette naam blijft geweigerd.
    expect(() => s.saveWorkspaceLayout('Measure', 'mine')).toThrow(/already exists/);
    expect(names()).toEqual(['Review', 'Site', 'Site']);
  });
});
