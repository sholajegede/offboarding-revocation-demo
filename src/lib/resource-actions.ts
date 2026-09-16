import { api } from "../../convex/_generated/api";
import { convex } from "./convex-server";
import type { ActionName } from "./action-registry";
import { requireResourceId } from "./agent-arguments";

/**
 * Runs one already-allowed action against the resource store. The seam
 * decides whether an action may run at all; this only decides how to run
 * it, so it never re-checks the caller's status.
 */
export async function executeResourceAction(
  action: ActionName,
  args: Record<string, unknown>,
  actingUserId: string,
): Promise<unknown> {
  switch (action) {
    case "list_resources":
      return await convex().query(api.resources.listByOwner, {
        ownerUserId: actingUserId,
      });
    case "read_resource":
      return await convex().query(api.resources.get, {
        resourceId: requireResourceId(args),
      });
    case "write_resource":
      return await convex().mutation(api.resources.update, {
        resourceId: requireResourceId(args),
        title: typeof args.title === "string" ? args.title : undefined,
        body: typeof args.body === "string" ? args.body : undefined,
        updatedByUserId: actingUserId,
      });
  }
}
