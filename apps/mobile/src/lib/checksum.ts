import * as Crypto from "expo-crypto";

// expo-crypto's Crypto.digest(), not the global Web Crypto crypto.subtle —
// Hermes doesn't reliably expose the latter, and expo-crypto is the
// documented cross-platform way to hash raw bytes on Expo.
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
