import { createHash } from "node:crypto";

export function buildSubjectKey(name: string, index: number): string {
  return createHash("sha256")
    .update(`${name.trim().toLowerCase()}:${index}`)
    .digest("hex")
    .slice(0, 16);
}
