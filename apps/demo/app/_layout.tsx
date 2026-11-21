import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@tallyui/primitives';
import { useStackScreenOptions } from '../lib/use-stack-screen-options';

export default function RootLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={screenOptions}
      />
      {/* One root host, above every Stack header, so portalled content (Dialog, Popover, ...)
          never renders inside a screen's own content area and under its header (the Front desk
          review, 2026-09-28). A per-screen PortalHost renders under the header instead. */}
      <PortalHost />
    </>
  );
}
