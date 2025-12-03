/**
 * Hash Utilities
 * Cryptographic hash functions for Zcash
 */

import { sha256 as sha256Noble } from '@noble/hashes/sha256';
import { bytesToHex } from './bytes';

/**
 * SHA-256 hash
 */
export function sha256(data: Uint8Array): Uint8Array {
  return sha256Noble(data);
}

/**
 * Double SHA-256 hash (used in Bitcoin/Zcash for checksums)
 */
export function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

/**
 * RIPEMD-160 implementation
 * Based on the RIPEMD-160 specification
 */
export function ripemd160(data: Uint8Array): Uint8Array {
  // Initial hash values
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  // Pre-processing: adding padding bits
  const msgLen = data.length;
  const bitLen = msgLen * 8;

  // Calculate padding length
  let paddingLen = 64 - ((msgLen + 9) % 64);
  if (paddingLen === 64) paddingLen = 0;

  // Create padded message
  const paddedLen = msgLen + 1 + paddingLen + 8;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Append bit length (little-endian)
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  // Helper functions
  const f = (j: number, x: number, y: number, z: number): number => {
    if (j < 16) return x ^ y ^ z;
    if (j < 32) return (x & y) | (~x & z);
    if (j < 48) return (x | ~y) ^ z;
    if (j < 64) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  };

  const K = (j: number): number => {
    if (j < 16) return 0x00000000;
    if (j < 32) return 0x5a827999;
    if (j < 48) return 0x6ed9eba1;
    if (j < 64) return 0x8f1bbcdc;
    return 0xa953fd4e;
  };

  const KP = (j: number): number => {
    if (j < 16) return 0x50a28be6;
    if (j < 32) return 0x5c4dd124;
    if (j < 48) return 0x6d703ef3;
    if (j < 64) return 0x7a6d76e9;
    return 0x00000000;
  };

  const rotl = (x: number, n: number): number => {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  };

  // Message schedule permutation
  const r = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
  ];

  const rp = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
  ];

  const s = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
  ];

  const sp = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
  ];

  // Process blocks
  for (let i = 0; i < paddedLen; i += 64) {
    const block = new DataView(padded.buffer, i, 64);
    const X: number[] = [];
    for (let j = 0; j < 16; j++) {
      X[j] = block.getUint32(j * 4, true);
    }

    let A1 = h0, B1 = h1, C1 = h2, D1 = h3, E1 = h4;
    let A2 = h0, B2 = h1, C2 = h2, D2 = h3, E2 = h4;

    for (let j = 0; j < 80; j++) {
      // Left round
      const T1 = (A1 + f(j, B1, C1, D1) + X[r[j]] + K(j)) >>> 0;
      const T1r = (rotl(T1, s[j]) + E1) >>> 0;
      A1 = E1;
      E1 = D1;
      D1 = rotl(C1, 10);
      C1 = B1;
      B1 = T1r;

      // Right round
      const T2 = (A2 + f(79 - j, B2, C2, D2) + X[rp[j]] + KP(j)) >>> 0;
      const T2r = (rotl(T2, sp[j]) + E2) >>> 0;
      A2 = E2;
      E2 = D2;
      D2 = rotl(C2, 10);
      C2 = B2;
      B2 = T2r;
    }

    const T = (h1 + C1 + D2) >>> 0;
    h1 = (h2 + D1 + E2) >>> 0;
    h2 = (h3 + E1 + A2) >>> 0;
    h3 = (h4 + A1 + B2) >>> 0;
    h4 = (h0 + B1 + C2) >>> 0;
    h0 = T;
  }

  // Produce final hash (little-endian)
  const result = new Uint8Array(20);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h0, true);
  resultView.setUint32(4, h1, true);
  resultView.setUint32(8, h2, true);
  resultView.setUint32(12, h3, true);
  resultView.setUint32(16, h4, true);

  return result;
}

/**
 * HASH160 (SHA256 + RIPEMD160)
 * Used for Bitcoin/Zcash address generation
 */
export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/**
 * Compute checksum for Base58Check encoding
 */
export function computeChecksum(data: Uint8Array): Uint8Array {
  return doubleSha256(data).slice(0, 4);
}

/**
 * Verify Base58Check checksum
 */
export function verifyChecksum(data: Uint8Array): boolean {
  if (data.length < 5) {
    return false;
  }
  const payload = data.slice(0, -4);
  const checksum = data.slice(-4);
  const computed = computeChecksum(payload);
  
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== computed[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Convert hash to hex string (for display)
 */
export function hashToHex(hash: Uint8Array): string {
  return bytesToHex(hash);
}

