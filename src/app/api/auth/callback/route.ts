import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { convex } from "@/lib/convex-server";
import { appConfig, kindeConfig } from "@/lib/env";
import { verifyKindeToken } from "@/lib/kinde-token";
import { encodeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type TokenResponse = {
  access_token: string;
  id_token: string;
  expires_in: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((entry) => entry.startsWith("kinde_oauth_state="))
    ?.slice("kinde_oauth_state=".length);

  if (code === null || state === null || state !== cookieState) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }

  const { issuerUrl, clientId, clientSecret, redirectUri } = kindeConfig();

  const tokenResponse = await fetch(`${issuerUrl}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "token exchange failed" }, { status: 502 });
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;
  const idClaims = await verifyKindeToken(tokens.id_token);
  const kindeUserId = idClaims.sub;
  if (kindeUserId === undefined) {
    return NextResponse.json({ error: "id token carries no sub" }, { status: 502 });
  }

  await convex().mutation(api.users.upsert, {
    kindeUserId,
    email: typeof idClaims.email === "string" ? idClaims.email : undefined,
    name: typeof idClaims.name === "string" ? idClaims.name : undefined,
  });
  await convex().mutation(api.resources.seedForOwner, { ownerUserId: kindeUserId });

  const sessionToken = await encodeSession(
    { kindeUserId, accessToken: tokens.access_token, idToken: tokens.id_token },
    tokens.expires_in,
  );

  const response = NextResponse.redirect(appConfig().siteUrl);
  response.cookies.set("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });
  response.cookies.delete("kinde_oauth_state");
  return response;
}
