/**
 * Helpers for Google Calendar 1-Click integration and RFC 5545 iCalendar (.ics) generation.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  startDate: Date | string;
  endDate?: Date | string;
  allDay?: boolean;
  status?: string;
};

/**
 * Format a Date object to iCalendar ISO 8601 string (UTC) (e.g. 20260917T120000Z or 20260917).
 */
export function formatIcsDate(date: Date, allDay = false): string {
  if (allDay) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Generates a 1-click direct "Add to Google Calendar" web intent URL.
 * Works seamlessly in all browsers with zero API keys or configuration.
 */
export function createGoogleCalendarUrl(event: {
  title: string;
  description?: string;
  url?: string;
  startDate: Date | string;
  endDate?: Date | string;
  allDay?: boolean;
}): string {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + 60 * 60 * 1000);

  const startFormatted = formatIcsDate(start, event.allDay);
  const endFormatted = formatIcsDate(end, event.allDay);

  let details = event.description || "";
  if (event.url) {
    details += `\n\nTask Link: ${event.url}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${startFormatted}/${endFormatted}`,
    details: details.trim(),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates a standard RFC 5545 iCalendar (.ics) string.
 * Compatible with Google Calendar, Apple Calendar, Outlook, and webcal:// feeds.
 */
export function generateIcsFeed({
  name,
  description,
  events,
}: {
  name: string;
  description?: string;
  events: CalendarEvent[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coding Ladies Academy//CLA Flow//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(name)}`,
  ];

  if (description) {
    lines.push(`X-WR-CALDESC:${escapeIcsText(description)}`);
  }

  for (const evt of events) {
    const start = new Date(evt.startDate);
    if (isNaN(start.getTime())) continue;

    const end = evt.endDate ? new Date(evt.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
    const isAllDay = evt.allDay ?? true;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:cla-flow-${evt.id}@flow.codingladies.org`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(start, true)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(end, true)}`);
    } else {
      lines.push(`DTSTART:${formatIcsDate(start, false)}`);
      lines.push(`DTEND:${formatIcsDate(end, false)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(evt.title)}`);

    let details = evt.description || "";
    if (evt.url) {
      details += `\n\nView Task: ${evt.url}`;
      lines.push(`URL:${evt.url}`);
    }
    if (details) {
      lines.push(`DESCRIPTION:${escapeIcsText(details)}`);
    }

    if (evt.status) {
      lines.push(`STATUS:${evt.status.toUpperCase() === "DONE" ? "COMPLETED" : "CONFIRMED"}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
