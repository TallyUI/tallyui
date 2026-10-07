// Pageview analytics for the open-source POS sites, into wcpos.com's self-hosted PostHog project.
// Canonical copy: TallyUI/tallyui apps/web/src/components/analytics.tsx.
// medusapos.com and vendurepos.com copy it verbatim, changing only SITE.
// persistence: 'memory' writes no cookie and no localStorage, so no consent banner is needed
// (front desk ruling, 2026-10-05); each page load counts as a new anonymous visitor.
'use client';

import { useEffect } from 'react';

// wcpos.com's project token, public by design.
const POSTHOG_KEY = 'phc_BhTJzZ7fXMqcD4MiaUJQsQqPkEpu94yoSAthXFBWemvd';
// wcpos.com's self-hosted PostHog endpoint.
const POSTHOG_HOST = 'https://ph.wcpos.com';
// Sent on every event so dashboards can filter by site.
const SITE = 'tallyui.com';

// Any of these on window means a person is on the page; posthog-js is only fetched then, to keep it out of the initial load.
const INTERACTION_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export function Analytics(): null {
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, load, { capture: true });
      }

      import('posthog-js').then(({ default: posthog }) => {
        if (cancelled) return;
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          persistence: 'memory',
          autocapture: false,
          capture_pageview: 'history_change',
          person_profiles: 'never',
          disable_session_recording: true,
          disable_external_dependency_loading: true,
          before_send: (event) => event && { ...event, properties: { ...event.properties, site: SITE } },
        });
      });
    };

    for (const type of INTERACTION_EVENTS) window.addEventListener(type, load, { capture: true, passive: true, once: true });

    return () => {
      cancelled = true;
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, load, { capture: true });
      }
    };
  }, []);

  return null;
}
