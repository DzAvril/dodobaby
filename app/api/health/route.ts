import { NextResponse } from "next/server";
import { checkDatabase } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    checkDatabase();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
