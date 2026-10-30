import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TakeoffModel } from '@/services/ifc/ifcTakeoff';
import { filterIfcElements } from '@/services/ifc/elementFilter';

const PAGE_SIZE = 100;
export function IfcElementBrowser({ model, selected, run }: {
  model: TakeoffModel; selected: number[]; run: (action: string, params: Record<string, unknown>) => unknown;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterIfcElements(model.elements, search), [model.elements, search]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1), start = currentPage * PAGE_SIZE;
  return <div className="ifc-elements">
    <input aria-label={t('ifc.search')} placeholder={t('ifc.searchHint')} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
    <span>{model.fileName} · {t('ifc.selected', { count: selected.length })}</span>
    <div className="ifc-element-tools">
      <button disabled={!filtered.length} onClick={() => run('selectFiltered', { search })}>{t('ifc.selectFiltered', { count: filtered.length })}</button>
      <button disabled={!selected.length} onClick={() => run('select', { elementIds: [] })}>{t('ifc.clearSelection')}</button>
    </div>
    <p role="status">{t('ifc.shown', { from: filtered.length ? start + 1 : 0, to: Math.min(start + PAGE_SIZE, filtered.length), count: filtered.length, total: model.elements.length })}</p>
    <div className="ifc-element-list">{filtered.slice(start, start + PAGE_SIZE).map(element => <label key={element.id}>
      <input type="checkbox" checked={selectedSet.has(element.expressId)} onChange={() => run('select', { elementIds: selectedSet.has(element.expressId) ? selected.filter(id => id !== element.expressId) : [...selected, element.expressId] })} />{element.type} · {element.name}
    </label>)}</div>
    <div className="ifc-element-pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('ifc.previousPage')}</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{t('ifc.nextPage')}</button></div>
  </div>;
}
