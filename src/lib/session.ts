import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { sessionSecret } from "./env";

export type SessionPayload = {
  kindeUserId: string;
  accessToken: string;
  idToken: string;
};

/** SESSION_SECRET, hashed down to the 32 bytes A256GCM needs. */
function encryptionKey(): Uint8Array {
  return createHash("sha256").update(sessionSecret()).digest();
}

export async function encodeSession(
  payload: SessionPayload,
  expiresInSeconds: number,
): Promise<string> {
  return await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .encrypt(encryptionKey());
}

/** Never throws. A tampered or expired cookie is just no session. */
export async function decodeSession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(token, encryptionKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function readSessionCookie(request: Request): string | undefined {
  const raw = request.headers
    .get("cookie")
    ?.split("; ")
    .find((entry) => entry.startsWith("session="));
  return raw === undefined ? undefined : decodeURIComponent(raw.slice("session=".length));
}
