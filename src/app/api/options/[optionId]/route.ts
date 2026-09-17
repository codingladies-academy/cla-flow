import { and, eq, ne, sql } from "drizzle-orm";
import { byPos } from "@/lib/order";
import { db } from "@/db";
import { propertyOptions, taskValues } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { body, broadcast, clientIdOf, guard, json, ownerOnly, route, str } from "@/lib/api";
import { optionPropertyId, withProjectLock } from "@/lib/queries";
import { rankBetween } from "@/lib/rank";

type Ctx = { params: Promise<{ optionId: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const { optionId } = await ctx.params;
  const owner = await optionPropertyId(optionId);
  if (!owner) throw new HttpError(404, "Option not found.");
  await guard(owner.projectId);

  const input = await body<{ name?: string; color?: string; afterId?: string | null }>(req);
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) patch.name = str(input.name, "Option name", { max: 40 });
  if (input.color !== undefined) {
    if (typeof input.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.color)) {
      throw new HttpError(400, "The colour must look like #3fb0c8.");
    }
    patch.color = input.color;
  }
  if (input.afterId !== undefined) {
    await withProjectLock(owner.projectId, async (tx) => {
      const siblings = await tx
        .select({ id: propertyOptions.id, position: propertyOptions.position })
        .from(propertyOptions)
        .where(
          and(eq(propertyOptions.propertyId, owner.propertyId), ne(propertyOptions.id, optionId)),
        )
        .orderBy(byPos(propertyOptions.position));
      const index = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : -1;
      const before = index >= 0 ? siblings[index].position : null;
      const after = siblings[index + 1]?.position ?? null;
      await tx
        .update(propertyOptions)
        .set({ ...patch, position: rankBetween(before, after) })
        .where(eq(propertyOptions.id, optionId));
    });
    await broadcast({ projectId: owner.projectId, scope: "board", clientId: clientIdOf(req) });
    return json({ ok: true });
  }

  if (Object.keys(patch).length === 0) return json({ ok: true });

  await db.update(propertyOptions).set(patch).where(eq(propertyOptions.id, optionId));
  await broadcast({ projectId: owner.projectId, scope: "board", clientId: clientIdOf(req) });
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const { optionId } = await ctx.params;
  const owner = await optionPropertyId(optionId);
  if (!owner) throw new HttpError(404, "Option not found.");
  const { user, membership } = await guard(owner.projectId);
  ownerOnly(user, membership, "delete an option");

  // Query sibling options to find the previous column
  const siblings = await db
    .select({ id: propertyOptions.id, position: propertyOptions.position })
    .from(propertyOptions)
    .where(eq(propertyOptions.propertyId, owner.propertyId))
    .orderBy(byPos(propertyOptions.position));

  const targetIndex = siblings.findIndex((s) => s.id === optionId);
  const fallbackOptionId =
    targetIndex > 0
      ? siblings[targetIndex - 1].id
      : siblings.length > 1
        ? siblings[targetIndex + 1]?.id ?? null
        : null;

  if (fallbackOptionId) {
    // Reassign single-select tasks to the previous (fallback) column
    await db
      .update(taskValues)
      .set({ value: JSON.stringify(fallbackOptionId) })
      .where(
        and(
          eq(taskValues.propertyId, owner.propertyId),
          sql`${taskValues.value} = ${JSON.stringify(optionId)}::jsonb`,
        ),
      );

    // In multi-selects, replace the deleted option with fallbackOptionId if not already present
    await db
      .update(taskValues)
      .set({
        value: sql`(
          select coalesce(
            jsonb_agg(distinct elem),
            '[]'::jsonb
          )
          from (
            select case when elem = ${JSON.stringify(optionId)}::jsonb then ${JSON.stringify(fallbackOptionId)}::jsonb else elem end as elem
            from jsonb_array_elements(${taskValues.value}) elem
          ) s
        )`,
      })
      .where(
        and(
          eq(taskValues.propertyId, owner.propertyId),
          sql`jsonb_typeof(${taskValues.value}) = 'array'`,
          sql`${taskValues.value} @> ${JSON.stringify([optionId])}::jsonb`,
        ),
      );
  } else {
    // If no other options exist in this property, clear the values
    await db
      .update(taskValues)
      .set({ value: null })
      .where(
        and(
          eq(taskValues.propertyId, owner.propertyId),
          sql`${taskValues.value} = ${JSON.stringify(optionId)}::jsonb`,
        ),
      );
    await db
      .update(taskValues)
      .set({
        value: sql`(select coalesce(jsonb_agg(elem), '[]'::jsonb) from jsonb_array_elements(${taskValues.value}) elem where elem <> ${JSON.stringify(optionId)}::jsonb)`,
      })
      .where(
        and(
          eq(taskValues.propertyId, owner.propertyId),
          sql`jsonb_typeof(${taskValues.value}) = 'array'`,
          sql`${taskValues.value} @> ${JSON.stringify([optionId])}::jsonb`,
        ),
      );
  }

  await db.delete(propertyOptions).where(eq(propertyOptions.id, optionId));
  await broadcast({ projectId: owner.projectId, scope: "board", clientId: clientIdOf(req) });
  return json({ ok: true });
});
