/**
 * Tests for hash utilities
 */

import {
  sha256,
  doubleSha256,
  ripemd160,
  hash160,
  computeChecksum,
  verifyChecksum
} from '../../src/utils/hash';
import { bytesToHex } from '../../src/utils/bytes';

describe('sha256', () => {
  test('hashes empty input correctly', () => {
    const hash = sha256(new Uint8Array(0));
    expect(bytesToHex(hash)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('hashes "abc" correctly', () => {
    const input = new TextEncoder().encode('abc');
    const hash = sha256(input);
    expect(bytesToHex(hash)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('returns 32 bytes', () => {
    const hash = sha256(new Uint8Array([1, 2, 3]));
    expect(hash.length).toBe(32);
  });
});

describe('doubleSha256', () => {
  test('applies SHA256 twice', () => {
    const input = new TextEncoder().encode('test');
    const single = sha256(input);
    const double1 = sha256(single);
    const double2 = doubleSha256(input);
    expect(double1).toEqual(double2);
  });
});

describe('ripemd160', () => {
  test('hashes empty input correctly', () => {
    const hash = ripemd160(new Uint8Array(0));
    expect(bytesToHex(hash)).toBe('9c1185a5c5e9fc54612808977ee8f548b2258d31');
  });

  test('hashes "abc" correctly', () => {
    const input = new TextEncoder().encode('abc');
    const hash = ripemd160(input);
    expect(bytesToHex(hash)).toBe('8eb208f7e05d987a9b044a8e98c6b087f15a0bfc');
  });

  test('returns 20 bytes', () => {
    const hash = ripemd160(new Uint8Array([1, 2, 3]));
    expect(hash.length).toBe(20);
  });
});

describe('hash160', () => {
  test('computes SHA256 + RIPEMD160', () => {
    const input = new TextEncoder().encode('test');
    const expected = ripemd160(sha256(input));
    const result = hash160(input);
    expect(result).toEqual(expected);
  });

  test('returns 20 bytes', () => {
    const hash = hash160(new Uint8Array([1, 2, 3]));
    expect(hash.length).toBe(20);
  });
});

describe('checksum', () => {
  test('computes 4-byte checksum', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const checksum = computeChecksum(data);
    expect(checksum.length).toBe(4);
  });

  test('verifies valid checksum', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const checksum = computeChecksum(data);
    const combined = new Uint8Array(data.length + 4);
    combined.set(data);
    combined.set(checksum, data.length);
    expect(verifyChecksum(combined)).toBe(true);
  });

  test('rejects invalid checksum', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 0, 0, 0, 0]);
    expect(verifyChecksum(data)).toBe(false);
  });

  test('rejects too short data', () => {
    expect(verifyChecksum(new Uint8Array(4))).toBe(false);
  });
});

