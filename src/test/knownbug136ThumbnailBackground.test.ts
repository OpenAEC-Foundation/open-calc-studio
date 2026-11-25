import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThumbnail } from '@/services/offerte/imageService';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('miniaturen (knownbug 136)', () => {
  it('vult het canvas wit vóór het tekenen: transparante PNG wordt geen zwarte JPEG', async () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '',
      fillRect: vi.fn(() => calls.push(`fillRect ${ctx.fillStyle}`)),
      drawImage: vi.fn(() => calls.push('drawImage')),
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return realCreate(tag);
      const canvas = realCreate('canvas') as HTMLCanvasElement;
      canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
      canvas.toDataURL = () => 'data:image/jpeg;base64,AAAA';
      return canvas;
    }) as typeof document.createElement);
    // jsdom laadt geen afbeeldingen: een Image die direct "geladen" is.
    vi.stubGlobal('Image', class {
      width = 400; height = 200; onload: (() => void) | null = null; onerror: unknown = null;
      set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
    });

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
    expect(await createThumbnail(file)).toBe('data:image/jpeg;base64,AAAA');
    expect(calls).toEqual(['fillRect #ffffff', 'drawImage']);
  });
});
