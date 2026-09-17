import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, properties, taskValues, tasks } from "@/db/schema";
import { generateIcsFeed, CalendarEvent } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await props.params;

    const [project] = await db
      .select({ id: projects.id, name: projects.name, key: projects.key })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return new NextResponse("Project not found", { status: 404 });
    }

    // Find date properties for this project
    const dateProperties = await db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(and(eq(properties.projectId, projectId), eq(properties.type, "date")));

    const events: CalendarEvent[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flow.codingladies.org";

    if (dateProperties.length > 0) {
      for (const prop of dateProperties) {
        const rows = await db
          .select({
            taskId: tasks.id,
            taskNumber: tasks.number,
            title: tasks.title,
            description: tasks.description,
            value: taskValues.value,
          })
          .from(taskValues)
          .innerJoin(tasks, eq(taskValues.taskId, tasks.id))
          .where(and(eq(taskValues.propertyId, prop.id), isNotNull(taskValues.value)));

        for (const row of rows) {
          const dateVal = row.value as string;
          if (!dateVal) continue;
          const fullKey = `${project.key}-${row.taskNumber}`;
          events.push({
            id: `${row.taskId}-${prop.id}`,
            title: `[${fullKey}] ${row.title} (${prop.name})`,
            description: row.description || undefined,
            url: `${appUrl}/p/${project.id}?task=${row.taskId}`,
            startDate: dateVal,
            allDay: true,
          });
        }
      }
    }

    const icsContent = generateIcsFeed({
      name: `${project.name} (CLA Flow)`,
      description: `Task schedule and deadlines for ${project.name}`,
      events,
    });

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${project.key}-calendar.ics"`,
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Failed to generate calendar feed:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
