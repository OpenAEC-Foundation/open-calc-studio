import type { ContentTab, GridView } from '@/state/slices/uiSlice';

export interface WorkspaceLayout {
  id: string;
  name: string;
  activeContentTab: ContentTab;
  showSchedulePanel: boolean;
  showPropertiesPanel: boolean;
  showChatPanel: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  ifcSplitPercent: number;
  gridView: GridView;
  gridZoom: number;
  pdfZoom: number;
  hiddenColumns: Record<string, boolean>;
}
