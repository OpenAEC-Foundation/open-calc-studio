import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'output', 'screenshots');

// Helper: take a named screenshot
async function snap(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

// Grid column indices (from gridConstants.ts):
//  0 = Nr (computed)
//  1 = Code (editable, text)
//  2 = Omschrijving (editable, text)
//  3 = Eenheid (editable, unit-select)
//  4 = Hoeveelheid (editable, number)
//  5 = Materiaal (editable, currency)
//  6 = Arbeid (editable, currency)
//  7 = Eenheidsprijs (computed)
//  8 = Totaal (computed)

test.describe('Symitech Calc Studio - GUI Test', () => {

  test('create a new begroting and enter cost data', async ({ page }) => {
    // ── Step 1: Navigate to the app ──
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Give the React app a moment to hydrate
    await page.waitForTimeout(1000);

    await snap(page, '01-initial-state');
    console.log('Screenshot: 01-initial-state');

    // ── Step 2: Focus the grid ──
    // The grid container has class "cost-grid" and tabIndex=0
    const grid = page.locator('.cost-grid');
    await expect(grid).toBeVisible({ timeout: 10_000 });
    await grid.focus();
    await page.waitForTimeout(300);

    await snap(page, '02-grid-focused');
    console.log('Screenshot: 02-grid-focused');

    // ── Step 3: Create the first row by typing ──
    // When the grid is empty and a key is pressed, it calls addItem() and startEditing(key).
    // The first editable column is Code (index 1).
    await page.keyboard.type('F');  // This triggers addItem + startEditing('F')
    await page.waitForTimeout(500);

    await snap(page, '03-first-row-created');
    console.log('Screenshot: 03-first-row-created');

    // ── Step 4: Enter Code ──
    // The editor should already be open with 'F' pre-filled.
    // Type the rest of the code.
    await page.keyboard.type('UND-01');
    await page.waitForTimeout(200);

    await snap(page, '04-code-entered');
    console.log('Screenshot: 04-code-entered');

    // Press Tab to commit and move to next editable column (Omschrijving, col 2)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // ── Step 5: Enter Description ──
    // After Tab, the editor should open on the next editable cell.
    // The grid's moveToNextCell should have moved us. We may need to double-click or type.
    // Let's check if editor is visible; if not, start editing.
    const editorVisible = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!editorVisible) {
      // Double-click to start editing the current cell
      await page.keyboard.press('F2');  // Try F2 first
      await page.waitForTimeout(300);
      const stillNotVisible = !(await page.locator('.grid-cell-editor').isVisible().catch(() => false));
      if (stillNotVisible) {
        // Type to start editing
        await page.keyboard.type('F');
        await page.waitForTimeout(300);
      }
    }

    // Type the description
    await page.keyboard.type('Fundering beton C30/37');
    await page.waitForTimeout(200);

    await snap(page, '05-description-entered');
    console.log('Screenshot: 05-description-entered');

    // Tab to next editable column (Eenheid / unit-select, col 3)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // ── Step 6: Select Unit ──
    // The unit column is a <select> dropdown. It should auto-focus.
    const selectEl = page.locator('.grid-cell-editor').locator('select').first();
    const isSelect = await selectEl.isVisible().catch(() => false);
    if (isSelect) {
      await selectEl.selectOption('m³');
      await page.waitForTimeout(300);
    } else {
      // Might be rendered as select without nesting; try the editor itself
      const editorSelect = page.locator('select.grid-cell-editor').first();
      const isEditorSelect = await editorSelect.isVisible().catch(() => false);
      if (isEditorSelect) {
        await editorSelect.selectOption('m³');
        await page.waitForTimeout(300);
      } else {
        // Just type and tab through
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);
      }
    }

    await snap(page, '06-unit-selected');
    console.log('Screenshot: 06-unit-selected');

    // After selecting unit, the onChange handler commits + moves to next cell (Hoeveelheid, col 4)
    await page.waitForTimeout(500);

    // ── Step 7: Enter Quantity ──
    // Check if editor opened automatically after unit select moved focus
    const qtyEditorVisible = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!qtyEditorVisible) {
      // Need to start editing - double-click on the active cell
      // The active cell should be at row 0, col 4
      // Try typing to trigger edit
      await page.keyboard.type('2');
      await page.waitForTimeout(300);
    }
    await page.keyboard.type('5.5');
    await page.waitForTimeout(200);

    await snap(page, '07-quantity-entered');
    console.log('Screenshot: 07-quantity-entered');

    // Tab to Materiaal (col 5)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // ── Step 8: Enter Material Price ──
    const matEditorVisible = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!matEditorVisible) {
      await page.keyboard.type('1');
      await page.waitForTimeout(300);
    }
    await page.keyboard.type('85.50');
    await page.waitForTimeout(200);

    await snap(page, '08-material-price-entered');
    console.log('Screenshot: 08-material-price-entered');

    // Tab to Arbeid (col 6)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // ── Step 9: Enter Labor Price ──
    const labEditorVisible = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!labEditorVisible) {
      await page.keyboard.type('4');
      await page.waitForTimeout(300);
    }
    await page.keyboard.type('45.00');
    await page.waitForTimeout(200);

    await snap(page, '09-labor-price-entered');
    console.log('Screenshot: 09-labor-price-entered');

    // Press Enter to commit the last cell
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await snap(page, '10-row-complete');
    console.log('Screenshot: 10-row-complete');

    // ── Step 10: Add a second row ──
    // After Enter on labor, we should be on row 1, col 6.
    // We need to start a new row. Let's click on the grid and type.
    await grid.focus();
    await page.waitForTimeout(300);

    // If a new empty row was auto-created, type into it. Otherwise use keyboard.
    await page.keyboard.type('W');
    await page.waitForTimeout(500);
    await page.keyboard.type('AND-01');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Description
    const ed2 = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!ed2) {
      await page.keyboard.type('W');
      await page.waitForTimeout(200);
    }
    await page.keyboard.type('Wapeningsstaal B500');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Unit - select 'kg'
    const unitSelect2 = page.locator('select.grid-cell-editor').first();
    const isUnitSel2 = await unitSelect2.isVisible().catch(() => false);
    if (isUnitSel2) {
      await unitSelect2.selectOption('kg');
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(300);

    // Quantity
    const qe2 = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!qe2) {
      await page.keyboard.type('1');
      await page.waitForTimeout(200);
    }
    await page.keyboard.type('250');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Material price
    const me2 = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!me2) {
      await page.keyboard.type('1');
      await page.waitForTimeout(200);
    }
    await page.keyboard.type('.20');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Labor price
    const le2 = await page.locator('.grid-cell-editor').isVisible().catch(() => false);
    if (!le2) {
      await page.keyboard.type('0');
      await page.waitForTimeout(200);
    }
    await page.keyboard.type('.80');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await snap(page, '11-two-rows-complete');
    console.log('Screenshot: 11-two-rows-complete');

    // ── Step 11: Try print preview via Ctrl+P ──
    // Note: Ctrl+P in a browser opens the browser's print dialog.
    // Let's check if there's a backstage/print menu first.
    const backstageBtn = page.locator('[data-testid="backstage-btn"], .backstage-btn, button:has-text("Bestand")').first();
    const hasBackstage = await backstageBtn.isVisible().catch(() => false);

    if (hasBackstage) {
      await backstageBtn.click();
      await page.waitForTimeout(500);
      await snap(page, '12-backstage-open');
      console.log('Screenshot: 12-backstage-open');

      // Look for print option
      const printBtn = page.locator('button:has-text("Afdrukken"), button:has-text("Print"), [data-action="print"]').first();
      const hasPrint = await printBtn.isVisible().catch(() => false);
      if (hasPrint) {
        await printBtn.click();
        await page.waitForTimeout(1000);
        await snap(page, '13-print-preview');
        console.log('Screenshot: 13-print-preview');
      }
    } else {
      // Try Ctrl+P - this will open browser print dialog
      // We can intercept it by listening for the dialog
      console.log('No backstage button found, attempting Ctrl+P');

      // Take a screenshot of the final state before print attempt
      await snap(page, '12-final-state-before-print');
      console.log('Screenshot: 12-final-state-before-print');

      // For Ctrl+P, the browser print dialog can't be easily captured.
      // Instead just document it.
      console.log('Skipping Ctrl+P as it opens native browser dialog');
    }

    // ── Step 12: Final overview screenshot ──
    await page.waitForTimeout(500);
    await snap(page, '99-final-overview');
    console.log('Screenshot: 99-final-overview');

    console.log('All screenshots saved to output/screenshots/');
  });
});
