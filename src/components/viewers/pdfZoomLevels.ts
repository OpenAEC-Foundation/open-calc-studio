/** Fixed zoom steps for the PDF workspace − / + buttons (fit-to-width itself stays exact). */
export const PDF_ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

/** A zoom within this distance of a level counts as that level, so 0.999 is "at 100 %", not between 90 and 100. */
const TOLERANCE = 0.005;

/**
 * The next nice zoom level above (direction 1) or below (direction -1) `current`.
 * From an arbitrary zoom such as a fitted 1.16 this is the nearest level in that direction (1.25 / 1.1);
 * from a level it is one step. Returns null when there is no level further in that direction.
 */
export function nextZoomLevel(current: number, direction: 1 | -1): number | null {
  if (direction > 0) return PDF_ZOOM_LEVELS.find(level => level > current + TOLERANCE) ?? null;
  for (let i = PDF_ZOOM_LEVELS.length - 1; i >= 0; i--) if (PDF_ZOOM_LEVELS[i] < current - TOLERANCE) return PDF_ZOOM_LEVELS[i];
  return null;
}
