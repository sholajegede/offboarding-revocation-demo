import { ConvexHttpClient } from "convex/browser";
import { convexUrl } from "./env";

let client: ConvexHttpClient | null = null;

export function convex(): ConvexHttpClient {
  if (client === null) {
    client = new ConvexHttpClient(convexUrl());
  }
  return client;
}
