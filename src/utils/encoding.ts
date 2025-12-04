/**
 * Encoding Utilities
 * Base58, Bech32, and other encoding functions for Zcash addresses
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

/**
 * Encode bytes to Base58 string
 */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '';
  }

  // Count leading zeros
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      leadingZeros++;
    } else {
      break;
    }
  }

  // Convert to base58
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // Build result string
  let result = '';
  for (let i = 0; i < leadingZeros; i++) {
    result += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

/**
 * Decode Base58 string to bytes
 */
export function base58Decode(str: string): Uint8Array {
  if (!str || typeof str !== 'string' || str.length === 0) {
    return new Uint8Array(0);
  }

  // Count leading '1's (zeros)
  let leadingOnes = 0;
  for (const char of str) {
    if (char === '1') {
      leadingOnes++;
    } else {
      break;
    }
  }

  // Convert from base58
  const bytes: number[] = [0];
  for (const char of str) {
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Add leading zeros
  const result = new Uint8Array(leadingOnes + bytes.length);
  for (let i = bytes.length - 1, j = leadingOnes; i >= 0; i--, j++) {
    result[j] = bytes[i];
  }

  return result;
}

/**
 * Bech32 character set
 */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CHARSET_MAP = new Map<string, number>();
for (let i = 0; i < BECH32_CHARSET.length; i++) {
  BECH32_CHARSET_MAP.set(BECH32_CHARSET[i], i);
}

/**
 * Bech32 polymod calculation
 */
function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}

/**
 * Expand human-readable part for checksum calculation
 */
function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 31);
  }
  return result;
}

/**
 * Calculate Bech32 checksum
 */
function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

/**
 * Verify Bech32 checksum
 */
function bech32VerifyChecksum(hrp: string, data: number[]): boolean {
  return bech32Polymod(bech32HrpExpand(hrp).concat(data)) === 1;
}

/**
 * Convert data to 5-bit groups (for Bech32 encoding)
 */
export function convertBits(
  data: Uint8Array,
  fromBits: number,
  toBits: number,
  pad: boolean = true
): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const byte of data) {
    acc = (acc << fromBits) | byte;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    throw new Error('Invalid padding');
  }

  return result;
}

/**
 * Encode to Bech32 string
 */
export function bech32Encode(hrp: string, data: Uint8Array): string {
  // Convert 8-bit to 5-bit groups
  const words = convertBits(data, 8, 5, true);
  
  // Calculate checksum
  const checksum = bech32CreateChecksum(hrp, words);
  
  // Build result
  let result = hrp + '1';
  for (const word of words.concat(checksum)) {
    result += BECH32_CHARSET[word];
  }
  
  return result;
}

/**
 * Decode Bech32 string
 */
export function bech32Decode(str: string): { hrp: string; data: Uint8Array } {
  if (!str || typeof str !== 'string' || str.length === 0) {
    throw new Error('Invalid bech32 string: empty or not a string');
  }

  // Find separator
  const pos = str.lastIndexOf('1');
  // pos < 1 means no separator or separator at start
  // pos + 7 > str.length means not enough data after separator (need at least 6 for checksum)
  // Correct check: pos >= 1 && pos + 6 < str.length (pos + 7 <= str.length)
  if (pos < 1 || pos + 7 > str.length) {
    throw new Error('Invalid bech32 string');
  }

  // Split into hrp and data
  const hrp = str.substring(0, pos).toLowerCase();
  const dataStr = str.substring(pos + 1).toLowerCase();

  // Decode data characters
  const data: number[] = [];
  for (const char of dataStr) {
    const value = BECH32_CHARSET_MAP.get(char);
    if (value === undefined) {
      throw new Error(`Invalid bech32 character: ${char}`);
    }
    data.push(value);
  }

  // Verify checksum
  if (!bech32VerifyChecksum(hrp, data)) {
    throw new Error('Invalid bech32 checksum');
  }

  // Remove checksum and convert back to 8-bit
  const words = data.slice(0, -6);
  const bytes = convertBits(new Uint8Array(words), 5, 8, false);

  return { hrp, data: new Uint8Array(bytes) };
}

/**
 * Encode bytes to Base64
 */
export function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode Base64 to bytes
 */
export function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

