import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  getAction,
  isRegisteredAction,
  listActionNames,
  toOpenAiTools,
} from "../src/lib/action-registry";

describe("action registry", () => {
  it("is closed: an unregistered name is rejected", () => {
    expect(isRegisteredAction("delete_resource")).toBe(false);
    expect(getAction("delete_resource")).toBeUndefined();
  });

  it("recognizes every registered action", () => {
    for (const name of listActionNames()) {
      expect(isRegisteredAction(name)).toBe(true);
      expect(getAction(name)).toBe(ACTION_REGISTRY[name]);
    }
  });

  it("marks write_resource as destructive and reads as safe", () => {
    expect(ACTION_REGISTRY.list_resources.destructive).toBe(false);
    expect(ACTION_REGISTRY.read_resource.destructive).toBe(false);
    expect(ACTION_REGISTRY.write_resource.destructive).toBe(true);
  });

  it("renders one OpenAI tool per registered action, required params only from required specs", () => {
    const tools = toOpenAiTools();
    expect(tools).toHaveLength(listActionNames().length);
    const writeTool = tools.find((tool) => tool.name === "write_resource");
    expect(writeTool?.parameters.required).toEqual(["resourceId"]);
    expect(writeTool?.parameters.additionalProperties).toBe(false);
  });
});
