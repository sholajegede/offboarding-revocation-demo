import Anthropic from "@anthropic-ai/sdk";
import { anthropicConfig } from "./env";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (client === undefined) {
    client = new Anthropic({ apiKey: anthropicConfig().apiKey });
  }
  return client;
}
