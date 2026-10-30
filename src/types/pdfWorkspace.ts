export interface PdfPoint { x: number; y: number }
export interface SavedPdfMeasurement {
  id: string;
  label: string;
  type: 'length' | 'area';
  page: number;
  value: number;
  points: PdfPoint[]; // PDF.js viewport at scale 1, never screen pixels
  mmPerPoint: number | null;
  origin: 'open-calc-studio' | 'open-pdf-studio';
  annotationId?: string;
  originalAnnotation?: unknown;
  sourceVerified?: boolean;
}
export interface PdfSource {
  id: string;
  fileName: string;
  dataBase64: string;
  pageScales: Record<string, number>;
  measurements: SavedPdfMeasurement[];
  revision?: { label: string; previousSourceId?: string; importedAt: string };
}
export interface PdfWorkspace {
  version: 1;
  activeSourceId: string | null;
  sources: PdfSource[];
}
