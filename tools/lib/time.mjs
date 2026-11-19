// Timestamps for logs and trackers: ISO 8601 with an explicit offset in the project's planning
// timezone (America/New_York per editorial/EDITORIAL_PLAYBOOK.md) plus the UTC instant.
export const PROJECT_TZ = 'America/New_York';

/** e.g. "2026-11-18T11:42:07-05:00" */
export function isoInZone(date = new Date(), timeZone = PROJECT_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** Human display, e.g. "Nov 18, 2026, 11:42 AM EST" (US conventions for the US-based founders). */
export function displayInZone(value, timeZone = PROJECT_TZ) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/** Display a date-only string or ISO timestamp as "Nov 18, 2026". */
export function displayDate(value) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
