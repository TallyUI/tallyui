import { test, expect } from '@playwright/test';

test.describe('Overlay anchoring', () => {
  test('a Popover inside a centred Dialog opens against its trigger', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Reduced motion, so the dialog's scale-in does not move the trigger while it is measured.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ui/dialog');

    await page.getByRole('button', { name: 'Open dialog with a popover', exact: true }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Dialog with a popover' })).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Open nested popover', exact: true });
    await trigger.click();
    const content = page.getByRole('dialog').filter({ hasText: 'Nested Popover Content' });
    await expect(content).toBeVisible();

    const boxes = async () => ({ t: (await trigger.boundingBox())!, c: (await content.boundingBox())! });
    // Soft, so a miss on y still reports x and still logs the boxes and saves the screenshot.
    const soft = expect.configure({ soft: true });
    // The position is applied after an async measure, so poll for it.
    // Top is the trigger's bottom plus sideOffset 4 (PopoverContent's default).
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.y - (t.y + t.height + 4));
      }, { message: 'content top vs trigger bottom + 4' })
      .toBeLessThanOrEqual(2);
    // Centres line up (PopoverContent's default align="center").
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.x + c.width / 2 - (t.x + t.width / 2));
      }, { message: 'content centre vs trigger centre' })
      .toBeLessThanOrEqual(2);

    const { t, c } = await boxes();
    console.log('trigger', JSON.stringify(t), 'content', JSON.stringify(c));
    await page.screenshot({ path: testInfo.outputPath('popover-in-dialog-1280x800.png') });
  });

  type Box = { x: number; y: number; width: number; height: number };
  // Each overlay's default edge and alignment, from its Content in packages/components/src/ui.
  const overlays: {
    name: string;
    open: 'click' | 'focus' | 'hover' | 'long-press';
    edge: string;
    edgeGap: (t: Box, c: Box) => number;
    align: 'start' | 'center';
  }[] = [
    // side bottom, sideOffset 0, align start (the primitive's defaults)
    { name: 'select', open: 'click', edge: 'content top vs trigger bottom', edgeGap: (t, c) => c.y - (t.y + t.height), align: 'start' },
    // side bottom, DropdownMenuContent's sideOffset 4, align start
    { name: 'dropdown-menu', open: 'click', edge: 'content top vs trigger bottom + 4', edgeGap: (t, c) => c.y - (t.y + t.height + 4), align: 'start' },
    // side bottom, HoverCardContent's sideOffset 4 and align center
    { name: 'hover-card', open: 'click', edge: 'content top vs trigger bottom + 4', edgeGap: (t, c) => c.y - (t.y + t.height + 4), align: 'center' },
    // side top (the primitive's default), TooltipContent's sideOffset 4, align center
    { name: 'tooltip', open: 'hover', edge: 'content bottom vs trigger top - 4', edgeGap: (t, c) => c.y + c.height - (t.y - 4), align: 'center' },
    // side bottom, sideOffset 0, align start; anchored to the trigger box, not the press point
    { name: 'context-menu', open: 'long-press', edge: 'content top vs trigger bottom', edgeGap: (t, c) => c.y - (t.y + t.height), align: 'start' },
    // side bottom, sideOffset 4 (v2's popover anchor), align start; at least the trigger's width
    { name: 'combobox', open: 'focus', edge: 'content top vs trigger bottom + 4', edgeGap: (t, c) => c.y - (t.y + t.height + 4), align: 'start' },
  ];

  for (const overlay of overlays) {
    test(`a ${overlay.name} inside a centred Dialog opens against its trigger`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ui/dialog');

      await page.getByRole('button', { name: 'Open dialog with overlays', exact: true }).click();
      await expect(page.getByRole('dialog').filter({ hasText: 'Dialog with overlays' })).toBeVisible();

      const trigger = page.getByTestId(`nested-${overlay.name}-trigger`);
      await expect(trigger).toBeVisible();
      if (overlay.open === 'click') {
        await trigger.click();
      } else if (overlay.open === 'focus') {
        // A click on the Trigger opens on the Input's focus, then the Trigger's press toggles it shut.
        await trigger.getByRole('combobox').focus();
      } else if (overlay.open === 'hover') {
        await trigger.hover();
      } else {
        // ContextMenu opens on long press (react-native-web's default delay is 450 ms).
        const t = (await trigger.boundingBox())!;
        await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(900);
        await page.mouse.up();
      }
      const content = page.getByTestId(`nested-${overlay.name}-content`);
      await expect(content).toBeVisible();

      const boxes = async () => ({ t: (await trigger.boundingBox())!, c: (await content.boundingBox())! });
      const soft = expect.configure({ soft: true });
      await soft
        .poll(async () => {
          const { t, c } = await boxes();
          return Math.abs(overlay.edgeGap(t, c));
        }, { message: overlay.edge })
        .toBeLessThanOrEqual(2);
      await soft
        .poll(async () => {
          const { t, c } = await boxes();
          return overlay.align === 'start'
            ? Math.abs(c.x - t.x)
            : Math.abs(c.x + c.width / 2 - (t.x + t.width / 2));
        }, { message: overlay.align === 'start' ? 'content left vs trigger left' : 'content centre vs trigger centre' })
        .toBeLessThanOrEqual(2);
      if (overlay.name === 'combobox') {
        await soft
          .poll(async () => {
            const { t, c } = await boxes();
            // v2's `w-80` (320 px), never narrower than the trigger.
            return Math.abs(c.width - Math.max(320, t.width));
          }, { message: 'content width vs max(320, trigger width)' })
          .toBeLessThanOrEqual(2);
      }

      const { t, c } = await boxes();
      console.log(overlay.name, 'trigger', JSON.stringify(t), 'content', JSON.stringify(c));
      await page.screenshot({ path: testInfo.outputPath(`${overlay.name}-in-dialog-1280x800.png`) });
    });
  }

  test('a Combobox on a plain page opens under its input', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ui/combobox');

    const trigger = page.getByTestId('combobox-fixed-trigger');
    // Opened by the Input's focus: a click on the Trigger toggles the list shut again.
    await trigger.getByRole('combobox').focus();
    const content = page.getByTestId('combobox-fixed-content');
    await expect(content).toBeVisible();

    const boxes = async () => ({ t: (await trigger.boundingBox())!, c: (await content.boundingBox())! });
    const soft = expect.configure({ soft: true });
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.y - (t.y + t.height + 4));
      }, { message: 'content top vs trigger bottom + 4' })
      .toBeLessThanOrEqual(2);
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.x - t.x);
      }, { message: 'content left vs trigger left' })
      .toBeLessThanOrEqual(2);
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        // v2's `w-80` (320 px), never narrower than the trigger.
        return Math.abs(c.width - Math.max(320, t.width));
      }, { message: 'content width vs max(320, trigger width)' })
      .toBeLessThanOrEqual(2);

    const { t, c } = await boxes();
    console.log('combobox-plain trigger', JSON.stringify(t), 'content', JSON.stringify(c));
    await page.screenshot({ path: testInfo.outputPath('combobox-plain-1280x800.png') });

    // The country list (eight rows and the empty row) is taller than v2's `max-h-75`: 300 px,
    // border and padding included (border-box), and its rows scroll past that.
    await page.getByPlaceholder('Search countries...').focus();
    const countries = page.getByRole('listbox').filter({ hasText: 'Brazil' });
    await expect(countries).toBeVisible();
    await soft.poll(async () => (await countries.boundingBox())!.height, { message: 'country list height' })
      .toBeLessThanOrEqual(301);
  });
});
