import { describe, expect, it } from "vitest";
import { WebhookEventType, type WebhookEvent } from "@kinde/webhooks";
import { classifyOffboarding, extractKindeUserId } from "../src/lib/kinde-webhook";

const base = {
  event_id: "evt_123",
  source: "admin" as const,
  timestamp: "2026-09-14T00:00:00.000Z",
};

const user = {
  email: "user@example.com",
  first_name: "Ada",
  id: "kp_abc123",
  is_password_reset_requested: false,
  is_suspended: false,
  last_name: "Lovelace",
  organizations: [],
  phone: null,
  username: "ada",
};

function userUpdatedEvent(isSuspended: boolean): WebhookEvent {
  return {
    ...base,
    type: WebhookEventType.userUpdated,
    data: { user: { ...user, is_suspended: isSuspended } },
  };
}

function userDeletedEvent(): WebhookEvent {
  return {
    ...base,
    type: WebhookEventType.userDeleted,
    data: { user: { id: user.id } },
  };
}

function organizationDeletedEvent(): WebhookEvent {
  return {
    ...base,
    type: WebhookEventType.organizationDeleted,
    data: { organization: { code: "org_123" } },
  };
}

describe("classifyOffboarding", () => {
  it("treats user.deleted as offboarding", () => {
    expect(classifyOffboarding(userDeletedEvent())).toEqual({
      offboarding: true,
      reason: "user.deleted",
    });
  });

  it("treats user.updated with is_suspended true as offboarding", () => {
    expect(classifyOffboarding(userUpdatedEvent(true))).toEqual({
      offboarding: true,
      reason: "user.updated:is_suspended",
    });
  });

  it("does not treat user.updated with is_suspended false as offboarding", () => {
    expect(classifyOffboarding(userUpdatedEvent(false)).offboarding).toBe(false);
  });

  it("does not treat unrelated events as offboarding", () => {
    expect(classifyOffboarding(organizationDeletedEvent()).offboarding).toBe(
      false,
    );
  });
});

describe("extractKindeUserId", () => {
  it("reads the id from a user event", () => {
    expect(extractKindeUserId(userUpdatedEvent(true))).toBe(user.id);
    expect(extractKindeUserId(userDeletedEvent())).toBe(user.id);
  });

  it("returns undefined for an event with no single user", () => {
    expect(extractKindeUserId(organizationDeletedEvent())).toBeUndefined();
  });
});
