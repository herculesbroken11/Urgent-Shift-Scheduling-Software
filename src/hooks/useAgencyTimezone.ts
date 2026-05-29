/**
 * Returns the canonical app timezone.
 *
 * Per product decision (April 2026), the entire application — every agency,
 * every role, every view — operates in Pacific Time. This hook used to read
 * the agency's saved timezone, but that has been intentionally removed so
 * scheduling, billing, audit, and dashboards all share one wall clock.
 *
 * If you need to display "agency timezone" anywhere, use this value.
 */
export const APP_TIMEZONE = "America/Los_Angeles";

export function useAgencyTimezone(): string {
  return APP_TIMEZONE;
}
