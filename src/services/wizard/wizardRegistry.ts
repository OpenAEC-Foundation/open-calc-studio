import type { CostItem } from '@/types/costModel';

/** Parameter definition for a wizard */
export interface WizardParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text';
  unit?: string;
  defaultValue: number | string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

/** Result of a wizard calculation */
export interface WizardResult {
  chapterName: string;
  items: CostItem[];
}

/** A wizard definition */
export interface WizardDefinition {
  id: string;
  label: string;
  icon: string;       // emoji or SVG
  description: string;
  params: WizardParamDef[];
  calculate: (params: Record<string, number | string>) => WizardResult;
}

/** Global wizard registry */
const registry = new Map<string, WizardDefinition>();

export function registerWizard(def: WizardDefinition): void {
  registry.set(def.id, def);
}

export function getAllWizards(): WizardDefinition[] {
  return Array.from(registry.values());
}
