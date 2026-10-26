import { test, expect } from '@playwright/test';

test('description editor stays aligned and Escape preserves the original text', async ({ page }) => {
  await page.goto('/');
  const cell = page.locator('.grid-row.regel .col-description').first();
  await expect(cell).toBeVisible();
  const original = await cell.innerText();
  const before = (await cell.boundingBox())!;
  await cell.dblclick();
  const editor = page.locator('input.grid-cell-editor');
  await expect(editor).toBeVisible();
  const editing = (await editor.boundingBox())!;
  expect(Math.abs(editing.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(editing.y - before.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(editing.width - before.width)).toBeLessThanOrEqual(2);
  await editor.fill('Discarded edit');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(cell).toHaveText(original);
});
