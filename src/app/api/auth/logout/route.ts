import { NextResponse } from "next/server";
import { kindeConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const { issuerUrl, clientId, postLogoutRedirectUri } = kindeConfig();

  const logoutUrl = new URL(`${issuerUrl}/logout`);
  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set("redirect", postLogoutRedirectUri);

  const response = NextResponse.redirect(logoutUrl);
  response.cookies.delete("session");
  return response;
}
