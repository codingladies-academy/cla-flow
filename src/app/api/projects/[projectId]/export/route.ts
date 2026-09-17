import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  projects,
  properties,
  propertyOptions,
  taskValues,
  tasks,
  users,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await props.params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return new NextResponse("Project not found", { status: 404 });
    }

    // 1. Fetch properties
    const propList = await db
      .select()
      .from(properties)
      .where(eq(properties.projectId, projectId));

    // Map option IDs to labels
    const allOptions = await db.select().from(propertyOptions);
    const optionMap = new Map<string, string>();
    for (const opt of allOptions) {
      optionMap.set(opt.id, opt.name);
    }

    // Map user IDs to names
    const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
    const userMap = new Map<string, string>();
    for (const u of allUsers) {
      userMap.set(u.id, u.name);
    }

    // 2. Fetch all tasks for this project
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    // 3. Fetch task values
    const values = await db.select().from(taskValues);
    const valuesByTask = new Map<string, Map<string, any>>();
    for (const v of values) {
      if (!valuesByTask.has(v.taskId)) {
        valuesByTask.set(v.taskId, new Map());
      }
      valuesByTask.get(v.taskId)!.set(v.propertyId, v);
    }

    // 4. Construct tabular data
    const rows = projectTasks.map((t) => {
      const row: Record<string, any> = {
        Key: `${project.key}-${t.number}`,
        Title: t.title,
        Description: t.description || "",
        CreatedAt: t.createdAt ? new Date(t.createdAt).toISOString() : "",
      };

      const taskValMap = valuesByTask.get(t.id);

      for (const p of propList) {
        const valObj = taskValMap?.get(p.id);
        const val = valObj?.value;
        let displayVal = "";

        if (val !== undefined && val !== null) {
          if (p.type === "select" && typeof val === "string") {
            displayVal = optionMap.get(val) || val;
          } else if (p.type === "person" && typeof val === "string") {
            displayVal = userMap.get(val) || val;
          } else if (p.type === "date" && typeof val === "string") {
            displayVal = val;
          } else if (p.type === "number") {
            displayVal = String(val);
          } else if (p.type === "checkbox") {
            displayVal = val ? "TRUE" : "FALSE";
          } else if (p.type === "multi_select" && Array.isArray(val)) {
            displayVal = val
              .map((optId: string) => optionMap.get(optId) || optId)
              .join(", ");
          } else if (typeof val === "string") {
            displayVal = val;
          } else {
            displayVal = JSON.stringify(val);
          }
        }

        row[p.name] = displayVal;
      }

      return row;
    });

    if (format === "json") {
      return NextResponse.json({
        project: { id: project.id, name: project.name, key: project.key },
        columns: ["Key", "Title", "Description", "CreatedAt", ...propList.map((p) => p.name)],
        data: rows,
      });
    }

    // Default: CSV export
    const headers = ["Key", "Title", "Description", "CreatedAt", ...propList.map((p) => p.name)];
    const csvLines: string[] = [];

    // Header line
    csvLines.push(headers.map(escapeCsv).join(","));

    // Data rows
    for (const r of rows) {
      const line = headers.map((h) => escapeCsv(r[h] ?? ""));
      csvLines.push(line.join(","));
    }

    const csvOutput = "\uFEFF" + csvLines.join("\r\n"); // UTF-8 BOM for Excel / Google Sheets

    return new NextResponse(csvOutput, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${project.key}-tasks-export.csv"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return new NextResponse("Failed to export project data", { status: 500 });
  }
}

function escapeCsv(val: any): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
