import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('edit a budget, undo, redo, save and reopen it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const cell = page.locator('.grid-row.regel .col-description').first();
  await expect(cell).toBeVisible();
  const original = await cell.innerText();
  await cell.dblclick();
  await page.locator('input.grid-cell-editor').fill('Browser regression estimate');
  await page.keyboard.press('Enter');
  await expect(cell).toHaveText('Browser regression estimate');
  await page.keyboard.press('Control+z');
  await expect(cell).toHaveText(original);
  await page.keyboard.press('Control+y');
  await expect(cell).toHaveText('Browser regression estimate');
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const download = await downloading;
  const file = (await download.path())!;
  const project = JSON.parse(readFileSync(file, 'utf8'));
  expect(project.items.some((item: { description: string }) => item.description === 'Browser regression estimate')).toBe(true);
  const choosing = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await choosing).setFiles({ name: 'saved.ifcCalc', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(page.locator('.file-tab').filter({ hasText: 'saved' })).toBeVisible();
  await expect(cell).toHaveText('Browser regression estimate');
  expect(errors).toEqual([]);
});

test('navigate the estimate workspaces without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.cost-grid')).toBeVisible();
  const tabs = page.locator('.subsheet-tab-bar');
  for (const name of ['Hours & Tail', 'Report', 'Prompt & Begroot', 'PDF & metingen', 'Spreadsheet', 'IFC', 'Data']) {
    await tabs.getByRole('button', { name, exact: true }).click();
    await expect(tabs.getByRole('button', { name: name === 'Spreadsheet' ? /Sheet|Blad/ : name, exact: true })).toHaveClass(/active/);
  }
  await expect(page.locator('.cost-grid')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile sheets keep their values isolated and recover after refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.locator('.mobile-nav button').nth(1).click();
  const add = page.locator('.mobile-section-head button');
  await add.click();
  const value = page.locator('.mobile-cell-form input').nth(1);
  await value.fill('123');
  await page.locator('.mobile-cell-form button').click();
  await add.click();
  await expect(value).toHaveValue('');
  await value.fill('456');
  await page.locator('.mobile-cell-form button').click();
  await page.getByRole('tab').nth(0).click();
  await expect(value).toHaveValue('123');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ocs-mobile-draft-v1') ?? '{}').project)).toBeTruthy();
  await page.reload();
  await page.locator('.mobile-nav button').nth(1).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('tab').nth(1).click();
  await expect(value).toHaveValue('456');
  expect(errors).toEqual([]);
});
