/**
 * Bech32 Address Encoding/Decoding Tests
 * Tests for Zcash Sapling address parsing and validation
 */

import {
  parseZcashAddress,
  encodeZcashAddress,
  isValidZcashAddress,
  decodeBech32,
  encodeBech32,
  Bech32Error
} from '../../src/shielded/bech32';

describe('Bech32 Encoding/Decoding', () => {
  describe('decodeBech32', () => {
    it('should decode valid bech32 string via round-trip', () => {
      // Create a valid bech32 string via encoding
      const encoded = encodeBech32('test', [0, 1, 2, 3]);
      const result = decodeBech32(encoded);
      
      expect(result).not.toBeNull();
      expect(result?.hrp).toBe('test');
      expect(result?.data).toEqual([0, 1, 2, 3]);
    });

    it('should reject mixed case', () => {
      // Create valid lowercase, then mix case
      const encoded = encodeBech32('test', [0, 1, 2]);
      const mixed = encoded.slice(0, 3) + encoded.slice(3).toUpperCase();
      const result = decodeBech32(mixed);
      expect(result).toBeNull();
    });

    it('should reject invalid separator position', () => {
      const result = decodeBech32('1');
      expect(result).toBeNull();
    });

    it('should reject invalid checksum', () => {
      const encoded = encodeBech32('test', [0, 1, 2]);
      // Corrupt the checksum by changing last character
      const corrupted = encoded.slice(0, -1) + (encoded.slice(-1) === 'q' ? 'p' : 'q');
      const result = decodeBech32(corrupted);
      expect(result).toBeNull();
    });

    it('should handle uppercase input', () => {
      // Bech32 spec allows all uppercase
      const encoded = encodeBech32('test', [0, 1, 2, 3]).toUpperCase();
      const result = decodeBech32(encoded);
      
      expect(result).not.toBeNull();
      expect(result?.hrp).toBe('test');
    });
  });

  describe('encodeBech32', () => {
    it('should encode and verify round-trip', () => {
      const hrp = 'test';
      const data = [0, 1, 2, 3, 4, 5];
      const encoded = encodeBech32(hrp, data);
      const decoded = decodeBech32(encoded);
      
      expect(decoded).not.toBeNull();
      expect(decoded?.hrp).toBe(hrp);
      expect(decoded?.data).toEqual(data);
    });

    it('should produce lowercase output', () => {
      const encoded = encodeBech32('TEST', [0, 1, 2]);
      expect(encoded).toBe(encoded.toLowerCase());
    });
  });
});

