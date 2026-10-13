// A person on the page is a trusted pointerdown, keydown or touchstart.
// Scroll, wheel and pointermove are left out because a page can fire them by
// script (Fumadocs scrolls the docs sidebar on load). isTrusted is false for
// any event a script dispatches.
export const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export function isUserInteraction(event: Pick<Event, 'type' | 'isTrusted'>): boolean {
  return event.isTrusted === true && INTERACTION_EVENTS.some((type) => type === event.type);
}
