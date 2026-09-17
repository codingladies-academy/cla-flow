import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { projects, properties, taskValues, tasks, users } from "@/db/schema";
import { generateIcsFeed, CalendarEvent } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flow.codingladies.org";

    // 1. Find person properties where this user is assigned
    const assignedTasks = await db
      .select({
        taskId: taskValues.taskId,
        value: taskValues.value,
      })
      .from(taskValues)
      .innerJoin(properties, eq(taskValues.propertyId, properties.id))
      .where(and(eq(properties.type, "person"), isNotNull(taskValues.value)));

    const taskIds = assignedTasks
      .filter((t) => {
        if (typeof t.value === "string") return t.value === user.id;
        if (Array.isArray(t.value)) return (t.value as string[]).includes(user.id);
        return false;
      })
      .map((t) => t.taskId);

    const events: CalendarEvent[] = [];

    if (taskIds.length > 0) {
      // Find date properties for these tasks
      const rows = await db
        .select({
          taskId: tasks.id,
          taskNumber: tasks.number,
          title: tasks.title,
          description: tasks.description,
          projectId: tasks.projectId,
          projectKey: projects.key,
          projectName: projects.name,
          propertyName: properties.name,
          value: taskValues.value,
        })
        .from(taskValues)
        .innerJoin(tasks, eq(taskValues.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .innerJoin(properties, eq(taskValues.propertyId, properties.id))
        .where(and(eq(properties.type, "date"), isNotNull(taskValues.value)));

      const assignedSet = new Set(taskIds);
      for (const row of rows) {
        if (!assignedSet.has(row.taskId)) continue;
        const dateVal = row.value as string;
        if (!dateVal) continue;

        const fullKey = `${row.projectKey}-${row.taskNumber}`;
        events.push({
          id: `${row.taskId}-${row.propertyName}`,
          title: `[${fullKey}] ${row.title} (${row.propertyName})`,
          description: `Project: ${row.projectName}\n\n${row.description || ""}`.trim(),
          url: `${appUrl}/p/${row.projectId}?task=${row.taskId}`,
          startDate: dateVal,
          allDay: true,
        });
      }
    }

    const icsContent = generateIcsFeed({
      name: `My Tasks - ${user.name} (CLA Flow)`,
      description: `Personal task deadlines for ${user.name}`,
      events,
    });

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="my-tasks-calendar.ics"',
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Failed to generate my-tasks calendar feed:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