describe('Zcash Address Parsing', () => {
  // Create valid test addresses
  const createTestAddress = (hrp: string): string => {
    // 43 bytes: 11 diversifier + 32 pkD
    const diversifier = new Uint8Array(11).fill(0x01);
    const pkD = new Uint8Array(32).fill(0x02);
    return encodeZcashAddress(hrp, diversifier, pkD);
  };

  describe('parseZcashAddress', () => {
    it('should parse valid mainnet address (zs)', () => {
      const address = createTestAddress('zs');
      const parsed = parseZcashAddress(address);
      
      expect(parsed.hrp).toBe('zs');
      expect(parsed.diversifier.length).toBe(11);
      expect(parsed.pkD.length).toBe(32);
    });

    it('should parse valid testnet address (ztestsapling)', () => {
      const address = createTestAddress('ztestsapling');
      const parsed = parseZcashAddress(address);
      
      expect(parsed.hrp).toBe('ztestsapling');
      expect(parsed.diversifier.length).toBe(11);
      expect(parsed.pkD.length).toBe(32);
    });

    it('should parse custom HRP addresses', () => {
      const address = createTestAddress('custom');
      const parsed = parseZcashAddress(address);
      
      expect(parsed.hrp).toBe('custom');
    });

    it('should preserve diversifier bytes', () => {
      const diversifier = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const pkD = new Uint8Array(32).fill(0xAB);
      const address = encodeZcashAddress('zs', diversifier, pkD);
      const parsed = parseZcashAddress(address);
      
      expect(Array.from(parsed.diversifier)).toEqual(Array.from(diversifier));
    });

    it('should preserve pkD bytes', () => {
      const diversifier = new Uint8Array(11).fill(0x00);
      const pkD = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        pkD[i] = i;
      }
      const address = encodeZcashAddress('zs', diversifier, pkD);
      const parsed = parseZcashAddress(address);
      
      expect(Array.from(parsed.pkD)).toEqual(Array.from(pkD));
    });

    it('should throw on empty address', () => {
      expect(() => parseZcashAddress('')).toThrow(Bech32Error);
    });

    it('should throw on null/undefined address', () => {
      expect(() => parseZcashAddress(null as any)).toThrow(Bech32Error);
      expect(() => parseZcashAddress(undefined as any)).toThrow(Bech32Error);
    });

    it('should throw on invalid HRP', () => {
      // Create address with invalid HRP
      const diversifier = new Uint8Array(11).fill(0x01);
      const pkD = new Uint8Array(32).fill(0x02);
      
      // Manually encode with invalid HRP
      const payload = new Uint8Array(43);
      payload.set(diversifier, 0);
      payload.set(pkD, 11);
      
      // Convert to 5-bit groups
      const data: number[] = [];
      let acc = 0;
      let bits = 0;
      for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
          bits -= 5;
          data.push((acc >> bits) & 31);
        }
      }
      if (bits > 0) {
        data.push((acc << (5 - bits)) & 31);
      }
      
      const invalidAddress = encodeBech32('invalid', data);
      expect(() => parseZcashAddress(invalidAddress)).toThrow(Bech32Error);
    });

    it('should throw on invalid checksum', () => {
      const address = createTestAddress('zs');
      // Corrupt the checksum by changing last character
      const corrupted = address.slice(0, -1) + (address.slice(-1) === 'q' ? 'p' : 'q');
      expect(() => parseZcashAddress(corrupted)).toThrow(Bech32Error);
    });
  });

  describe('encodeZcashAddress', () => {
    it('should encode valid address', () => {
      const diversifier = new Uint8Array(11).fill(0x00);
      const pkD = new Uint8Array(32).fill(0xFF);
      
      const address = encodeZcashAddress('zs', diversifier, pkD);
      
      expect(address.startsWith('zs1')).toBe(true);
      expect(isValidZcashAddress(address)).toBe(true);
    });

    it('should throw on invalid diversifier length', () => {
      const diversifier = new Uint8Array(10); // Wrong length
      const pkD = new Uint8Array(32);
      
      expect(() => encodeZcashAddress('zs', diversifier, pkD)).toThrow(Bech32Error);
    });

    it('should throw on invalid pkD length', () => {
      const diversifier = new Uint8Array(11);
      const pkD = new Uint8Array(31); // Wrong length
      
      expect(() => encodeZcashAddress('zs', diversifier, pkD)).toThrow(Bech32Error);
    });

    it('should round-trip correctly', () => {
      const diversifier = new Uint8Array(11);
      const pkD = new Uint8Array(32);
      
      // Fill with test pattern
      for (let i = 0; i < 11; i++) diversifier[i] = i * 23;
      for (let i = 0; i < 32; i++) pkD[i] = i * 7;
      
      const address = encodeZcashAddress('zs', diversifier, pkD);
      const parsed = parseZcashAddress(address);
      
      expect(Array.from(parsed.diversifier)).toEqual(Array.from(diversifier));
      expect(Array.from(parsed.pkD)).toEqual(Array.from(pkD));
    });
  });

  describe('isValidZcashAddress', () => {
    it('should return true for valid addresses', () => {
      const address = createTestAddress('zs');
      expect(isValidZcashAddress(address)).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidZcashAddress('')).toBe(false);
      expect(isValidZcashAddress('invalid')).toBe(false);
      expect(isValidZcashAddress('zs1invalid')).toBe(false);
    });

    it('should return false for corrupted checksum', () => {
      const address = createTestAddress('zs');
      const corrupted = address.slice(0, -1) + 'x';
      expect(isValidZcashAddress(corrupted)).toBe(false);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle all-zero diversifier and pkD', () => {
    const diversifier = new Uint8Array(11).fill(0);
    const pkD = new Uint8Array(32).fill(0);
    
    const address = encodeZcashAddress('zs', diversifier, pkD);
    const parsed = parseZcashAddress(address);
    
    expect(parsed.diversifier.every(b => b === 0)).toBe(true);
    expect(parsed.pkD.every(b => b === 0)).toBe(true);
  });

  it('should handle all-max diversifier and pkD', () => {
    const diversifier = new Uint8Array(11).fill(0xFF);
    const pkD = new Uint8Array(32).fill(0xFF);
    
    const address = encodeZcashAddress('zs', diversifier, pkD);
    const parsed = parseZcashAddress(address);
    
    expect(parsed.diversifier.every(b => b === 0xFF)).toBe(true);
    expect(parsed.pkD.every(b => b === 0xFF)).toBe(true);
  });

  it('should handle different HRP lengths', () => {
    const hrps = ['zs', 'ztestsapling', 'custom', 'zcash'];
    const diversifier = new Uint8Array(11).fill(0x55);
    const pkD = new Uint8Array(32).fill(0xAA);
    
    for (const hrp of hrps) {
      const address = encodeZcashAddress(hrp, diversifier, pkD);
      const parsed = parseZcashAddress(address);
      expect(parsed.hrp).toBe(hrp);
    }
  });
});
