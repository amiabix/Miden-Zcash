/**
 * Debug test to isolate scalar multiplication issues
 * Tests if the problem is in scalar multiplication itself or in point operations
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash, bytesToBigIntLE } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Scalar Multiplication Debug', () => {
  it('should verify scalar multiplication is associative', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x01);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // Test: [2] * [3] * P should equal [6] * P
    const two = 2n;
    const three = 3n;
    const six = 6n;

    const result1 = basePoint.scalarMult(two).scalarMult(three);
    const result2 = basePoint.scalarMult(six);

    console.log('Associativity test ([2]*[3]*P vs [6]*P):', {
      result1: bytesToHex(result1.toBytes()),
      result2: bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify scalar multiplication with identity', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x02);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // Test: [1] * P should equal P
    const one = 1n;
    const result = basePoint.scalarMult(one);

    console.log('Identity test ([1]*P vs P):', {
      original: bytesToHex(basePoint.toBytes()),
      result: bytesToHex(result.toBytes()),
      match: bytesToHex(basePoint.toBytes()) === bytesToHex(result.toBytes())
    });

    expect(bytesToHex(basePoint.toBytes())).toBe(bytesToHex(result.toBytes()));
  });

  it('should verify scalar multiplication with zero', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    // Test: [0] * P should equal point at infinity
    const zero = 0n;
    const result = basePoint.scalarMult(zero);

    console.log('Zero test ([0]*P):', {
      result: bytesToHex(result.toBytes()),
      isInfinity: result.isInfinity,
      expected: '0000000000000000000000000000000000000000000000000000000000000000'
    });

    expect(result.isInfinity).toBe(true);
    expect(bytesToHex(result.toBytes())).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('should verify double equals scalarMult(2)', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x04);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const doubled = basePoint.double();
    const scalarMult2 = basePoint.scalarMult(2n);

    console.log('Double vs scalarMult(2):', {
      doubled: bytesToHex(doubled.toBytes()),
      scalarMult2: bytesToHex(scalarMult2.toBytes()),
      match: bytesToHex(doubled.toBytes()) === bytesToHex(scalarMult2.toBytes())
    });

    expect(bytesToHex(doubled.toBytes())).toBe(bytesToHex(scalarMult2.toBytes()));
  });

  it('should verify commutativity with small scalars', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x05);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const a = 5n;
    const b = 7n;

    // [a] * [b] * P
    const result1 = basePoint.scalarMult(a).scalarMult(b);
    
    // [b] * [a] * P
    const result2 = basePoint.scalarMult(b).scalarMult(a);

    // [a*b] * P (should equal both)
    const result3 = basePoint.scalarMult((a * b) % 6554484396890773809930967563523245960744023425112482949290220310578048130569n);

    console.log('Commutativity with small scalars:', {
      '[5]*[7]*P': bytesToHex(result1.toBytes()),
      '[7]*[5]*P': bytesToHex(result2.toBytes()),
      '[35]*P': bytesToHex(result3.toBytes()),
      '1==2': bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes()),
      '1==3': bytesToHex(result1.toBytes()) === bytesToHex(result3.toBytes()),
      '2==3': bytesToHex(result2.toBytes()) === bytesToHex(result3.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result3.toBytes()));
  });
});
