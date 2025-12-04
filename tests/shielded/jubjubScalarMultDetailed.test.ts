/**
 * Detailed test to isolate the scalar multiplication bug
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash, bytesToBigIntLE } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Scalar Multiplication Detailed Debug', () => {
  it('should verify step-by-step scalar multiplication', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x01);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // Test: [5] * P step by step
    // 5 in binary = 101
    // Algorithm: Start with result = O, addend = P
    // Bit 0 (LSB): 1 -> result = O + P = P, addend = 2P
    // Bit 1: 0 -> result = P, addend = 4P
    // Bit 2: 1 -> result = P + 4P = 5P, addend = 8P
    
    const result5 = basePoint.scalarMult(5n);
    
    // Test: [7] * P step by step
    // 7 in binary = 111
    const result7 = basePoint.scalarMult(7n);
    
    // Test: [35] * P = [5*7] * P
    const result35 = basePoint.scalarMult(35n);
    
    // Test: [5] * ([7] * P)
    const result5times7 = result7.scalarMult(5n);
    
    // Test: [7] * ([5] * P)
    const result7times5 = result5.scalarMult(7n);

    console.log('Step-by-step results:', {
      '[5]*P': bytesToHex(result5.toBytes()),
      '[7]*P': bytesToHex(result7.toBytes()),
      '[35]*P': bytesToHex(result35.toBytes()),
      '[5]*([7]*P)': bytesToHex(result5times7.toBytes()),
      '[7]*([5]*P)': bytesToHex(result7times5.toBytes()),
      '5*7==35': bytesToHex(result5times7.toBytes()) === bytesToHex(result35.toBytes()),
      '7*5==35': bytesToHex(result7times5.toBytes()) === bytesToHex(result35.toBytes()),
      '5*7==7*5': bytesToHex(result5times7.toBytes()) === bytesToHex(result7times5.toBytes())
    });

    // These should all be equal
    expect(bytesToHex(result5times7.toBytes())).toBe(bytesToHex(result35.toBytes()));
    expect(bytesToHex(result7times5.toBytes())).toBe(bytesToHex(result35.toBytes()));
    expect(bytesToHex(result5times7.toBytes())).toBe(bytesToHex(result7times5.toBytes()));
  });

  it('should verify scalar multiplication with order reduction', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x02);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const order = 6554484396890773809930967563523245960744023425112482949290220310578048130569n;
    
    // Test: [k] * P where k > order (should be reduced)
    const k = order + 5n;
    const result1 = basePoint.scalarMult(k);
    const result2 = basePoint.scalarMult(5n);

    console.log('Order reduction test:', {
      '[order+5]*P': bytesToHex(result1.toBytes()),
      '[5]*P': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify scalar multiplication with zero scalar', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result = basePoint.scalarMult(0n);

    console.log('Zero scalar test:', {
      '[0]*P': bytesToHex(result.toBytes()),
      isInfinity: result.isInfinity
    });

    expect(result.isInfinity).toBe(true);
  });
});
