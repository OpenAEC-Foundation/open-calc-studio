import i18n from '@/i18n/config';
import { askColumnMapping } from '@/components/backstage/askColumnMapping';
import type { TabularData } from '@/services/importers';
import { detectLibraryMapping, LIBRARY_COLUMN_FIELDS, type LibraryColumnField } from '@/services/pricing/ownLibraryImport';
import { recalledLibraryMapping } from '@/services/pricing/libraryColumnMappings';

export function askLibraryColumnMapping(data: TabularData) {
  const labels: Partial<Record<LibraryColumnField, string>> = {
    type: i18n.t('common:propertiesPanel.fields.resourceType'),
    category: i18n.t('common:workspace.pricing.category'),
    priceDate: i18n.t('common:workspace.pricing.date'),
    source: i18n.t('common:workspace.pricing.source'),
    currency: i18n.t('common:projectInfo.currency'),
    vatBasis: i18n.t('common:workspace.pricing.vatBasis'),
  };
  return askColumnMapping<LibraryColumnField>(data, {
    fields: LIBRARY_COLUMN_FIELDS.map(field => ({ field, label: labels[field] ?? String(i18n.t(`dialogs:columnMapping.fields.${field}`)) })),
    initialMapping: recalledLibraryMapping(data.headers) ?? detectLibraryMapping(data.headers),
    requiredFields: ['code', 'description'],
    introduction: `${i18n.t('common:workspace.pricing.library')} — ${data.sourceName}`,
    requiredHint: `${i18n.t('dialogs:columnMapping.fields.code')} + ${i18n.t('dialogs:columnMapping.fields.description')}`,
  });
}
