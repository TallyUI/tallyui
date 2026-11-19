import { test, expect } from '@playwright/test';

const sizes = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

test.describe('ReceiptSheet email form (vendurepos gap 12.1b)', () => {
  for (const size of sizes) {
    test(`refuses, then sends and says Email sent, cleared on reopen at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/pos/receipt-sheet?open=1');
      const form = page.getByTestId('receipt-email-form');
      const field = page.getByTestId('receipt-email-address');
      const error = page.getByTestId('receipt-email-error');
      const sent = page.getByTestId('receipt-email-sent');

      await page.getByTestId('receipt-email-button').click();
      await expect(form).toBeVisible();
      await expect(field).toHaveValue('jo@example.com');
      await expect(sent).toHaveCount(0);

      await field.fill('jo.example.com');
      await page.getByTestId('receipt-email-send').click();
      await expect(error).toHaveText('Enter an email address.');

      await field.fill('refused@example.com');
      await page.getByTestId('receipt-email-send').click();
      await expect(error).toHaveText('The store refused this address.');
      await expect(form).toBeVisible();
      await expect(sent).toHaveCount(0);

      await field.fill('sam@example.com');
      await page.getByTestId('receipt-email-send').click();
      await expect(form).toHaveCount(0);
      await expect(sent).toBeVisible();
      await expect(sent).toHaveText('Email sent');
      const box = await sent.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 0.5);

      await page.getByTestId('receipt-close-button').click();
      await page.getByTestId('receipt-sheet-open').click();
      await expect(sent).toHaveCount(0);
    });
  }
});
