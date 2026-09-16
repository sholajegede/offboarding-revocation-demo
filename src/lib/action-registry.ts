/**
 * The closed set of actions an agent may take on internal resources.
 *
 * Closed means exactly this: an action not listed here cannot be invoked, by
 * construction, not by convention. Both the Claude tool schema and the
 * enforcement seam are built from this one table, so the two can never drift
 * apart from each other.
 */

export type ActionName = "list_resources" | "read_resource" | "write_resource";

export type ActionParamSpec = {
  type: "string" | "number";
  required: boolean;
  description: string;
};

export type ActionDefinition = {
  name: ActionName;
  description: string;
  destructive: boolean;
  params: Record<string, ActionParamSpec>;
};

export const ACTION_REGISTRY: Record<ActionName, ActionDefinition> = {
  list_resources: {
    name: "list_resources",
    description: "List the internal resources owned by the acting user.",
    destructive: false,
    params: {},
  },
  read_resource: {
    name: "read_resource",
    description: "Read one internal resource by id.",
    destructive: false,
    params: {
      resourceId: {
        type: "string",
        required: true,
        description: "The resource id to read.",
      },
    },
  },
  write_resource: {
    name: "write_resource",
    description: "Update the title and/or body of one internal resource.",
    destructive: true,
    params: {
      resourceId: {
        type: "string",
        required: true,
        description: "The resource id to update.",
      },
      title: {
        type: "string",
        required: false,
        description: "New title, when changed.",
      },
      body: {
        type: "string",
        required: false,
        description: "New body, when changed.",
      },
    },
  },
};

export function isRegisteredAction(name: string): name is ActionName {
  return Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, name);
}

export function getAction(name: string): ActionDefinition | undefined {
  return isRegisteredAction(name) ? ACTION_REGISTRY[name] : undefined;
}

export function listActionNames(): ActionName[] {
  return Object.keys(ACTION_REGISTRY) as ActionName[];
}

/** Renders the registry as Claude Messages API tool definitions. */
export function toAnthropicTools() {
  return listActionNames().map((name) => {
    const action = ACTION_REGISTRY[name];
    const required = Object.entries(action.params)
      .filter(([, spec]) => spec.required)
      .map(([key]) => key);
    return {
      name: action.name,
      description: action.description,
      input_schema: {
        type: "object" as const,
        properties: Object.fromEntries(
          Object.entries(action.params).map(([key, spec]) => [
            key,
            { type: spec.type, description: spec.description },
          ]),
        ),
        required,
        additionalProperties: false,
      },
    };
  });
}
