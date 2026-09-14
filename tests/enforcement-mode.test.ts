import { afterEach, describe, expect, it } from "vitest";
import { enforcementMode } from "../src/lib/env";

const ORIGINAL = process.env.ENFORCEMENT_MODE;

describe("enforcementMode", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ENFORCEMENT_MODE;
    else process.env.ENFORCEMENT_MODE = ORIGINAL;
  });

  it("resolves to enforced when unset", () => {
    delete process.env.ENFORCEMENT_MODE;
    expect(enforcementMode()).toBe("enforced");
  });

  it("resolves to naive only for the exact value naive", () => {
    process.env.ENFORCEMENT_MODE = "naive";
    expect(enforcementMode()).toBe("naive");
  });

  it("is case-insensitive for the naive value", () => {
    process.env.ENFORCEMENT_MODE = "NAIVE";
    expect(enforcementMode()).toBe("naive");
  });

  it("fails safe to enforced on a typo", () => {
    process.env.ENFORCEMENT_MODE = "niave";
    expect(enforcementMode()).toBe("enforced");
  });

  it("fails safe to enforced on an empty string", () => {
    process.env.ENFORCEMENT_MODE = "";
    expect(enforcementMode()).toBe("enforced");
  });

  it("fails safe to enforced on the literal string enforced", () => {
    process.env.ENFORCEMENT_MODE = "enforced";
    expect(enforcementMode()).toBe("enforced");
  });
});
