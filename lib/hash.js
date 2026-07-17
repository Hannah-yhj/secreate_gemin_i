import { createHash } from "crypto";

export function computeFileHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
