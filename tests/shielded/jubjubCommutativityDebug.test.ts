/**
 * Debug test for ECDH commutativity issue
 * Tests if the problem is in scalarMult, point compression, or something else
 */

import { JubjubPoint, diversifyHash, bytesToBigIntLE } from '../../src/shielded/jubjubHelper';
import { bytesToHex } from '../../src/utils/bytes';

describe('Jubjub ECDH Commutativity Debug', () => {
  it('should verify scalar multiplication is commutative without compression', () => {
    const ivk = new Uint8Array(32);
    ivk.fill(0x01);
    
    const esk = new Uint8Array(32);
    esk.fill(0x02);

    const diversifier = new Uint8Array(11);
    diversifier.fill(0x03);

    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);

    const ivk_scalar = bytesToBigIntLE(ivk);
    const esk_scalar = bytesToBigIntLE(esk);

    // Method 1: Compute [ivk] * [esk] * G directly
    const combinedScalar = (ivk_scalar * esk_scalar) % 6554484396890773809930967563523245960744023425112482949290220310578048130569n;
    const directResult = basePoint.scalarMult(combinedScalar);

    // Method 2: Compute [ivk] * ([esk] * G)
    const epk_point = basePoint.scalarMult(esk_scalar);
    const ss1_point = epk_point.scalarMult(ivk_scalar);

    // Method 3: Compute [esk] * ([ivk] * G)
    const pkD_point = basePoint.scalarMult(ivk_scalar);
    const ss2_point = pkD_point.scalarMult(esk_scalar);

    console.log('Commutativity Debug:', {
      direct: bytesToHex(directResult.toBytes()),
      ss1: bytesToHex(ss1_point.toBytes()),
      ss2: bytesToHex(ss2_point.toBytes()),
      ss1_equals_ss2: bytesToHex(ss1_point.toBytes()) === bytesToHex(ss2_point.toBytes()),
      direct_equals_ss1: bytesToHex(directResult.toBytes()) === bytesToHex(ss1_point.toBytes()),
      direct_equals_ss2: bytesToHex(directResult.toBytes()) === bytesToHex(ss2_point.toBytes())
    });

    // ss1 and ss2 should be equal (commutativity)
    expect(bytesToHex(ss1_point.toBytes())).toBe(bytesToHex(ss2_point.toBytes()));
  });

  it('should verify point compression/decompression is lossless', () => {
    const diversifier = new Uint8Array(11);
    diversifier.fill(0x04);

    const dHashBytes = diversifyHash(diversifier);
    const originalPoint = JubjubPoint.fromBytes(dHashBytes);

    // Compress and decompress
    const compressed = originalPoint.toBytes();
    const decompressed = JubjubPoint.fromBytes(compressed);

    // Should be the same point
    expect(decompressed.x.value).toBe(originalPoint.x.value);
    expect(decompressed.y.value).toBe(originalPoint.y.value);
    expect(decompressed.isInfinity).toBe(originalPoint.isInfinity);
  });

  it('should verify scalar multiplication after compression/decompression', () => {
    const ivk = new Uint8Array(32);
    ivk.fill(0x05);

    const diversifier = new Uint8Array(11);
    diversifier.fill(0x06);

    const dHashBytes = diversifyHash(diversifier);
    const basePoint = JubjubPoint.fromBytes(dHashBytes);
    const ivk_scalar = bytesToBigIntLE(ivk);

    // Compute directly
    const directResult = basePoint.scalarMult(ivk_scalar);

    // Compute via compression/decompression
    const compressed = basePoint.toBytes();
    const decompressed = JubjubPoint.fromBytes(compressed);
    const viaCompression = decompressed.scalarMult(ivk_scalar);

    console.log('Compression test:', {
      direct: bytesToHex(directResult.toBytes()),
      viaCompression: bytesToHex(viaCompression.toBytes()),
      match: bytesToHex(directResult.toBytes()) === bytesToHex(viaCompression.toBytes())
    });

    expect(bytesToHex(directResult.toBytes())).toBe(bytesToHex(viaCompression.toBytes()));
  });
});
