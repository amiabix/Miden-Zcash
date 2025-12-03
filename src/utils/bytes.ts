/**
 * Byte Utilities
 * Low-level byte manipulation functions for transaction serialization
 */

/**
 * Convert hex string to Uint8Array
 * Handles '0x' prefix and validates input
 */
export function hexToBytes(hex: string): Uint8Array {
  if (!hex || typeof hex !== 'string') {
    throw new Error('hexToBytes: input must be hex string');
  }

  // Remove '0x' prefix if present
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (clean.length % 2 !== 0) {
    throw new Error('hexToBytes: invalid hex string length');
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`hexToBytes: invalid hex character at position ${i}`);
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Reverse a Uint8Array (for little-endian conversions)
 */
export function reverseBytes(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[bytes.length - 1 - i];
  }
  return result;
}

/**
 * Convert UTF-8 string to Uint8Array
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to UTF-8 string
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Convert number to little-endian bytes
 */
export function numberToLEBytes(num: number, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = (num >> (8 * i)) & 0xff;
  }
  return bytes;
}

/**
 * Convert little-endian bytes to number
 */
export function leBytesToNumber(bytes: Uint8Array): number {
  let result = 0;
  for (let i = 0; i < bytes.length; i++) {
    result |= bytes[i] << (8 * i);
  }
  return result >>> 0; // Ensure unsigned
}

/**
 * Convert bigint to little-endian bytes
 */
export function bigintToLEBytes(num: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let n = num;
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

/**
 * Convert little-endian bytes to bigint
 */
export function leBytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Write compact size encoding to DataView
 * Used in Bitcoin/Zcash transaction serialization
 */
export function writeCompactSize(
  view: DataView,
  offset: number,
  value: number
): number {
  if (value < 0xfd) {
    view.setUint8(offset, value);
    return offset + 1;
  } else if (value <= 0xffff) {
    view.setUint8(offset, 0xfd);
    view.setUint16(offset + 1, value, true);
    return offset + 3;
  } else if (value <= 0xffffffff) {
    view.setUint8(offset, 0xfe);
    view.setUint32(offset + 1, value, true);
    return offset + 5;
  } else {
    view.setUint8(offset, 0xff);
    view.setBigUint64(offset + 1, BigInt(value), true);
    return offset + 9;
  }
}

/**
 * Read compact size encoding from DataView
 */
export function readCompactSize(
  view: DataView,
  offset: number
): { value: number; newOffset: number } {
  const first = view.getUint8(offset);

  if (first < 0xfd) {
    return { value: first, newOffset: offset + 1 };
  } else if (first === 0xfd) {
    return { value: view.getUint16(offset + 1, true), newOffset: offset + 3 };
  } else if (first === 0xfe) {
    return { value: view.getUint32(offset + 1, true), newOffset: offset + 5 };
  } else {
    return {
      value: Number(view.getBigUint64(offset + 1, true)),
      newOffset: offset + 9
    };
  }
}

/**
 * Calculate compact size encoding length
 */
export function compactSizeLength(value: number): number {
  if (value < 0xfd) return 1;
  if (value <= 0xffff) return 3;
  if (value <= 0xffffffff) return 5;
  return 9;
}

/**
 * Generate random bytes using Web Crypto API
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Constant-time comparison (timing-attack resistant)
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Zero out a Uint8Array (secure erase)
 */
export function secureZero(bytes: Uint8Array): void {
  bytes.fill(0);
}

