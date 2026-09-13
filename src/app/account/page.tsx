import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { Account } from "@/components/account/Account";
import { version } from "../../../package.json";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account · CLA Flow" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Account user={{ ...user, photoUrl: user.photoUrl }} version={version} isAdmin={isAdmin(user)} />;
}
