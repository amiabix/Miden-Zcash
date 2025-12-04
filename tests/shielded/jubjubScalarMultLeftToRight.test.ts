/**
 * Test left-to-right scalar multiplication as alternative
 */

import { JubjubPoint } from '../../src/shielded/jubjubHelper';
import { diversifyHash } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

// Left-to-right binary method implementation for testing
function scalarMultLeftToRight(point: JubjubPoint, scalar: bigint): JubjubPoint {
  if (point.isInfinity) {
    return new JubjubPoint(0n, 1n, true);
  }

  const order = 6554484396890773809930967563523245960744023425112482949290220310578048130569n;
  scalar = scalar % order;
  
  if (scalar === 0n) {
    return new JubjubPoint(0n, 1n, true);
  }

  // Left-to-right: process bits from MSB to LSB
  let result = new JubjubPoint(0n, 1n, true); // Point at infinity
  
  // Find the highest bit
  let temp = scalar;
  let bitLength = 0;
  while (temp > 0n) {
    bitLength++;
    temp >>= 1n;
  }
  
  // Process from MSB to LSB
  for (let i = bitLength - 1; i >= 0; i--) {
    result = result.double();
    if ((scalar >> BigInt(i)) & 1n) {
      result = result.add(point);
    }
  }
  
  return result;
}

describe('Jubjub Scalar Multiplication Left-to-Right', () => {
  it('should verify left-to-right matches right-to-left for [5]*P', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x01);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result1 = basePoint.scalarMult(5n);
    const result2 = scalarMultLeftToRight(basePoint, 5n);

    console.log('[5]*P comparison:', {
      rightToLeft: bytesToHex(result1.toBytes()),
      leftToRight: bytesToHex(result2.toBytes()),
      match: bytesToHex(result1.toBytes()) === bytesToHex(result2.toBytes())
    });

    expect(bytesToHex(result1.toBytes())).toBe(bytesToHex(result2.toBytes()));
  });

  it('should verify left-to-right [35]*P = [5]*([7]*P)', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x02);
    
    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const result35 = scalarMultLeftToRight(basePoint, 35n);
    const p7 = scalarMultLeftToRight(basePoint, 7n);
    const result5times7 = scalarMultLeftToRight(p7, 5n);

    console.log('Left-to-right [35]*P vs [5]*([7]*P):', {
      '[35]*P': bytesToHex(result35.toBytes()),
      '[5]*([7]*P)': bytesToHex(result5times7.toBytes()),
      match: bytesToHex(result35.toBytes()) === bytesToHex(result5times7.toBytes())
    });

    expect(bytesToHex(result35.toBytes())).toBe(bytesToHex(result5times7.toBytes()));
  });
});
