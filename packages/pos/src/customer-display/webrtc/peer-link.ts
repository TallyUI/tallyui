import type { IceServer, SignalMessage } from '@tallyui/core';
import { decode, type DisplayEnvelope } from '../protocol';
import { encode } from '../snapshot';
import { DISPLAY_CHANNEL, type DisplayTransport } from '../transport';

/** How the link sends and receives WebRTC signalling; U4 binds it to the connector's signal mailbox. */
export interface SignalPort {
  send(message: SignalMessage): void;
  onSignal(listener: (message: SignalMessage) => void): () => void;
}

export type PeerLinkState = 'connecting' | 'open' | 'closed';

export interface PeerLink extends DisplayTransport {
  readonly state: PeerLinkState;
  /** Called on every state change; returns the unsubscribe. */
  onStateChange(listener: (state: PeerLinkState) => void): () => void;
}

/**
 * An event-handler slot whose argument is checked both ways, as DOM handlers are, so the browser's own
 * RTCPeerConnection (whose handlers take its richer event types) fits the structural interfaces below.
 */
type Handler<E> = { bivariance(event: E): void }['bivariance'] | null;

export interface SessionDescriptionLike { type?: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string }

/** The structural part of RTCDataChannel the link uses. */
export interface RTCDataChannelLike {
  readonly readyState: string;
  send(data: string): void;
  close(): void;
  onopen: Handler<unknown>;
  onclose: Handler<unknown>;
  onmessage: Handler<{ data: unknown }>;
}

/** The structural part of RTCPeerConnection the link uses; a test passes a fake, and a native till passes its own. */
export interface RTCPeerConnectionLike {
  readonly connectionState: string;
  createDataChannel(label: string, init: { ordered: boolean }): RTCDataChannelLike;
  createOffer(): Promise<SessionDescriptionLike>;
  createAnswer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: SessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: object): Promise<void>;
  close(): void;
  onicecandidate: Handler<{ candidate: { toJSON?(): unknown } | null }>;
  ondatachannel: Handler<{ channel: RTCDataChannelLike }>;
  onconnectionstatechange: Handler<unknown>;
}

export type PeerFactory = (config: { iceServers: IceServer[] }) => RTCPeerConnectionLike;

export interface PeerLinkOptions {
  signal: SignalPort;
  iceServers: IceServer[];
  createPeer?: PeerFactory;
}

const browserPeer: PeerFactory = (config) => new RTCPeerConnection(config);

/** A signal payload as an object, or undefined when it is not JSON or not an object, so a bad signal is ignored. */
function parsePayload(payload: unknown): object | undefined {
  if (typeof payload !== 'string') return undefined;
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

function createPeerLink(role: 'till' | 'display', { signal, iceServers, createPeer = browserPeer }: PeerLinkOptions): PeerLink {
  const peer = createPeer({ iceServers });
  const messageListeners = new Set<(envelope: DisplayEnvelope) => void>();
  const stateListeners = new Set<(state: PeerLinkState) => void>();
  let state: PeerLinkState = 'connecting';
  let channel: RTCDataChannelLike | null = null;
  let described = false;
  let remoteSet = false;
  // The browser refuses a candidate before the remote description, and the mailbox may deliver one first.
  const earlyIce: object[] = [];
  // Every peer call runs in arrival order, one at a time, so a candidate is never applied before its description.
  let chain = Promise.resolve();

  const setState = (next: PeerLinkState) => {
    if (state === 'closed' || state === next) return;
    state = next;
    stateListeners.forEach((listener) => listener(next));
  };

  const shutdown = () => {
    if (state === 'closed') return;
    setState('closed');
    unsubscribe();
    messageListeners.clear();
    stateListeners.clear();
    peer.onicecandidate = peer.ondatachannel = peer.onconnectionstatechange = null;
    if (channel) channel.onopen = channel.onclose = channel.onmessage = null;
    for (const closable of [channel, peer]) {
      try {
        closable?.close();
      } catch {
        // Already closed: nothing is left to release.
      }
    }
  };

  /** Queues a peer call; a rejection closes the link rather than escaping as an unhandled rejection. */
  const step = (work: () => Promise<unknown>) => {
    chain = chain.then(async () => {
      if (state !== 'closed') await work();
    }).catch(shutdown);
  };

  const sendSignal = (message: SignalMessage) => {
    if (state === 'closed') return;
    try {
      signal.send(message);
    } catch {
      shutdown();
    }
  };

  const attach = (next: RTCDataChannelLike) => {
    channel = next;
    next.onopen = () => setState('open');
    next.onclose = shutdown;
    next.onmessage = (event) => {
      const result = decode(event.data);
      if (result.ok) messageListeners.forEach((listener) => listener(result.envelope));
    };
    if (next.readyState === 'open') setState('open');
  };

  peer.onicecandidate = (event) => {
    const { candidate } = event;
    if (!candidate) return;
    sendSignal({ type: 'ice', payload: JSON.stringify(candidate.toJSON ? candidate.toJSON() : candidate) });
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed') shutdown();
  };
  if (role === 'display') {
    peer.ondatachannel = (event) => {
      if (!channel) attach(event.channel);
    };
  }

  const expected = role === 'till' ? 'answer' : 'offer';
  const unsubscribe = signal.onSignal((message) => {
    if (state === 'closed') return;
    const payload = parsePayload(message?.payload);
    if (!payload) return;
    if (message.type === 'ice') {
      if (remoteSet) step(() => peer.addIceCandidate(payload));
      else earlyIce.push(payload);
      return;
    }
    // Only the first description counts: a second offer or answer is a replay, never a renegotiation.
    if (message.type !== expected || described) return;
    described = true;
    step(async () => {
      await peer.setRemoteDescription(payload as SessionDescriptionLike);
      remoteSet = true;
      for (const candidate of earlyIce.splice(0)) await peer.addIceCandidate(candidate);
      if (role === 'display') {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({ type: 'answer', payload: JSON.stringify(answer) });
      }
    });
  });

  if (role === 'till') {
    step(async () => {
      attach(peer.createDataChannel(DISPLAY_CHANNEL, { ordered: true }));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal({ type: 'offer', payload: JSON.stringify(offer) });
    });
  }

  return {
    get state() {
      return state;
    },
    send(envelope) {
      if (channel?.readyState !== 'open') return false;
      try {
        channel.send(encode(envelope));
        return true;
      } catch {
        return false;
      }
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    close: shutdown,
  };
}

/** The till's end (the offerer): it opens the one ordered display channel and sends the offer (ADR-085 d1). */
export function createTillPeerLink(options: PeerLinkOptions): PeerLink {
  return createPeerLink('till', options);
}

/** A display's end (the answerer): it answers the first offer and takes the till's channel. */
export function createDisplayPeerLink(options: PeerLinkOptions): PeerLink {
  return createPeerLink('display', options);
}
