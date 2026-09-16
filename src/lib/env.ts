export type EnforcementMode = "naive" | "enforced";

class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
    this.name = "MissingEnvError";
  }
}

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "src/lib/env.ts was imported into client code. Server configuration must never reach the browser.",
    );
  }
}

function required(name: string): string {
  assertServer();
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new MissingEnvError(name);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  assertServer();
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

/**
 * Only the exact value "naive" selects the hole. Anything else — unset, a
 * typo, "enforced" — resolves to enforced. The browser and the agent never
 * see this function; it is never NEXT_PUBLIC_ and never read from a request.
 */
export function enforcementMode(): EnforcementMode {
  assertServer();
  return optional("ENFORCEMENT_MODE", "enforced").toLowerCase() === "naive"
    ? "naive"
    : "enforced";
}

/** Issuer origin, e.g. https://<subdomain>.kinde.com — no trailing slash. */
export function kindeIssuerUrl(): string {
  assertServer();
  return required("KINDE_ISSUER_URL").replace(/\/+$/, "");
}

export function kindeConfig() {
  assertServer();
  return {
    issuerUrl: kindeIssuerUrl(),
    clientId: required("KINDE_CLIENT_ID"),
    clientSecret: required("KINDE_CLIENT_SECRET"),
    redirectUri: required("KINDE_REDIRECT_URI"),
    postLogoutRedirectUri: optional(
      "KINDE_POST_LOGOUT_REDIRECT_URI",
      appConfig().siteUrl,
    ),
  };
}

export function kindeM2mConfig() {
  assertServer();
  return {
    clientId: required("KINDE_M2M_CLIENT_ID"),
    clientSecret: required("KINDE_M2M_CLIENT_SECRET"),
  };
}

export function openaiConfig() {
  assertServer();
  return {
    apiKey: required("OPENAI_API_KEY"),
    model: required("OPENAI_MODEL"),
  };
}

export function appConfig() {
  assertServer();
  return {
    siteUrl: optional("APP_SITE_URL", "http://localhost:3000").replace(
      /\/+$/,
      "",
    ),
  };
}

export function sessionSecret(): string {
  const secret = required("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters. Generate one with `openssl rand -base64 32`.",
    );
  }
  return secret;
}

export function convexUrl(): string {
  return required("NEXT_PUBLIC_CONVEX_URL");
}

/** Reports which configuration groups are present, never a value. */
export function configPresence(): Record<string, boolean> {
  assertServer();
  const has = (name: string) => {
    const v = process.env[name];
    return typeof v === "string" && v.trim() !== "";
  };
  return {
    kinde:
      has("KINDE_ISSUER_URL") &&
      has("KINDE_CLIENT_ID") &&
      has("KINDE_CLIENT_SECRET") &&
      has("KINDE_REDIRECT_URI"),
    kindeM2m: has("KINDE_M2M_CLIENT_ID") && has("KINDE_M2M_CLIENT_SECRET"),
    kindeWebhook: has("KINDE_ISSUER_URL"),
    openai: has("OPENAI_API_KEY") && has("OPENAI_MODEL"),
    convex: has("NEXT_PUBLIC_CONVEX_URL"),
    session: has("SESSION_SECRET"),
  };
}
