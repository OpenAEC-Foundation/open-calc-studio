import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
test('isolated budgets and real browser importers', async ({ page }) => {
  const errors: string[] = []; const requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  await page.goto('/isolated.html');
  await page.waitForFunction(() => (window as any).studiosReady);
  const before = await page.evaluate(async () => {
    const { left, right } = (window as any).studios;
    return [JSON.parse(await left.getProjectJson()), await right.getProjectJson()];
  });
  const row = before[0].items.find((i: any) => i.rowType === 'regel');
  await page.click('#edit-a');
  await expect.poll(async () => page.evaluate(async (id) => JSON.parse(await (window as any).studios.left.getProjectJson()).items.find((i: any) => i.id === id).quantity, row.id)).toBe(row.quantity + 1);
  const after = JSON.parse(await page.evaluate(() => (window as any).studios.right.getProjectJson()));
  expect(after.items).toEqual(JSON.parse(before[1]).items);
  const frames = page.frames().filter(f => f.url().includes('/calc-studio/'));
  await expect(frames[0].locator('.ocs-embed').first()).toHaveAttribute('lang', 'nl');
  await expect(frames[1].locator('.ocs-embed').first()).toHaveAttribute('lang', 'en');
  await expect(frames[0].locator('.ocs-embed').first()).toHaveAttribute('data-theme', 'dark');
  await expect(frames[1].locator('.ocs-embed').first()).toHaveAttribute('data-theme', 'light');
  expect(requests.filter(url => /PdfViewer-|ThreeDViewer-/.test(url))).toEqual([]);
  const fixtureDir = path.resolve('test/fixtures/import-formats');
  const manifest = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));
  for (const entry of manifest) {
    const bytes = [...readFileSync(path.join(fixtureDir, entry.file))];
    const result = await page.evaluate(async ({ bytes, name }) => {
      const { importBudget, recalculateItems } = (window as any).studios;
      const parsed = await importBudget(new Uint8Array(bytes).buffer, name);
      const total = recalculateItems(parsed.items).filter((i: any) => i.rowType === 'chapter').reduce((s: number, i: any) => s + i.total, 0);
      return { total, count: parsed.items.length };
    }, { bytes, name: entry.file });
    expect(result.count, entry.file).toBeGreaterThan(0);
    expect(Math.abs(result.total - entry.total) / entry.total, entry.file).toBeLessThan(0.01);
  }
  const emptyMdb = [...readFileSync('test/fixtures/mdb-reader/empty.mdb')];
  const mdb = await page.evaluate(async bytes => {
    const { importBudget } = (window as any).studios;
    const result = await importBudget(new Uint8Array(bytes).buffer, 'empty.mdb');
    return { format: result.format, items: result.items.filter((i: any) => !i.rowType.startsWith('staart_')).length };
  }, emptyMdb);
  expect(mdb).toEqual({ format: 'wpcalc', items: 0 });
  const dnc = [...readFileSync(path.join(fixtureDir, '04-dnc-stabu.dnc'))];
  await page.evaluate(async bytes => {
    const { left } = (window as any).studios;
    await left.importBudget(new Uint8Array(bytes).buffer, 'example.dnc');
    left.unmount();
  }, dnc);
  await expect(page.locator('#left iframe')).toHaveCount(0);
  await expect(page.locator('#right iframe')).toHaveCount(1);
  expect(errors).toEqual([]);
});
