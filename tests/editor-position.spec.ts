import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'output', 'screenshots');

async function snap(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

test.describe('Editor position test', () => {
  test('editor should align with cell text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Close backstage if open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const grid = page.locator('.cost-grid');
    await expect(grid).toBeVisible({ timeout: 10_000 });

    await snap(page, 'editor-00-grid');

    // Find an editable row (begrotingspost or regel, not chapter)
    // Click on its description cell (class col-description)
    const editableRow = page.locator('.grid-row.regel, .grid-row.begrotingspost').first();
    const rowVisible = await editableRow.isVisible().catch(() => false);
    console.log('Found editable row:', rowVisible);

    if (!rowVisible) {
      console.log('No editable rows, skipping test');
      return;
    }

    // Find the description cell by class
    let descCell = editableRow.locator('.col-description').first();
    let cellExists = await descCell.count() > 0;
    if (!cellExists) {
      // Try broader approach - description is typically the widest cell
      const cells = editableRow.locator('.grid-cell');
      const cellCount = await cells.count();
      console.log(`Row has ${cellCount} cells`);
      // Log all cell widths to identify description
      for (let i = 0; i < cellCount; i++) {
        const box = await cells.nth(i).boundingBox();
        const text = await cells.nth(i).textContent();
        console.log(`  Cell ${i}: width=${box?.width}, text="${text?.substring(0, 30)}"`);
      }
      // Use the widest cell that has text content
      descCell = cells.nth(2); // fallback
    }

    const cellBox = await descCell.boundingBox();
    const cellText = await descCell.textContent();
    console.log('Target cell:', JSON.stringify(cellBox), 'text:', cellText?.substring(0, 40));

    await snap(page, 'editor-01-before-edit');

    // Click to start editing
    if (cellBox) {
      await page.mouse.click(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
    } else {
      await descCell.click();
    }
    await page.waitForTimeout(500);

    await snap(page, 'editor-02-after-click');

    // Check editor
    const editor = page.locator('input.grid-cell-editor, textarea.grid-cell-editor, select.grid-cell-editor');
    const editorVisible = await editor.isVisible();
    console.log('Editor visible:', editorVisible);

    if (editorVisible) {
      const editorBox = await editor.boundingBox();
      console.log('Editor box:', JSON.stringify(editorBox));
      console.log('Cell box:', JSON.stringify(cellBox));

      if (cellBox && editorBox) {
        const yDiff = editorBox.y - cellBox.y;
        const xDiff = editorBox.x - cellBox.x;
        console.log(`Position diff: x=${xDiff}px, y=${yDiff}px`);
        console.log(`Size diff: w=${editorBox.width - cellBox.width}px, h=${editorBox.height - cellBox.height}px`);
      }

      await snap(page, 'editor-03-editing');
    } else {
      console.log('Editor not visible, dumping grid HTML around click');
      const html = await editableRow.innerHTML();
      console.log('Row HTML:', html.substring(0, 500));
    }

    await snap(page, 'editor-99-final');
  });
});
