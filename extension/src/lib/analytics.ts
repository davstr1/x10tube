// PostHog analytics — fire-and-forget, zero impact on UX
// Uses HTTP API directly, no SDK

const POSTHOG_URL = 'https://app.posthog.com/capture/';
const API_KEY = __POSTHOG_API_KEY__;

function getDistinctId(): Promise<string | null> {
  try {
    return chrome.storage.local.get(['styaUserCode']).then(
      data => (data.styaUserCode as string) || null,
      () => null
    );
  } catch {
    return Promise.resolve(null);
  }
}

export function trackEvent(event: string, properties: Record<string, string> = {}): void {
  if (!API_KEY) return;
  getDistinctId().then(distinctId => {
    if (!distinctId) return;
    fetch(POSTHOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: API_KEY,
        event,
        distinct_id: distinctId,
        properties
      })
    }).catch(() => {});
  }).catch(() => {});
}
