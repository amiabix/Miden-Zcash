/**
 * Simple test to verify basic scalar multiplication
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Scalar Multiplication Simple', () => {
  it('should verify [2]*P = P + P', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x01);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result1 = basePoint.scalarMult(2n);
    const result2 = basePoint.add(basePoint);

    console.log('[2]*P vs P+P:', {
      '[2]*P': bytesToHex(result1.toBytes()),
      'P+P': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify [3]*P = P + P + P', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x02);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result1 = basePoint.scalarMult(3n);
    const result2 = basePoint.add(basePoint).add(basePoint);

    console.log('[3]*P vs P+P+P:', {
      '[3]*P': bytesToHex(result1.toBytes()),
      'P+P+P': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify [4]*P = 2*([2]*P)', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result1 = basePoint.scalarMult(4n);
    const result2 = basePoint.scalarMult(2n).scalarMult(2n);

    console.log('[4]*P vs [2]*([2]*P):', {
      '[4]*P': bytesToHex(result1.toBytes()),
      '[2]*([2]*P)': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });
});
