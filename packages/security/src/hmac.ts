import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify Meta's X-Hub-Signature-256 ("sha256=<hex>") over the exact raw bytes. */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function signMetaBody(rawBody: Buffer, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}
