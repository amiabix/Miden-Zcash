/**
 * Debug test to check if point addition is commutative
 * If P + Q ≠ Q + P, that would explain the ECDH failure
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub Point Addition Commutativity', () => {
  it('should verify point addition is commutative', () => {
    const diversifier1 = new Uint8Array(11);
    diversifier1.fill(0x01);
    const diversifier2 = new Uint8Array(11);
    diversifier2.fill(0x02);

    const dHash1 = diversifyHash(diversifier1);
    const dHash2 = diversifyHash(diversifier2);
    
    const point1 = JubjubPoint.fromBytes(dHash1);
    const point2 = JubjubPoint.fromBytes(dHash2);

    // P + Q
    const result1 = point1.add(point2);
    
    // Q + P
    const result2 = point2.add(point1);

    console.log('Point addition commutativity:', {
      'P+Q': bytesToHex(result1.toBytes()),
      'Q+P': bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    // Point addition MUST be commutative
    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify point addition with same point equals double', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);

    const dHash = diversifyHash(diversifier);
    const point = JubjubPoint.fromBytes(dHash);

    // P + P
    const added = point.add(point);
    
    // 2 * P
    const doubled = point.double();

    console.log('P+P vs 2*P:', {
      'P+P': bytesToHex(added.toBytes()),
      '2*P': bytesToHex(doubled.toBytes()),
      match: bytesToHex(added.toBytes()) === bytesToHex(doubled.toBytes())
    });

    expect(bytesToHex(added.toBytes())).toBe(bytesToHex(doubled.toBytes()));
  });

  it('should verify point addition with infinity', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x04);

    const dHash = diversifyHash(diversifier);
    const point = JubjubPoint.fromBytes(dHash);
    const infinity = new JubjubPoint(0n, 1n, true);

    // P + O (infinity)
    const result1 = point.add(infinity);
    
    // O + P (infinity)
    const result2 = infinity.add(point);

    console.log('Point + Infinity:', {
      'P+O': bytesToHex(result1.toBytes()),
      'O+P': bytesToHex(result2.toBytes()),
      'original P': bytesToHex(point.toBytes()),
      '1==P': bytesToHex(result1.toBytes()) === bytesToHex(point.toBytes()),
      '2==P': bytesToHex(result2.toBytes()) === bytesToHex(point.toBytes())
    });

    // P + O should equal P
    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(point.toBytes()));
    expect(bytesToHex(result2.toBytes())).toBe(bytesToHex(point.toBytes()));
  });
});
