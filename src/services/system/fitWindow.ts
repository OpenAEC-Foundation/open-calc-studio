/**
 * Laat een venster op het scherm passen.
 *
 * Vensters openen op 1400 × 900 (tauri.conf.json en de knoppen voor een
 * nieuw venster). Op een kleiner scherm, zoals een laptop met 150% schaal,
 * valt de onderkant dan buiten beeld. Past het venster niet in het
 * werkgebied van het scherm (zonder taakbalk), dan verkleinen we het eerst
 * tot 90% van dat werkgebied, zodat "verkleinen" later ook een passend
 * venster geeft, en maximaliseren we het daarna. Op een groot scherm blijft
 * het venster zoals het is.
 */

import { isTauriEnvironment } from '../file/nativeFileService';

interface Size { width: number; height: number }
interface Rect { position: { x: number; y: number }; size: Size }

export function doesNotFit(size: Size, workArea: Size): boolean {
  return size.width > workArea.width || size.height > workArea.height;
}

/** 90% van het werkgebied, in het midden ervan. */
export function fittedRect(workArea: Rect): Rect {
  const width = Math.round(workArea.size.width * 0.9), height = Math.round(workArea.size.height * 0.9);
  return {
    position: {
      x: workArea.position.x + Math.round((workArea.size.width - width) / 2),
      y: workArea.position.y + Math.round((workArea.size.height - height) / 2),
    },
    size: { width, height },
  };
}

let fitted: Promise<void> = Promise.resolve();

/** Wacht tot het venster op zijn plek staat (de titelbalk leest daarna of hij gemaximaliseerd is). */
export function whenWindowFitted(): Promise<void> {
  return fitted;
}

export function fitWindowToScreen(): Promise<void> {
  fitted = fit();
  return fitted;
}

async function fit(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow, currentMonitor, PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    // Beide in fysieke pixels, dus de schaal van Windows (125%, 150%) telt mee.
    const [monitor, size, maximized] = await Promise.all([currentMonitor(), win.outerSize(), win.isMaximized()]);
    if (!monitor || maximized || !doesNotFit(size, monitor.workArea.size)) return;
    const rect = fittedRect(monitor.workArea);
    await win.setSize(new PhysicalSize(rect.size.width, rect.size.height));
    // Het tweede-schermvenster hoort naast het hoofdvenster: alleen verkleinen, niet verplaatsen of maximaliseren.
    if (new URLSearchParams(window.location.search).has('companion')) return;
    await win.setPosition(new PhysicalPosition(rect.position.x, rect.position.y));
    await win.maximize();
  } catch {
    // Lukt het niet, dan blijft het venster gewoon zoals het opende.
  }
}
