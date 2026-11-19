import { test, expect, type Page } from '@playwright/test';

// Desktop Chrome's default size, and the phone size dialog-side-sheet.spec.ts uses.
const SIZES = [{ width: 1280, height: 720 }, { width: 360, height: 640 }];

/** Picks Alice Martin through the dropdown's search, then opens the address dialog from the pin. */
async function openForAlice(page: Page) {
  await page.goto('/pos/customer-dropdown');
  await page.getByTestId('customer-dropdown-chip').click();
  await page.getByTestId('customer-dropdown-search').fill('alice');
  await page.getByTestId('customer-dropdown-option-alice').click();
  await expect(page.getByTestId('customer-dropdown-chip')).toHaveAccessibleName('Customer: Alice Martin');
  await page.getByTestId('customer-dropdown-address').click();
  await expect(page.getByTestId('address-editor-dialog')).toBeVisible();
}

/** The pin's glyph carries hasAddress as its ink: text-foreground once billing has an address, else text-muted-foreground. */
const pinGlyph = (page: Page) => page.getByTestId('customer-dropdown-address').locator('div').first();

/** P1's billing: add it, type Address 1 and City, close with Done. */
async function addBilling(page: Page) {
  await page.getByTestId('address-editor-billing-add').click();
  await page.getByTestId('address-editor-billing-address1').fill('1 High St');
  await page.getByTestId('address-editor-billing-city').fill('Leeds');
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test.describe(`AddressEditor in the customer dropdown's dialog at ${at}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
      // Reduced motion, so the dialog does not scale while it is measured.
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('P1 the pin opens the dialog, billing is added, and the summary shows on reopen', async ({ page }, testInfo) => {
      await openForAlice(page);
      const dialog = page.getByTestId('address-editor-dialog');
      await expect(dialog).toContainText('Edit Customer Address');
      await expect(dialog).toContainText('Changes save to this order');
      await addBilling(page);
      await page.screenshot({ path: testInfo.outputPath(`address-editor-${at}.png`) });
      await page.getByTestId('address-editor-done').click();
      await expect(dialog).toHaveCount(0);
      await expect(pinGlyph(page)).toHaveClass(/(^|\s)text-foreground(\s|$)/);
      await page.getByTestId('customer-dropdown-address').click();
      await expect(page.getByTestId('address-editor-billing-summary')).toHaveText('1 High St, Leeds, GB');
    });

    test('P2 Use a different address copies billing into shipping; Same as billing folds it back', async ({ page }) => {
      await openForAlice(page);
      await addBilling(page);
      await expect(page.getByTestId('address-editor-shipping-linked')).toHaveText('Same as billing');
      await page.getByTestId('address-editor-shipping-different').click();
      await expect(page.getByTestId('address-editor-shipping-fields-address1')).toHaveValue('1 High St');
      await expect(page.getByTestId('address-editor-shipping-fields-city')).toHaveValue('Leeds');
      await page.getByTestId('address-editor-shipping-same').click();
      await expect(page.getByTestId('address-editor-shipping-fields-address1')).toHaveCount(0);
      await expect(page.getByTestId('address-editor-shipping-linked')).toBeVisible();
    });

    test('P3 Remove billing, and on reopen the add button is back', async ({ page }) => {
      await openForAlice(page);
      await addBilling(page);
      await page.getByTestId('address-editor-billing-remove').click();
      await page.getByTestId('address-editor-done').click();
      await expect(pinGlyph(page)).toHaveClass(/(^|\s)text-muted-foreground(\s|$)/);
      await page.getByTestId('customer-dropdown-address').click();
      await expect(page.getByTestId('address-editor-billing-add')).toBeVisible();
      await expect(page.getByTestId('address-editor-billing-summary')).toHaveCount(0);
    });

    if (size.width === 360) {
      test('P4 at 360 px the dialog fits, Done is reachable, and the open parts scroll inside the body', async ({ page }) => {
        await openForAlice(page);
        await page.getByTestId('address-editor-billing-add').click();
        const box = (await page.getByTestId('address-editor-dialog').boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(size.width + 1);
        const done = page.getByTestId('address-editor-done');
        await done.scrollIntoViewIfNeeded();
        await expect(done).toBeInViewport();
        const address2 = page.getByTestId('address-editor-billing-address2');
        await expect(address2).not.toBeInViewport();
        const body = page.getByTestId('address-editor-body');
        const bodyBox = (await body.boundingBox())!;
        await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
        await expect.poll(async () => {
          await page.mouse.wheel(0, 200);
          const [field, frame] = [(await address2.boundingBox())!, (await body.boundingBox())!];
          return field.y >= frame.y && field.y + field.height <= frame.y + frame.height;
        }, { message: 'Address 2 scrolled into view inside the body' }).toBe(true);
        await expect(address2).toBeInViewport();
        // The dialog itself did not move: the body scrolled, not the page.
        expect((await page.getByTestId('address-editor-dialog').boundingBox())!.y).toBeCloseTo(box.y, 0);
        await expect(done).toBeInViewport();
      });
    }
  });
}
