import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

/** Wraps/unwraps per-record Data Encryption Keys with a Key Encryption Key. */
export interface KeyProvider {
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
}

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function aesGcmEncrypt(key: Buffer, plaintext: Buffer, aad?: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  if (aad) cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  // layout: iv | tag | ciphertext
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function aesGcmDecrypt(key: Buffer, blob: Buffer, aad?: Buffer): Buffer {
  if (blob.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Dev-only provider: KEK held in an env var. Same wire format as production. */
export class LocalKeyProvider implements KeyProvider {
  private readonly kek: Buffer;
  constructor(kekBase64: string) {
    const kek = Buffer.from(kekBase64, "base64");
    if (kek.length !== KEY_LEN) throw new Error("LOCAL_KEK_BASE64 must decode to 32 bytes");
    this.kek = kek;
  }
  async wrap(dek: Buffer): Promise<Buffer> {
    return aesGcmEncrypt(this.kek, dek);
  }
  async unwrap(wrapped: Buffer): Promise<Buffer> {
    return aesGcmDecrypt(this.kek, wrapped);
  }
}

/** Production provider: DEKs wrapped by an AWS KMS key. */
export class KmsKeyProvider implements KeyProvider {
  private readonly client: KMSClient;
  constructor(private readonly keyId: string, client?: KMSClient) {
    this.client = client ?? new KMSClient({});
  }
  async wrap(dek: Buffer): Promise<Buffer> {
    const out = await this.client.send(new EncryptCommand({ KeyId: this.keyId, Plaintext: dek }));
    if (!out.CiphertextBlob) throw new Error("KMS returned no ciphertext");
    return Buffer.from(out.CiphertextBlob);
  }
  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const out = await this.client.send(new DecryptCommand({ KeyId: this.keyId, CiphertextBlob: wrapped }));
    if (!out.Plaintext) throw new Error("KMS returned no plaintext");
    return Buffer.from(out.Plaintext);
  }
}

export interface EncryptedSecret {
  /** AES-256-GCM(iv|tag|ct) of the secret under a fresh random DEK. */
  ciphertext: Buffer;
  /** The DEK wrapped by the KEK. */
  encryptedDek: Buffer;
}

/**
 * Envelope-encrypt a secret. A unique random 256-bit DEK is generated per call.
 * `context` (e.g. the ig_account id) is bound as AAD so a blob cannot be
 * swapped between rows.
 */
export async function encryptSecret(
  provider: KeyProvider,
  plaintext: string,
  context: string,
): Promise<EncryptedSecret> {
  const dek = randomBytes(KEY_LEN);
  try {
    const ciphertext = aesGcmEncrypt(dek, Buffer.from(plaintext, "utf8"), Buffer.from(context, "utf8"));
    const encryptedDek = await provider.wrap(dek);
    return { ciphertext, encryptedDek };
  } finally {
    dek.fill(0);
  }
}

export async function decryptSecret(
  provider: KeyProvider,
  secret: EncryptedSecret,
  context: string,
): Promise<string> {
  const dek = await provider.unwrap(secret.encryptedDek);
  try {
    return aesGcmDecrypt(dek, secret.ciphertext, Buffer.from(context, "utf8")).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

export function keyProviderFromEnv(env: NodeJS.ProcessEnv = process.env): KeyProvider {
  if (env.KEY_PROVIDER === "kms") {
    if (!env.AWS_KMS_KEY_ID) throw new Error("AWS_KMS_KEY_ID required when KEY_PROVIDER=kms");
    return new KmsKeyProvider(env.AWS_KMS_KEY_ID);
  }
  if (env.NODE_ENV === "production" && env.ALLOW_LOCAL_KEK !== "true") throw new Error("KEY_PROVIDER=local is not allowed in production");
  if (!env.LOCAL_KEK_BASE64) throw new Error("LOCAL_KEK_BASE64 required when KEY_PROVIDER=local");
  return new LocalKeyProvider(env.LOCAL_KEK_BASE64);
}
