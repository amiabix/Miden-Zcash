/**
 * Test to verify binary expansion is working correctly
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Scalar Multiplication Binary Expansion', () => {
  it('should verify [5]*P using binary expansion manually', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x01);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // 5 in binary = 101 (LSB first: 1, 0, 1)
    // Algorithm: result = O, addend = P
    // Bit 0: 1 -> result = O + P = P, addend = 2P
    // Bit 1: 0 -> result = P, addend = 4P
    // Bit 2: 1 -> result = P + 4P = 5P, addend = 8P
    
    const result = basePoint.scalarMult(5n);
    
    // Manual computation
    const p = basePoint;
    const p2 = p.double(); // 2P
    const p4 = p2.double(); // 4P
    const manual = p.add(p4); // P + 4P = 5P

    console.log('[5]*P manual vs algorithm:', {
      algorithm: bytesToHex(result.toBytes()),
      manual: bytesToHex(manual.toBytes()),
      match: bytesToHex(result.toBytes()) === bytesToHex(manual.toBytes())
    });

    expect(bytesToHex(result.toBytes())).toBe(bytesToHex(manual.toBytes()));
  });

  it('should verify [7]*P using binary expansion manually', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x02);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // 7 in binary = 111 (LSB first: 1, 1, 1)
    // Algorithm: result = O, addend = P
    // Bit 0: 1 -> result = O + P = P, addend = 2P
    // Bit 1: 1 -> result = P + 2P = 3P, addend = 4P
    // Bit 2: 1 -> result = 3P + 4P = 7P, addend = 8P
    
    const result = basePoint.scalarMult(7n);
    
    // Manual computation
    const p = basePoint;
    const p2 = p.double(); // 2P
    const p4 = p2.double(); // 4P
    const p3 = p.add(p2); // P + 2P = 3P
    const manual = p3.add(p4); // 3P + 4P = 7P

    console.log('[7]*P manual vs algorithm:', {
      algorithm: bytesToHex(result.toBytes()),
      manual: bytesToHex(manual.toBytes()),
      match: bytesToHex(result.toBytes()) === bytesToHex(manual.toBytes())
    });

    expect(bytesToHex(result.toBytes())).toBe(bytesToHex(manual.toBytes()));
  });

  it('should verify [35]*P = [5]*[7]*P manually', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // 35 in binary = 100011 (LSB first: 1, 1, 0, 0, 0, 1)
    const result35 = basePoint.scalarMult(35n);
    
    // [5]*[7]*P
    const p7 = basePoint.scalarMult(7n);
    const result5times7 = p7.scalarMult(5n);

    console.log('[35]*P vs [5]*([7]*P):', {
      '[35]*P': bytesToHex(result35.toBytes()),
      '[5]*([7]*P)': bytesToHex(result5times7.toBytes()),
      match: bytesToHex(result35.toBytes()) === bytesToHex(result5times7.toBytes())
    });

    expect(bytesToHex(result35.toBytes())).toBe(bytesToHex(result5times7.toBytes()));
  });
});
