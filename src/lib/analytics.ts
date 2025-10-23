export type AnalyticsEvent = string;
export function track(event: AnalyticsEvent, props?: Record<string, any>) {
  console.log('[track]', event, props || {});
}
