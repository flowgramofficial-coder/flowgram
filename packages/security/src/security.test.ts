import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalKeyProvider, decryptSecret, encryptSecret } from "./envelope.js";
import { signMetaBody, verifyMetaSignature } from "./hmac.js";
import { redactDeep } from "./redact.js";

const provider = new LocalKeyProvider(randomBytes(32).toString("base64"));

describe("envelope encryption", () => {
  it("round-trips", async () => {
    const s = await encryptSecret(provider, "IGQ-token", "acct-1");
    expect(await decryptSecret(provider, s, "acct-1")).toBe("IGQ-token");
  });
  it("uses a unique DEK and IV per record", async () => {
    const a = await encryptSecret(provider, "same", "ctx");
    const b = await encryptSecret(provider, "same", "ctx");
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.encryptedDek.equals(b.encryptedDek)).toBe(false);
  });
  it("rejects a blob moved to another row (AAD mismatch)", async () => {
    const s = await encryptSecret(provider, "tok", "acct-1");
    await expect(decryptSecret(provider, s, "acct-2")).rejects.toThrow();
  });
  it("detects tampering", async () => {
    const s = await encryptSecret(provider, "tok", "c");
    s.ciphertext[s.ciphertext.length - 1] ^= 1;
    await expect(decryptSecret(provider, s, "c")).rejects.toThrow();
  });
  it("rejects a wrong KEK", async () => {
    const s = await encryptSecret(provider, "tok", "c");
    const other = new LocalKeyProvider(randomBytes(32).toString("base64"));
    await expect(decryptSecret(other, s, "c")).rejects.toThrow();
  });
});

describe("meta signature", () => {
  const body = Buffer.from('{"object":"instagram"}');
  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, signMetaBody(body, "s3cret"), "s3cret")).toBe(true);
  });
  it("rejects forged, missing, malformed and altered-body cases", () => {
    expect(verifyMetaSignature(body, signMetaBody(body, "wrong"), "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, undefined, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "s3cret")).toBe(false);
    expect(verifyMetaSignature(Buffer.from("{}"), signMetaBody(body, "s3cret"), "s3cret")).toBe(false);
  });
});

describe("redaction", () => {
  it("strips tokens and PII deeply", () => {
    const out = redactDeep({ a: { access_token: "x", sender_username: "bob", ok: 1 }, list: [{ text: "hi" }] });
    expect(JSON.stringify(out)).not.toContain("bob");
    expect(JSON.stringify(out)).not.toContain('"x"');
    expect((out as any).a.ok).toBe(1);
  });
});
