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

const STANDARD_PROPERTY_MAP: Record<string, string> = {
  phase: "Stage",
  labels: "Category",
  estimate: "Scope",
  due: "Due Date",
};

const STANDARD_OPTION_MAP: Record<string, { newName: string; color?: string }> = {
  // Status
  todo: { newName: "To Do" },
  ready: { newName: "Review" },
  shipped: { newName: "Done" },
  completed: { newName: "Done" },
  // Phase / Stage
  poc: { newName: "Planning" },
  mvp: { newName: "Execution" },
  mmp: { newName: "Monitoring" },
  pilot: { newName: "Review" },
  ga: { newName: "Completed" },
  // Scope / Estimate
  xs: { newName: "Small" },
  s: { newName: "Small" },
  m: { newName: "Medium" },
  l: { newName: "Large" },
  xl: { newName: "Large" },
  // Category / Labels
  bug: { newName: "Operations", color: "#2f9e7a" },
  feature: { newName: "Logistics", color: "#4b8fbe" },
  infra: { newName: "Training", color: "#6d5bd0" },
  ux: { newName: "Communications", color: "#c2557a" },
  docs: { newName: "Finance", color: "#d1913a" },
};

const STANDARD_VIEW_MAP: Record<string, string> = {
  board: "Task Board",
  phases: "Stages",
};

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
      applyStandardCla = true,
    } = body as {
      scope: "global" | { workspaceId: string };
      propertyRenames?: Array<{ oldName: string; newName: string }>;
      optionRenames?: Array<{ propertyName: string; oldName: string; newName: string; color?: string }>;
      viewRenames?: Array<{ oldName: string; newName: string }>;
      applyStandardCla?: boolean;
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
      // 1. Apply standard CLA terminology if enabled
      if (applyStandardCla) {
        for (const [oldProp, newProp] of Object.entries(STANDARD_PROPERTY_MAP)) {
          await tx
            .update(properties)
            .set({ name: newProp })
            .where(
              and(
                inArray(properties.projectId, projectIds),
                sql`lower(${properties.name}) = ${oldProp.toLowerCase()}`,
              ),
            );
        }

        const allProjectProps = await tx
          .select({ id: properties.id })
          .from(properties)
          .where(inArray(properties.projectId, projectIds));

        if (allProjectProps.length > 0) {
          const allPropIds = allProjectProps.map((p) => p.id);
          for (const [oldOpt, optInfo] of Object.entries(STANDARD_OPTION_MAP)) {
            const updateData: Record<string, unknown> = { name: optInfo.newName };
            if (optInfo.color) updateData.color = optInfo.color;
            await tx
              .update(propertyOptions)
              .set(updateData)
              .where(
                and(
                  inArray(propertyOptions.propertyId, allPropIds),
                  sql`lower(${propertyOptions.name}) = ${oldOpt.toLowerCase()}`,
                ),
              );
          }
        }

        for (const [oldView, newView] of Object.entries(STANDARD_VIEW_MAP)) {
          await tx
            .update(views)
            .set({ name: newView })
            .where(
              and(
                inArray(views.projectId, projectIds),
                sql`lower(${views.name}) = ${oldView.toLowerCase()}`,
              ),
            );
        }
      }

      // 2. Apply any custom property renames
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

      // 3. Apply any custom option renames
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

      // 4. Apply any custom view renames
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
      message: `Successfully updated property, column, and view terminology across ${projectIds.length} project(s). Task data remains 100% intact.`,
    });
  } catch (err) {
    console.error("Failed to sync project templates:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync templates" },
      { status: 500 },
    );
  }
}
