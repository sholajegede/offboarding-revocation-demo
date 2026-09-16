import { describe, expect, it } from "vitest";
import { decideAccess } from "../src/lib/access-decision";

describe("decideAccess", () => {
  it("naive allows an offboarded user through", () => {
    expect(decideAccess({ mode: "naive", userStatus: "offboarded" })).toEqual({
      decision: "allow",
      reason: "naive_mode_no_check",
    });
  });

  it("naive allows regardless of status, including unknown", () => {
    expect(decideAccess({ mode: "naive", userStatus: "unknown" }).decision).toBe(
      "allow",
    );
  });

  it("enforced allows an active user", () => {
    expect(decideAccess({ mode: "enforced", userStatus: "active" })).toEqual({
      decision: "allow",
      reason: "user_active",
    });
  });

  it("enforced refuses an offboarded user", () => {
    expect(decideAccess({ mode: "enforced", userStatus: "offboarded" })).toEqual(
      {
        decision: "refuse",
        reason: "user_offboarded",
      },
    );
  });

  it("enforced fails closed on an unresolvable status", () => {
    expect(decideAccess({ mode: "enforced", userStatus: "unknown" })).toEqual({
      decision: "refuse",
      reason: "user_unknown",
    });
  });
});
