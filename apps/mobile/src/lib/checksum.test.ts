import * as Crypto from "expo-crypto";

import { sha256Hex } from "./checksum";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: jest.fn(),
}));

const mockedDigest = Crypto.digest as jest.Mock;

test("hex-encodes the digest returned by expo-crypto", async () => {
  // A fixed 4-byte "digest" so the expected hex is easy to state directly —
  // the real SHA-256 math itself is expo-crypto's responsibility, not ours.
  mockedDigest.mockResolvedValue(new Uint8Array([0x00, 0x1f, 0xa5, 0xff]).buffer);

  const result = await sha256Hex(new Uint8Array([1, 2, 3]));

  expect(result).toBe("001fa5ff");
  expect(mockedDigest).toHaveBeenCalledWith("SHA-256", new Uint8Array([1, 2, 3]));
});

test("pads single-digit hex bytes with a leading zero", async () => {
  mockedDigest.mockResolvedValue(new Uint8Array([0x00, 0x01, 0x0a]).buffer);

  const result = await sha256Hex(new Uint8Array([9]));

  expect(result).toBe("00010a");
});
