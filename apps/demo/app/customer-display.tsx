import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { CustomerDisplayScreen } from '@tallyui/components';
import { createBroadcastDisplayTransport, useCustomerDisplay, type DisplayTransport } from '@tallyui/pos';

/** The customer's window, opened from the till at `/pos/customer-display`. */
export default function CustomerDisplayWindow() {
  const [transport, setTransport] = useState<DisplayTransport | null>(null);
  useEffect(() => {
    const created = createBroadcastDisplayTransport();
    setTransport(created);
    return () => created.close();
  }, []);
  const state = useCustomerDisplay(transport);
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <CustomerDisplayScreen state={state} />
  </>;
}
