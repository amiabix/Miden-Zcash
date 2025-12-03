/**
 * Tests for byte utilities
 */

import {
  hexToBytes,
  bytesToHex,
  concatBytes,
  bytesEqual,
  reverseBytes,
  stringToBytes,
  bytesToString,
  numberToLEBytes,
  leBytesToNumber,
  writeCompactSize,
  readCompactSize,
  compactSizeLength,
  constantTimeCompare
} from '../../src/utils/bytes';

describe('hexToBytes', () => {
  test('converts hex string to bytes correctly', () => {
    const result = hexToBytes('deadbeef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  test('handles empty string', () => {
    const result = hexToBytes('');
    expect(result).toEqual(new Uint8Array(0));
  });

  test('handles lowercase and uppercase', () => {
    const lower = hexToBytes('abcd');
    const upper = hexToBytes('ABCD');
    expect(lower).toEqual(upper);
  });

  test('throws on odd length string', () => {
    expect(() => hexToBytes('abc')).toThrow('Invalid hex string: odd length');
  });

  test('throws on invalid characters', () => {
    expect(() => hexToBytes('xyz')).toThrow();
  });
});

describe('bytesToHex', () => {
  test('converts bytes to hex correctly', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bytesToHex(bytes)).toBe('deadbeef');
  });

  test('handles empty array', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });

  test('pads single digits with zero', () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x0a]);
    expect(bytesToHex(bytes)).toBe('01020a');
  });
});

describe('concatBytes', () => {
  test('concatenates multiple arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5]);
    expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  test('handles empty arrays', () => {
    const a = new Uint8Array([1, 2]);
    const empty = new Uint8Array(0);
    expect(concatBytes(a, empty)).toEqual(a);
  });
});

describe('bytesEqual', () => {
  test('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(bytesEqual(a, b)).toBe(true);
  });

  test('returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(bytesEqual(a, b)).toBe(false);
  });

  test('returns false for different content', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(bytesEqual(a, b)).toBe(false);
  });
});

describe('reverseBytes', () => {
  test('reverses byte array', () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    expect(reverseBytes(input)).toEqual(new Uint8Array([4, 3, 2, 1]));
  });

  test('handles single byte', () => {
    const input = new Uint8Array([42]);
    expect(reverseBytes(input)).toEqual(new Uint8Array([42]));
  });

  test('handles empty array', () => {
    const input = new Uint8Array(0);
    expect(reverseBytes(input)).toEqual(new Uint8Array(0));
  });
});

describe('stringToBytes / bytesToString', () => {
  test('roundtrip ASCII string', () => {
    const str = 'Hello, World!';
    const bytes = stringToBytes(str);
    expect(bytesToString(bytes)).toBe(str);
  });

  test('roundtrip UTF-8 string', () => {
    const str = 'Hello, 世界!';
    const bytes = stringToBytes(str);
    expect(bytesToString(bytes)).toBe(str);
  });
});

describe('numberToLEBytes / leBytesToNumber', () => {
  test('converts 32-bit number correctly', () => {
    const num = 0x12345678;
    const bytes = numberToLEBytes(num, 4);
    expect(bytes).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    expect(leBytesToNumber(bytes)).toBe(num);
  });

  test('handles zero', () => {
    const bytes = numberToLEBytes(0, 4);
    expect(bytes).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(leBytesToNumber(bytes)).toBe(0);
  });
});

describe('compact size encoding', () => {
  test('encodes values less than 0xFD', () => {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    const offset = writeCompactSize(view, 0, 100);
    
    expect(offset).toBe(1);
    expect(compactSizeLength(100)).toBe(1);
    expect(readCompactSize(view, 0)).toEqual({ value: 100, newOffset: 1 });
  });

  test('encodes 16-bit values', () => {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    const offset = writeCompactSize(view, 0, 0x1234);
    
    expect(offset).toBe(3);
    expect(compactSizeLength(0x1234)).toBe(3);
    expect(readCompactSize(view, 0)).toEqual({ value: 0x1234, newOffset: 3 });
  });

  test('encodes 32-bit values', () => {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    const offset = writeCompactSize(view, 0, 0x12345678);
    
    expect(offset).toBe(5);
    expect(compactSizeLength(0x12345678)).toBe(5);
    expect(readCompactSize(view, 0)).toEqual({ value: 0x12345678, newOffset: 5 });
  });
});

describe('constantTimeCompare', () => {
  test('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeCompare(a, b)).toBe(true);
  });

  test('returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeCompare(a, b)).toBe(false);
  });

  test('returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeCompare(a, b)).toBe(false);
  });
});

