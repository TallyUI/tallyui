import { test, expect } from '@playwright/test';

test.describe('Customer display over BroadcastChannel (ADR-084 3)', () => {
  test('the till opens a second window, configures it and drives it to idle after the payment', async ({ page }) => {
    await page.goto('/pos/customer-display');
    const [display] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Open customer display' }).click(),
    ]);
    // The store name comes only in display.config, so seeing it means the handshake answered this window's hello.
    const idle = display.getByTestId('customer-display-idle');
    await expect(idle).toContainText('Tally Demo Store');
    await expect(idle).toContainText('Welcome');

    await page.getByRole('button', { name: 'Add Tea' }).click();
    await page.getByRole('button', { name: 'Add Tea' }).click();
    const cart = display.getByTestId('customer-display-cart');
    await expect(cart).toContainText('2 ×Tea');
    await expect(cart).toContainText('Total€5.00');

    await page.getByRole('button', { name: 'Take payment' }).click();
    await expect(display.getByTestId('customer-display-payment')).toContainText('Please present your card€5.00');
    await page.getByRole('button', { name: 'Complete payment' }).click();
    await expect(display.getByTestId('customer-display-payment')).toContainText('Paid in full€5.00Change €5.00Thank you');
    // The demo's afterCompleteMs is 3 s: the till cleared the cart at once, and the display still thanks the customer.
    await display.waitForTimeout(1500);
    await expect(display.getByTestId('customer-display-payment')).toBeVisible();
    await expect(idle).toContainText('Welcome', { timeout: 5000 });
  });

  test('a real BroadcastChannel refuses what the unit-test fake refuses', async ({ page }) => {
    await page.goto('/pos/customer-display');
    const errors = await page.evaluate(() => {
      const name = (run: () => void) => {
        try {
          run();
          return 'none';
        } catch (error) {
          return (error as DOMException).name;
        }
      };
      const channel = new BroadcastChannel('fake-check');
      const uncloneable = name(() => channel.postMessage(() => 1));
      channel.close();
      return { uncloneable, afterClose: name(() => channel.postMessage('hi')) };
    });
    expect(errors).toEqual({ uncloneable: 'DataCloneError', afterClose: 'InvalidStateError' });
  });
});
