import { mountIsolated } from '@openaec/open-calc-studio/isolated';
import { importBudget } from '@openaec/open-calc-studio/importers';
import { recalculateItems } from '@openaec/open-calc-studio/core';
const left = mountIsolated(document.getElementById('left')!, {
  src: '/calc-studio/index.html', sample: true, lang: 'nl', theme: 'dark',
});
const right = mountIsolated(document.getElementById('right')!, {
  src: '/calc-studio/index.html', sample: true, lang: 'en', theme: 'light',
});
document.getElementById('edit-a')!.onclick = async () => {
  const project = JSON.parse(await left.getProjectJson());
  const item = project.items.find((i: { rowType: string }) => i.rowType === 'regel');
  if (item) item.quantity = (item.quantity ?? 0) + 1;
  await left.update({ project });
};
// Exposed for the example's browser integration tests and interactive inspection.
(window as any).studios = { left, right, importBudget, recalculateItems };
Promise.all([left.ready, right.ready]).then(() => { (window as any).studiosReady = true; });
