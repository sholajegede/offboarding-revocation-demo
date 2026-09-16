import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { kindeConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const { issuerUrl, clientId, redirectUri } = kindeConfig();
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL(`${issuerUrl}/oauth2/auth`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email offline");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("kinde_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
