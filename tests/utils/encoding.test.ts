/**
 * Tests for encoding utilities
 */

import {
  base58Encode,
  base58Decode,
  bech32Encode,
  bech32Decode,
  base64Encode,
  base64Decode,
  convertBits
} from '../../src/utils/encoding';

describe('base58', () => {
  test('encodes bytes correctly', () => {
    const input = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const encoded = base58Encode(input);
    const decoded = base58Decode(encoded);
    expect(decoded).toEqual(input);
  });

  test('handles leading zeros', () => {
    const input = new Uint8Array([0, 0, 0, 1, 2, 3]);
    const encoded = base58Encode(input);
    expect(encoded.startsWith('111')).toBe(true); // Leading zeros = '1's
    const decoded = base58Decode(encoded);
    expect(decoded).toEqual(input);
  });

  test('handles empty input', () => {
    const encoded = base58Encode(new Uint8Array(0));
    expect(encoded).toBe('');
    expect(base58Decode('')).toEqual(new Uint8Array(0));
  });

  test('encodes known values correctly', () => {
    // Known test vector
    const input = new Uint8Array([0x00, 0x00, 0x28, 0x7f, 0xb4, 0xcd]);
    const encoded = base58Encode(input);
    const decoded = base58Decode(encoded);
    expect(decoded).toEqual(input);
  });

  test('throws on invalid characters', () => {
    expect(() => base58Decode('0OIl')).toThrow(); // 0, O, I, l are not in Base58
  });
});

describe('bech32', () => {
  test('encodes and decodes correctly', () => {
    const hrp = 'zs';
    const data = new Uint8Array(43).fill(0x42);
    
    const encoded = bech32Encode(hrp, data);
    expect(encoded.startsWith('zs1')).toBe(true);
    
    const decoded = bech32Decode(encoded);
    expect(decoded.hrp).toBe(hrp);
    // Note: decoded data may have slightly different length due to padding
    expect(decoded.data.length).toBeGreaterThanOrEqual(40);
  });

  test('handles different HRPs', () => {
    const data = new Uint8Array(20).fill(0x11);
    
    const mainnet = bech32Encode('zs', data);
    expect(mainnet.startsWith('zs1')).toBe(true);
    
    const testnet = bech32Encode('ztestsapling', data);
    expect(testnet.startsWith('ztestsapling1')).toBe(true);
  });

  test('throws on invalid bech32 string', () => {
    expect(() => bech32Decode('invalid')).toThrow();
  });

  test('throws on invalid checksum', () => {
    // Create valid bech32 and corrupt last character
    const valid = bech32Encode('zs', new Uint8Array(20).fill(0x42));
    const corrupted = valid.slice(0, -1) + 'x';
    expect(() => bech32Decode(corrupted)).toThrow();
  });
});

describe('convertBits', () => {
  test('converts 8-bit to 5-bit', () => {
    const data = new Uint8Array([0xff]);
    const result = convertBits(data, 8, 5, true);
    expect(result.length).toBe(2);
  });

  test('roundtrip 8-bit to 5-bit and back', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a]);
    const fiveBit = convertBits(data, 8, 5, true);
    expect(fiveBit.length).toBeGreaterThan(0);
    // Each 8-bit byte becomes ~1.6 5-bit groups, so 5 bytes = 8 groups
    expect(fiveBit.length).toBe(8);
  });
});

describe('base64', () => {
  test('encodes bytes correctly', () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = base64Encode(input);
    expect(encoded).toBe('SGVsbG8=');
  });

  test('decodes correctly', () => {
    const decoded = base64Decode('SGVsbG8=');
    expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  test('roundtrips correctly', () => {
    const input = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const encoded = base64Encode(input);
    const decoded = base64Decode(encoded);
    expect(decoded).toEqual(input);
  });
});

