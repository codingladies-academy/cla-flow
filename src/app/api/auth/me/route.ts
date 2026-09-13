import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { HttpError, requireUser } from "@/lib/auth";
import { body, json, route, str } from "@/lib/api";
import { AVATAR_COLORS } from "@/lib/colors";

/**
 * Your own name and colour. Both used to be written once at registration and
 * never again, so a typo in either was permanent and an avatar colour that
 * clashed with a teammate's stayed clashed.
 */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();

  const input = await body<{ name?: string; color?: string; photoUrl?: string | null }>(req);
  const patch: { name?: string; color?: string; photoUrl?: string | null } = {};

  if (input.name !== undefined) patch.name = str(input.name, "Name", { max: 80 });

  if (input.color !== undefined) {
    const color = str(input.color, "Colour", { max: 7 }).toLowerCase();
    // The palette is the palette. A free colour picker is how the board ends
    // up with a person nobody can see against the background.
    if (!(AVATAR_COLORS as readonly string[]).includes(color)) {
      throw new HttpError(400, "Pick one of the colours on offer.");
    }
    patch.color = color;
  }

  if (input.photoUrl !== undefined) {
    if (input.photoUrl === null || input.photoUrl === "") {
      patch.photoUrl = null;
    } else {
      const url = str(input.photoUrl, "Photo URL", { max: 500 });
      if (!url.startsWith("https://")) {
        throw new HttpError(400, "Photo URL must start with https://");
      }
      patch.photoUrl = url;
    }
  }

  if (Object.keys(patch).length === 0) return json({ ok: true });

  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, user.id))
    .returning({ id: users.id, name: users.name, color: users.color, email: users.email, photoUrl: users.photoUrl });

  return json({ user: { ...row, email: row.email ?? "", photoUrl: row.photoUrl ?? null } });
});
