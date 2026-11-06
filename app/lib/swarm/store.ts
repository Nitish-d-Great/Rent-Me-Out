import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Bee, NULL_STAMP } from "@ethersphere/bee-js";

/**
 * Encrypted storage on Swarm.
 *
 * We encrypt here rather than using Swarm's own encryption for two reasons: public
 * gateways have it disabled, and its references contain their decryption key, which must
 * never reach a public Arkiv entity. Our reference points only at ciphertext, so it is
 * safe to publish. The key stays in DEED_ENCRYPTION_KEY, and losing it loses the data.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const hex = process.env.DEED_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("DEED_ENCRYPTION_KEY must be 32 bytes of hex: openssl rand -hex 32");
  }
  return Buffer.from(hex, "hex");
}

function bee(): Bee {
  const url = process.env.SWARM_BEE_URL;
  if (!url) throw new Error("SWARM_BEE_URL is not set");
  return new Bee(url);
}

/** The placeholder stamp works only on a gateway that pays for uploads itself. */
function postageBatch(): string {
  return process.env.SWARM_POSTAGE_BATCH_ID || NULL_STAMP.toHex();
}

export function seal(plain: Uint8Array): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function open(sealed: Uint8Array): Uint8Array {
  const data = Buffer.from(sealed);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

/** Returns the Swarm reference. It resolves once the upload has reached the network. */
export async function uploadSealed(plain: Uint8Array): Promise<string> {
  const result = await bee().data.upload(postageBatch(), seal(plain), { deferred: false });
  return result.reference.toHex();
}

export async function downloadSealed(reference: string): Promise<Uint8Array> {
  const data = await bee().data.download(reference);
  return open(data.toUint8Array());
}

export async function uploadSealedJson(value: unknown): Promise<string> {
  return uploadSealed(new TextEncoder().encode(JSON.stringify(value)));
}

export async function downloadSealedJson<T>(reference: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await downloadSealed(reference))) as T;
}
