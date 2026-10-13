// Pageview analytics for the open-source POS sites, into wcpos.com's self-hosted PostHog project.
// Canonical copy: TallyUI/tallyui apps/web/src/components/analytics.tsx and analytics-interaction.ts.
// medusapos.com and vendurepos.com copy both verbatim, changing only SITE.
// persistence: 'memory' writes no cookie and no localStorage, so no consent banner is needed
// (front desk ruling, 2026-10-05); each page load counts as a new anonymous visitor.
'use client';

import { useEffect } from 'react';
import { INTERACTION_EVENTS, isUserInteraction } from './analytics-interaction';

// wcpos.com's project token, public by design.
const POSTHOG_KEY = 'phc_BhTJzZ7fXMqcD4MiaUJQsQqPkEpu94yoSAthXFBWemvd';
// wcpos.com's self-hosted PostHog endpoint.
const POSTHOG_HOST = 'https://ph.wcpos.com';
// Sent on every event so dashboards can filter by site.
const SITE = 'tallyui.com';

export function Analytics(): null {
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, onInteraction, { capture: true });
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

    const onInteraction = (event: Event) => {
      if (isUserInteraction(event)) load();
    };

    for (const type of INTERACTION_EVENTS) window.addEventListener(type, onInteraction, { capture: true, passive: true });

    return () => {
      cancelled = true;
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, onInteraction, { capture: true });
      }
    };
  }, []);

  return null;
}
