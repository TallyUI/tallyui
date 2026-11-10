import { decode, type DisplayEnvelope } from './protocol';
import { encode } from './snapshot';

/** How the till and the customer display reach each other. The first is a second window on this device (ADR-084 3). */
export interface DisplayTransport {
  /** False when the channel refuses (closed); never throws. */
  send(envelope: DisplayEnvelope): boolean;
  /** Decoded messages from the other window; returns the unsubscribe. */
  onMessage(listener: (envelope: DisplayEnvelope) => void): () => void;
  close(): void;
}

export const DISPLAY_CHANNEL = 'tallyui.customer-display';

/** The structural part of BroadcastChannel the transport uses (a test passes a fake). */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/** A same-origin second window over BroadcastChannel. Whatever arrives is decoded; anything refused is dropped. */
export function createBroadcastDisplayTransport(
  channelName = DISPLAY_CHANNEL,
  open: (name: string) => BroadcastChannelLike = (name) => new BroadcastChannel(name),
): DisplayTransport {
  const channel = open(channelName);
  const listeners = new Set<(envelope: DisplayEnvelope) => void>();
  channel.onmessage = (event) => {
    const result = decode(event.data);
    if (result.ok) listeners.forEach((listener) => listener(result.envelope));
  };
  return {
    send(envelope) {
      try {
        channel.postMessage(encode(envelope));
        return true;
      } catch {
        return false;
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      channel.onmessage = null;
      channel.close();
    },
  };
}
