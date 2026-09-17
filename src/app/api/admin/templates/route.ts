import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/db";
import { projects, properties, propertyOptions, views, workspaces } from "@/db/schema";
import { DEFAULT_PROPERTIES, DEFAULT_VIEWS } from "@/lib/defaults";
import { and, eq, inArray, sql } from "drizzle-orm";
import { broadcast } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const wsList = await db
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .orderBy(workspaces.name);

    return NextResponse.json({
      defaultProperties: DEFAULT_PROPERTIES,
      defaultViews: DEFAULT_VIEWS,
      workspaces: wsList,
    });
  } catch (err) {
    console.error("Failed to load templates:", err);
    return NextResponse.json({ error: "Failed to load template data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      scope, // "global" | { workspaceId: string }
      propertyRenames = [], // Array<{ oldName: string; newName: string }>
      optionRenames = [], // Array<{ propertyName: string; oldName: string; newName: string; color?: string }>
      viewRenames = [], // Array<{ oldName: string; newName: string }>
    } = body as {
      scope: "global" | { workspaceId: string };
      propertyRenames?: Array<{ oldName: string; newName: string }>;
      optionRenames?: Array<{ propertyName: string; oldName: string; newName: string; color?: string }>;
      viewRenames?: Array<{ oldName: string; newName: string }>;
    };

    // Determine target projects
    let targetProjects: Array<{ id: string }> = [];
    if (scope === "global") {
      targetProjects = await db.select({ id: projects.id }).from(projects);
    } else if (scope && typeof scope === "object" && scope.workspaceId) {
      targetProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.workspaceId, scope.workspaceId));
    } else {
      return NextResponse.json({ error: "Invalid scope specified" }, { status: 400 });
    }

    if (targetProjects.length === 0) {
      return NextResponse.json({ ok: true, message: "No matching projects found", count: 0 });
    }

    const projectIds = targetProjects.map((p) => p.id);

    await db.transaction(async (tx) => {
      // 1. Rename properties
      for (const pRename of propertyRenames) {
        if (!pRename.oldName || !pRename.newName || pRename.oldName.trim() === pRename.newName.trim()) continue;
        await tx
          .update(properties)
          .set({ name: pRename.newName.trim() })
          .where(
            and(
              inArray(properties.projectId, projectIds),
              sql`lower(${properties.name}) = lower(${pRename.oldName.trim()})`,
            ),
          );
      }

      // 2. Rename options in matching properties
      for (const optRename of optionRenames) {
        if (!optRename.oldName || !optRename.newName) continue;
        const matchingProps = await tx
          .select({ id: properties.id })
          .from(properties)
          .where(
            and(
              inArray(properties.projectId, projectIds),
              optRename.propertyName
                ? sql`lower(${properties.name}) = lower(${optRename.propertyName.trim()})`
                : sql`true`,
            ),
          );

        if (matchingProps.length > 0) {
          const propIds = matchingProps.map((p) => p.id);
          const updatePayload: Record<string, unknown> = { name: optRename.newName.trim() };
          if (optRename.color) {
            updatePayload.color = optRename.color;
          }

          await tx
            .update(propertyOptions)
            .set(updatePayload)
            .where(
              and(
                inArray(propertyOptions.propertyId, propIds),
                sql`lower(${propertyOptions.name}) = lower(${optRename.oldName.trim()})`,
              ),
            );
        }
      }

      // 3. Rename views
      for (const vRename of viewRenames) {
        if (!vRename.oldName || !vRename.newName || vRename.oldName.trim() === vRename.newName.trim()) continue;
        await tx
          .update(views)
          .set({ name: vRename.newName.trim() })
          .where(
            and(
              inArray(views.projectId, projectIds),
              sql`lower(${views.name}) = lower(${vRename.oldName.trim()})`,
            ),
          );
      }
    });

    // Broadcast board reload to all affected projects in real time
    for (const pid of projectIds) {
      void broadcast({ projectId: pid, scope: "board" });
    }

    return NextResponse.json({
      ok: true,
      updatedProjectsCount: projectIds.length,
      message: `Successfully synchronized property & view terminology across ${projectIds.length} project(s). Task data remains 100% intact.`,
    });
  } catch (err) {
    console.error("Failed to sync project templates:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync templates" },
      { status: 500 },
    );
  }
}
