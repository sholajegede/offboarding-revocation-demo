import { NextResponse } from "next/server";
import { configPresence, enforcementMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "offboarding-revocation-demo",
    enforcementMode: enforcementMode(),
    config: configPresence(),
    time: new Date().toISOString(),
  });
}
