/**
 * Utility for converting between agency-local time and UTC.
 *
 * All appointments are stored in UTC. The agency has a canonical timezone
 * (e.g. "America/New_York") that should be used for display and entry.
 *
 * These helpers use the Intl API, which is available in all modern browsers.
 */

/**
 * Format a UTC ISO string for display in the given timezone.
 */
export function formatInTimezone(
  isoUtc: string | Date,
  timezone: string,
  fmt: Intl.DateTimeFormatOptions
): string {
  const date = typeof isoUtc === "string" ? new Date(isoUtc) : isoUtc;
  return new Intl.DateTimeFormat("en-US", { ...fmt, timeZone: timezone }).format(date);
}

/**
 * Get date and time parts from a UTC ISO string in the given timezone.
 * Returns { date: "yyyy-MM-dd", time: "HH:mm" }
 */
export function utcToLocalParts(
  isoUtc: string | null | undefined,
  timezone: string
): { date: string; time: string } {
  if (!isoUtc) return { date: "", time: "" };
  try {
    const d = new Date(isoUtc);
    // Use Intl to get parts in the target timezone
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    // Handle "24:xx" edge case from some locales
    let hour = get("hour");
    if (hour === "24") hour = "00";
    const time = `${hour.padStart(2, "0")}:${get("minute").padStart(2, "0")}`;
    return { date, time };
  } catch {
    return { date: "", time: "" };
  }
}

/**
 * Convert a local date + time in the agency timezone to a UTC ISO string.
 * E.g. localToUtcIso("2026-03-15", "09:00", "America/New_York")
 * → "2026-03-15T14:00:00.000Z" (during EDT)
 */
export function localToUtcIso(
  localDate: string,
  localTime: string,
  timezone: string
): string | null {
  if (!localDate || !localTime) return null;

  // Build a "wall clock" date-time string and use the timezone offset to convert
  // Strategy: create a Date at the given wall-clock and use the offset
  // We parse using the timezone by finding the offset
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);

  // Use a known epoch to find the UTC offset for this timezone at approximately this date
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Get the offset by comparing the local representation in the target timezone
  const localParts = utcToLocalParts(approx.toISOString(), timezone);
  if (!localParts.date || !localParts.time) return approx.toISOString();

  // Parse what we got back
  const [ly, lm, ld] = localParts.date.split("-").map(Number);
  const [lh, lmin] = localParts.time.split(":").map(Number);

  // The offset is: approx(UTC) when interpreted in tz = localParts
  // We want: target(UTC) when interpreted in tz = (year, month, day, hour, minute)
  // offset = approx(UTC) - localParts (as UTC millis)
  const localAsUtc = Date.UTC(ly, lm - 1, ld, lh, lmin);
  const diffMs = approx.getTime() - localAsUtc;

  // Target wall-clock as UTC millis
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const targetUtc = new Date(wallAsUtc + diffMs);

  // Verify by round-tripping (handles DST boundaries)
  const verify = utcToLocalParts(targetUtc.toISOString(), timezone);
  const [vh, vmin] = verify.time.split(":").map(Number);
  if (vh !== hour || vmin !== minute) {
    // DST transition - adjust by the drift
    const driftMs = ((hour - vh) * 60 + (minute - vmin)) * 60 * 1000;
    return new Date(targetUtc.getTime() + driftMs).toISOString();
  }

  return targetUtc.toISOString();
}

/**
 * Format a UTC timestamp for display in agency timezone.
 * Returns a human-friendly string like "Mar 15, 2026 9:00 AM"
 */
export function formatDateTimeInTz(
  isoUtc: string | null | undefined,
  timezone: string,
  options?: { dateOnly?: boolean; timeOnly?: boolean }
): string {
  if (!isoUtc) return "—";
  try {
    const d = new Date(isoUtc);
    if (options?.dateOnly) {
      return formatInTimezone(d, timezone, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (options?.timeOnly) {
      return formatInTimezone(d, timezone, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return formatInTimezone(d, timezone, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}
