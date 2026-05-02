/**
 * Stores measurements and selections that can be linked to budget quantities.
 * Populated by the PDF and 3D viewers; consumed by the QuantityPicker.
 */
import type { StateCreator } from 'zustand';

export interface PdfMeasurement {
  id: string;
  label: string;         // user-friendly: "Wand N - pagina 2"
  type: 'length' | 'area';
  page: number;
  value: number;         // length in m or area in m²
}

export interface IfcQuantity {
  fragmentId: string;
  label: string;         // e.g. "IfcWall - 0x3d2..."
  volume?: number;
  area?: number;
  length?: number;
  count?: number;
}

export interface LinkableSourcesSlice {
  pdfMeasurements: PdfMeasurement[];
  ifcQuantities: IfcQuantity[];
  setPdfMeasurements: (m: PdfMeasurement[]) => void;
  setIfcQuantities: (q: IfcQuantity[]) => void;
}

export const createLinkableSourcesSlice: StateCreator<LinkableSourcesSlice> = (set) => ({
  pdfMeasurements: [],
  ifcQuantities: [],
  setPdfMeasurements: (m) => set({ pdfMeasurements: m }),
  setIfcQuantities: (q) => set({ ifcQuantities: q }),
});
