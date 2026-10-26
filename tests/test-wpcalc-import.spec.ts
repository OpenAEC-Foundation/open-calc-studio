import { test, expect } from '@playwright/test';
import path from 'node:path';

for (const fixture of ['10-xls-bascalc.xls', '06-xtb-ibis.xtb', '04-dnc-stabu.dnc', '08-rsx-raw.rsx']) {
  test(`open binary or text estimate: ${fixture}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.cost-grid')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    await (await chooser).setFiles(path.resolve('test/fixtures/import-formats', fixture));
    await expect(page.locator('.file-tab.active')).toContainText(fixture.replace(/\.[^.]+$/, ''));
    await expect(page.locator('.grid-row:not(.chapter):not(.chapter-footer)').first()).toBeVisible();
    await expect(page.locator('.grid-total-row')).toContainText(/68\.61[34],/);
    expect(errors).toEqual([]);
  });
}
