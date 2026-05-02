import { test, expect } from '@playwright/test';
import path from 'path';

test('WpCalc import produces correct data', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:5180');
  await page.waitForLoadState('networkidle');

  // Open Backstage
  await page.click('button:has-text("Bestand")');
  await page.waitForTimeout(500);

  // Click WpCalc import
  const wpCalcBtn = page.locator('text=WpCalc (.calc)');
  if (await wpCalcBtn.count() > 0) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await wpCalcBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('begrotingen/test-wpcalc.calc'));
    await page.waitForTimeout(3000);

    // Switch to UI-2 view
    const ui2Btn = page.locator('button:has-text("UI-2")');
    if (await ui2Btn.count() > 0) {
      await ui2Btn.click();
      await page.waitForTimeout(500);
    }

    // Check grid rows are visible
    const gridRows = page.locator('.grid-row');
    const rowCount = await gridRows.count();
    console.log('VISIBLE ROWS:', rowCount);
    expect(rowCount).toBeGreaterThan(0);

    // Check total row
    const totalRow = page.locator('.grid-total-row');
    const totalText = await totalRow.textContent();
    console.log('TOTAL ROW:', totalText);

    // Check first row text
    const firstRow = page.locator('.grid-row').first();
    const firstRowText = await firstRow.textContent();
    console.log('FIRST ROW:', firstRowText);

    // Check no fatal console errors
    const realErrors = errors.filter(e => !e.includes('favicon'));
    if (realErrors.length > 0) {
      console.log('CONSOLE ERRORS:', realErrors);
    }
    expect(realErrors.length).toBe(0);
  } else {
    console.log('WpCalc import button not found');
    const btns = await page.locator('button').allTextContents();
    console.log('Available buttons:', btns);
    expect(false).toBe(true);
  }
});
