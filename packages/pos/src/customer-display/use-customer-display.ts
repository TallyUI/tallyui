import { useEffect, useState } from 'react';
import { displayReducer, initialDisplayState, type DisplayState } from './display-state';
import { makeEnvelope, type DisplayTemplate } from './protocol';
import type { DisplayTransport } from './transport';

export const DISPLAY_TEMPLATE: DisplayTemplate = { id: 'default', version: 1 };
/** The hello is re-sent until a config answers it, so a till opened after the display still finds it. */
export const HELLO_RETRY_MS = 2000;

/**
 * The customer display's side: says `display.hello`, then shows what the till sends. As v2's display page
 * (Pro packages/display/src/session.ts), nothing is applied before the `display.config` that answers this hello.
 */
export function useCustomerDisplay(transport: DisplayTransport | null): DisplayState {
  const [state, setState] = useState(initialDisplayState);
  useEffect(() => {
    if (!transport) return;
    const hello = makeEnvelope('display.hello', { template: DISPLAY_TEMPLATE });
    let configured = false;
    const retry = setInterval(() => transport.send(hello), HELLO_RETRY_MS);
    const unsubscribe = transport.onMessage((envelope) => {
      if (!configured) {
        if (envelope.action !== 'display.config' || envelope.id !== hello.id) return;
        configured = true;
        clearInterval(retry);
      }
      setState((previous) => displayReducer(previous, envelope));
    });
    transport.send(hello);
    return () => {
      clearInterval(retry);
      unsubscribe();
    };
  }, [transport]);
  return state;
}
