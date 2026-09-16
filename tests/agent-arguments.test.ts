import { describe, expect, it } from "vitest";
import {
  normalizeToolInput,
  optionalResourceId,
  requireResourceId,
} from "../src/lib/agent-arguments";

describe("normalizeToolInput", () => {
  it("passes a plain object through", () => {
    expect(normalizeToolInput({ resourceId: "abc", title: "New" })).toEqual({
      resourceId: "abc",
      title: "New",
    });
  });

  it("returns an empty object for an array", () => {
    expect(normalizeToolInput([1, 2, 3])).toEqual({});
  });

  it("returns an empty object for null or a primitive", () => {
    expect(normalizeToolInput(null)).toEqual({});
    expect(normalizeToolInput(5)).toEqual({});
    expect(normalizeToolInput("hello")).toEqual({});
    expect(normalizeToolInput(undefined)).toEqual({});
  });
});

describe("requireResourceId", () => {
  it("returns the resourceId when present", () => {
    expect(requireResourceId({ resourceId: "abc" })).toBe("abc");
  });

  it("throws when resourceId is missing", () => {
    expect(() => requireResourceId({})).toThrow("resourceId required");
  });

  it("throws when resourceId is empty", () => {
    expect(() => requireResourceId({ resourceId: "" })).toThrow("resourceId required");
  });

  it("throws when resourceId is not a string", () => {
    expect(() => requireResourceId({ resourceId: 5 })).toThrow("resourceId required");
  });
});

describe("optionalResourceId", () => {
  it("returns the resourceId string when present", () => {
    expect(optionalResourceId({ resourceId: "abc" })).toBe("abc");
  });

  it("returns undefined when absent or not a string", () => {
    expect(optionalResourceId({})).toBeUndefined();
    expect(optionalResourceId({ resourceId: 5 })).toBeUndefined();
  });
});
