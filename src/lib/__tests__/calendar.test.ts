import { describe, expect, it } from "vitest";
import { createGoogleCalendarUrl, generateIcsFeed } from "../calendar";

describe("Calendar Utilities", () => {
  it("creates a 1-click Google Calendar web intent URL", () => {
    const url = createGoogleCalendarUrl({
      title: "Deploy Production Release",
      description: "Finalize checklist and verify health checks",
      url: "https://flow.codingladies.org/p/123?task=456",
      startDate: new Date("2026-09-20T10:00:00Z"),
      allDay: true,
    });

    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Deploy+Production+Release");
    expect(url).toContain("20260920");
    expect(url).toContain("details=");
  });

  it("generates a valid RFC 5545 iCalendar feed", () => {
    const ics = generateIcsFeed({
      name: "Sprint 42",
      description: "Sprint tasks and deadlines",
      events: [
        {
          id: "task-1",
          title: "Setup Push Notifications",
          description: "Configure VAPID and web-push",
          startDate: new Date("2026-09-21T09:00:00Z"),
          url: "https://flow.codingladies.org/p/1?task=1",
          status: "done",
        },
      ],
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Sprint 42");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Setup Push Notifications");
    expect(ics).toContain("STATUS:COMPLETED");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });
});
