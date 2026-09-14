import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listMyTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const tasks = await listMyTasks(user.id);
  return json({ tasks, count: tasks.length });
});
