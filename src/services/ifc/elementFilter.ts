import type { TakeoffElement } from './ifcTakeoff';
export function filterIfcElements(elements: TakeoffElement[], search: string): TakeoffElement[] {
  const query = search.trim().toLocaleLowerCase();
  return query ? elements.filter(element => `${element.type} ${element.name}`.toLocaleLowerCase().includes(query)) : elements;
}
