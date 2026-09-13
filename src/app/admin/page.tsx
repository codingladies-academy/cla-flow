import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminPanel } from "./AdminPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · CLA Flow" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/projects");
  return <AdminPanel adminName={user.name} currentUserId={user.id} />;
}
