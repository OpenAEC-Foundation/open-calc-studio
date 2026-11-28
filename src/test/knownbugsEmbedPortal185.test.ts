import { describe, expect, it } from 'vitest';
import { getPortalTarget, markEmbedded, setHostAttribute, setHostRoot } from '@/lib/hostRoot';

// Knownbug 185: de portal-wrapper van de inbouw bleef na unmount in <body> staan.
describe('embed portal wrapper (knownbug 185)', () => {
  it('is removed from <body> when the component unmounts and comes back on the next mount', () => {
    markEmbedded();
    setHostAttribute('data-theme', 'dark');
    setHostRoot(document.createElement('div'));
    const first = getPortalTarget();
    expect(first.parentElement).toBe(document.body);

    setHostRoot(null);
    expect(first.isConnected).toBe(false);
    expect(document.body.querySelectorAll('.ocs-portal')).toHaveLength(0);

    setHostRoot(document.createElement('div'));
    const second = getPortalTarget();
    expect(second).not.toBe(first);
    expect(second.parentElement).toBe(document.body);
    expect(second.getAttribute('data-theme')).toBe('dark');
  });
});
