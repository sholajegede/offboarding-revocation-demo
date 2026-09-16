import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { kindeIssuerUrl } from "./env";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwksForIssuer() {
  if (jwks === null) {
    jwks = createRemoteJWKSet(new URL(`${kindeIssuerUrl()}/.well-known/jwks`));
  }
  return jwks;
}

/** Verifies a Kinde-issued access or ID token against the live JWKS. */
export async function verifyKindeToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwksForIssuer(), {
    issuer: kindeIssuerUrl(),
  });
  return payload;
}
