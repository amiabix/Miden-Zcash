/**
 * Test point addition formula correctness
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Point Addition Formula', () => {
  it('should verify P + Q = Q + P (commutativity)', () => {
    const diversifier1 = new Uint8Array(11);
    diversifier1.fill(0x01);
    const diversifier2 = new Uint8Array(11);
    diversifier2.fill(0x02);

    const dHash1 = diversifyHash(diversifier1);
    const dHash2 = diversifyHash(diversifier2);
    
    const point1 = JubjubPoint.fromBytes(dHash1);
    const point2 = JubjubPoint.fromBytes(dHash2);

    const result1 = point1.add(point2);
    const result2 = point2.add(point1);

    console.log('P+Q vs Q+P:', {
      'P+Q': bytesToHex(result1.toBytes()),
      'Q+P': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify (P + Q) + R = P + (Q + R) (associativity)', () => {
    const diversifier1 = new Uint8Array(11);
    diversifier1.fill(0x01);
    const diversifier2 = new Uint8Array(11);
    diversifier2.fill(0x02);
    const diversifier3 = new Uint8Array(11);
    diversifier3.fill(0x03);

    const dHash1 = diversifyHash(diversifier1);
    const dHash2 = diversifyHash(diversifier2);
    const dHash3 = diversifyHash(diversifier3);
    
    const point1 = JubjubPoint.fromBytes(dHash1);
    const point2 = JubjubPoint.fromBytes(dHash2);
    const point3 = JubjubPoint.fromBytes(dHash3);

    const result1 = point1.add(point2).add(point3);
    const result2 = point1.add(point2.add(point3));

    console.log('(P+Q)+R vs P+(Q+R):', {
      '(P+Q)+R': bytesToHex(result1.toBytes()),
      'P+(Q+R)': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify [2]*P + [3]*P = [5]*P', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x04);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const p2 = basePoint.scalarMult(2n);
    const p3 = basePoint.scalarMult(3n);
    const p5 = basePoint.scalarMult(5n);

    const result = p2.add(p3);

    console.log('[2]*P + [3]*P vs [5]*P:', {
      '[2]*P + [3]*P': bytesToHex(result.toBytes()),
      '[5]*P': bytesToHex(p5.toBytes()),
      match: bytesToHex(result.toBytes()) === bytesToHex(p5.toBytes())
    });

    expect(bytesToHex(result.toBytes())).toBe(bytesToHex(p5.toBytes()));
  });
});
