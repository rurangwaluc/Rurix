import { randomUUID } from "node:crypto";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createIdempotencyKey(prefix = "evt") {
  return `${prefix}_${randomUUID()}`;
}
