import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { PROPERTIES_AUTO_OPEN_MIN_WIDTH, initialPropertiesPanel } from '@/state/slices/uiSlice';

const setWidth = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

describe('Eigenschappen-paneel', () => {
  beforeEach(() => localStorage.removeItem('ocs-properties-open'));

  it('start zonder eerdere keuze dicht in een smal venster en open in een breed venster', () => {
    setWidth(PROPERTIES_AUTO_OPEN_MIN_WIDTH - 1);
    expect(initialPropertiesPanel()).toBe(false);
    setWidth(PROPERTIES_AUTO_OPEN_MIN_WIDTH);
    expect(initialPropertiesPanel()).toBe(true);
  });

  it('onthoudt open of dicht, ook als een werkplek het verandert', () => {
    setWidth(1920);
    useAppStore.setState({ showPropertiesPanel: true });
    useAppStore.setState({ showPropertiesPanel: false });
    expect(localStorage.getItem('ocs-properties-open')).toBe('0');
    expect(initialPropertiesPanel()).toBe(false);
    useAppStore.getState().applyWorkspaceLayout('estimate');
    expect(localStorage.getItem('ocs-properties-open')).toBe('1');
    setWidth(800);
    expect(initialPropertiesPanel()).toBe(true);
  });

  it('telt het scherm mee: het venster is bij het opstarten breder dan een kleine laptop', () => {
    setWidth(1400);
    Object.defineProperty(window.screen, 'availWidth', { configurable: true, value: 1280 });
    expect(initialPropertiesPanel()).toBe(false);
    Object.defineProperty(window.screen, 'availWidth', { configurable: true, value: 0 });
    expect(initialPropertiesPanel()).toBe(true);
  });
});
