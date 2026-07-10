import { redirect } from "next/navigation";
import { DiaryApp } from "@/components/DiaryApp";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <DiaryApp />;
}
