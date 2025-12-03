/**
 * Bech32 Encoding/Decoding for Zcash Addresses
 * 
 * Implements BIP-173 Bech32 encoding with proper checksum verification
 * for Zcash Sapling shielded addresses.
 * 
 * Reference: https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki
 */

/**
 * Bech32 character set (BIP-173)
 */
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Bech32 generator polynomial
 */
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

/**
 * Parsed Zcash shielded address
 */
export interface ParsedZcashAddress {
  hrp: string;
  diversifier: Uint8Array;
  pkD: Uint8Array;
}

/**
 * Bech32 decoding error
 */
export class Bech32Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Bech32Error';
  }
}

/**
 * Compute Bech32 polymod checksum
 */
function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk;
}

/**
 * Expand HRP for checksum calculation
 */
function hrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) & 31);
  }
  return result;
}

/**
 * Verify Bech32 checksum
 */
function verifyChecksum(hrp: string, data: number[]): boolean {
  const expanded = hrpExpand(hrp).concat(data);
  return polymod(expanded) === 1;
}

/**
 * Create Bech32 checksum
 */
function createChecksum(hrp: string, data: number[]): number[] {
  const expanded = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(expanded) ^ 1;
  const result: number[] = [];
  for (let i = 0; i < 6; i++) {
    result.push((mod >> (5 * (5 - i))) & 31);
  }
  return result;
}

/**
 * Convert 5-bit groups to 8-bit bytes
 */
function convertBits(
  data: number[],
  fromBits: number,
  toBits: number,
  pad: boolean
): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) {
      return null;
    }
    acc = (acc << fromBits) | value;
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
    return null;
  }

  return result;
}

/**
 * Decode a Bech32 string
 */
export function decodeBech32(bechString: string): { hrp: string; data: number[] } | null {
  // Check for mixed case
  const lower = bechString.toLowerCase();
  const upper = bechString.toUpperCase();
  if (bechString !== lower && bechString !== upper) {
    return null;
  }

  const str = lower;

  // Find separator
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length || str.length > 90) {
    return null;
  }

  const hrp = str.substring(0, pos);
  const dataStr = str.substring(pos + 1);

  // Decode data
  const data: number[] = [];
  for (const c of dataStr) {
    const d = CHARSET.indexOf(c);
    if (d === -1) {
      return null;
    }
    data.push(d);
  }

  // Verify checksum
  if (!verifyChecksum(hrp, data)) {
    return null;
  }

  // Remove checksum (last 6 values)
  return { hrp, data: data.slice(0, -6) };
}

/**
 * Encode data to Bech32 string
 * Always outputs lowercase as per BIP-173 recommendation
 */
export function encodeBech32(hrp: string, data: number[]): string {
  const hrpLower = hrp.toLowerCase();
  const checksum = createChecksum(hrpLower, data);
  const combined = data.concat(checksum);
  let result = hrpLower + '1';
  for (const d of combined) {
    result += CHARSET[d];
  }
  return result;
}

/**
 * Parse a Zcash shielded address (Sapling)
 * 
 * Zcash Sapling addresses are Bech32-encoded with:
 * - HRP: "zs" (mainnet) or "ztestsapling" (testnet) or custom
 * - Data: 43 bytes (11 diversifier + 32 pk_d)
 * 
 * @param address - The Bech32-encoded Zcash address
 * @returns Parsed address with diversifier and pkD
 * @throws Bech32Error if address is invalid
 */
export function parseZcashAddress(address: string): ParsedZcashAddress {
  if (!address || typeof address !== 'string') {
    throw new Bech32Error('Invalid address: address is required and must be a string');
  }

  // Decode Bech32
  const decoded = decodeBech32(address);
  if (!decoded) {
    throw new Bech32Error('Invalid Bech32 address format or checksum verification failed');
  }

  const { hrp, data } = decoded;

  // Validate HRP for Zcash
  const validHrps = ['zs', 'ztestsapling', 'zcash', 'ztest', 'custom'];
  const isValidHrp = validHrps.some(valid => hrp.startsWith(valid));
  if (!isValidHrp) {
    throw new Bech32Error(`Invalid Zcash address HRP: ${hrp}. Expected one of: ${validHrps.join(', ')}`);
  }

  // Convert 5-bit groups to 8-bit bytes
  const bytes = convertBits(data, 5, 8, false);
  if (!bytes) {
    throw new Bech32Error('Failed to convert Bech32 data to bytes');
  }

  // Validate payload length (43 bytes: 11 diversifier + 32 pkD)
  if (bytes.length !== 43) {
    throw new Bech32Error(
      `Invalid address payload length: expected 43 bytes, got ${bytes.length}`
    );
  }

  return {
    hrp,
    diversifier: new Uint8Array(bytes.slice(0, 11)),
    pkD: new Uint8Array(bytes.slice(11, 43))
  };
}

/**
 * Encode a Zcash shielded address
 * 
 * @param hrp - Human-readable part (e.g., "zs" for mainnet)
 * @param diversifier - 11-byte diversifier
 * @param pkD - 32-byte payment key
 * @returns Bech32-encoded Zcash address
 */
export function encodeZcashAddress(
  hrp: string,
  diversifier: Uint8Array,
  pkD: Uint8Array
): string {
  if (diversifier.length !== 11) {
    throw new Bech32Error('Diversifier must be 11 bytes');
  }
  if (pkD.length !== 32) {
    throw new Bech32Error('pkD must be 32 bytes');
  }

  // Combine diversifier and pkD
  const payload = new Uint8Array(43);
  payload.set(diversifier, 0);
  payload.set(pkD, 11);

  // Convert to 5-bit groups
  const data = convertBits(Array.from(payload), 8, 5, true);
  if (!data) {
    throw new Bech32Error('Failed to convert payload to Bech32 data');
  }

  return encodeBech32(hrp, data);
}

/**
 * Validate a Zcash address without parsing
 * 
 * @param address - The address to validate
 * @returns True if valid, false otherwise
 */
export function isValidZcashAddress(address: string): boolean {
  try {
    parseZcashAddress(address);
    return true;
  } catch {
    return false;
  }
}
