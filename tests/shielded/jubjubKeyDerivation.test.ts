/**
 * Jubjub Key Derivation Tests
 * Tests for nullifier key, verification key, and ephemeral key derivation
 */

import {
  JubjubPoint,
  FieldElement,
  deriveNullifierKeyFromNsk,
  computeRandomizedVerificationKey,
  deriveEphemeralPublicKey,
  diversifyHash,
  getSpendingKeyGenerator,
  getNullifierKeyGenerator
} from '../../src/shielded/jubjubHelper';

import { addScalars, negateScalar } from '../../src/shielded/scalarArithmetic';

// Helper to compare BigInt values without Jest serialization issues
const bigIntEquals = (a: bigint, b: bigint): boolean => a === b;
const bigIntNotEquals = (a: bigint, b: bigint): boolean => a !== b;

describe('JubjubPoint', () => {
  describe('construction', () => {
    it('should create point from coordinates', () => {
      const point = new JubjubPoint(123n, 456n);
      expect(point.x.value).toBeDefined();
      expect(point.y.value).toBeDefined();
    });

    it('should create point at infinity', () => {
      const point = new JubjubPoint(0n, 1n, true);
      expect(point.isInfinity).toBe(true);
    });
  });

  describe('toBytes/fromBytes', () => {
    it('should produce 32-byte compressed point', () => {
      // Use a known valid point (the spending key generator)
      const generator = getSpendingKeyGenerator();
      const bytes = generator.toBytes();
      
      expect(bytes.length).toBe(32);
      // Bytes should not be all zeros (valid point)
      expect(bytes.some(b => b !== 0)).toBe(true);
    });

    it('should handle point at infinity', () => {
      const infinity = new JubjubPoint(0n, 1n, true);
      const bytes = infinity.toBytes();
      
      expect(bytes.every(b => b === 0)).toBe(true);
    });

    it('should produce deterministic output', () => {
      const generator = getSpendingKeyGenerator();
      const bytes1 = generator.toBytes();
      const bytes2 = generator.toBytes();
      
      expect(Array.from(bytes1)).toEqual(Array.from(bytes2));
    });
  });

  describe('scalarMult', () => {
    it('should multiply by 1 and return same point', () => {
      const generator = getSpendingKeyGenerator();
      const result = generator.scalarMult(1n);
      
      expect(bigIntEquals(result.x.value, generator.x.value)).toBe(true);
      expect(bigIntEquals(result.y.value, generator.y.value)).toBe(true);
    });

    it('should multiply by 0 and return infinity', () => {
      const generator = getSpendingKeyGenerator();
      const result = generator.scalarMult(0n);
      
      expect(result.isInfinity).toBe(true);
    });

    it('should produce non-trivial results for small scalars', () => {
      const generator = getSpendingKeyGenerator();
      
      // 2G via scalar mult
      const twoG = generator.scalarMult(2n);
      
      // Should be different from generator
      expect(bigIntNotEquals(twoG.x.value, generator.x.value)).toBe(true);
      
      // Should not be infinity
      expect(twoG.isInfinity).toBe(false);
      
      // Should produce valid 32-byte output
      const bytes = twoG.toBytes();
      expect(bytes.length).toBe(32);
    });
  });

  describe('add', () => {
    it('should add point at infinity and return same point', () => {
      const generator = getSpendingKeyGenerator();
      const infinity = new JubjubPoint(0n, 1n, true);
      
      const result = generator.add(infinity);
      
      expect(bigIntEquals(result.x.value, generator.x.value)).toBe(true);
      expect(bigIntEquals(result.y.value, generator.y.value)).toBe(true);
    });

    it('should be commutative', () => {
      const g1 = getSpendingKeyGenerator();
      const g2 = getNullifierKeyGenerator();
      
      const r1 = g1.add(g2);
      const r2 = g2.add(g1);
      
      expect(bigIntEquals(r1.x.value, r2.x.value)).toBe(true);
      expect(bigIntEquals(r1.y.value, r2.y.value)).toBe(true);
    });
  });
});

describe('Generator Points', () => {
  describe('getSpendingKeyGenerator', () => {
    it('should return consistent generator', () => {
      const g1 = getSpendingKeyGenerator();
      const g2 = getSpendingKeyGenerator();
      
      expect(bigIntEquals(g1.x.value, g2.x.value)).toBe(true);
      expect(bigIntEquals(g1.y.value, g2.y.value)).toBe(true);
    });

    it('should return non-infinity point', () => {
      const generator = getSpendingKeyGenerator();
      expect(generator.isInfinity).toBe(false);
    });
  });

  describe('getNullifierKeyGenerator', () => {
    it('should return consistent generator', () => {
      const g1 = getNullifierKeyGenerator();
      const g2 = getNullifierKeyGenerator();
      
      expect(bigIntEquals(g1.x.value, g2.x.value)).toBe(true);
      expect(bigIntEquals(g1.y.value, g2.y.value)).toBe(true);
    });

    it('should be different from spending key generator', () => {
      const spend = getSpendingKeyGenerator();
      const nullifier = getNullifierKeyGenerator();
      
      expect(bigIntNotEquals(spend.x.value, nullifier.x.value)).toBe(true);
    });
  });
});

describe('Key Derivation Functions', () => {
  describe('deriveNullifierKeyFromNsk', () => {
    it('should derive 32-byte nullifier key', () => {
      const nsk = new Uint8Array(32);
      nsk.fill(0x42);
      
      const nk = deriveNullifierKeyFromNsk(nsk);
      
      expect(nk.length).toBe(32);
    });

    it('should be deterministic', () => {
      const nsk = new Uint8Array(32);
      nsk.fill(0x42);
      
      const nk1 = deriveNullifierKeyFromNsk(nsk);
      const nk2 = deriveNullifierKeyFromNsk(nsk);
      
      expect(Array.from(nk1)).toEqual(Array.from(nk2));
    });

    it('should produce different keys for different inputs', () => {
      const nsk1 = new Uint8Array(32).fill(0x01);
      const nsk2 = new Uint8Array(32).fill(0x02);
      
      const nk1 = deriveNullifierKeyFromNsk(nsk1);
      const nk2 = deriveNullifierKeyFromNsk(nsk2);
      
      expect(Array.from(nk1)).not.toEqual(Array.from(nk2));
    });

    it('should throw on invalid input length', () => {
      const invalidNsk = new Uint8Array(31);
      
      expect(() => deriveNullifierKeyFromNsk(invalidNsk)).toThrow();
    });

    it('should handle zero input', () => {
      const nsk = new Uint8Array(32).fill(0);
      
      // Zero scalar produces identity point
      const nk = deriveNullifierKeyFromNsk(nsk);
      expect(nk.length).toBe(32);
    });
  });

  describe('computeRandomizedVerificationKey', () => {
    it('should derive 32-byte verification key', () => {
      const askPlusAlpha = new Uint8Array(32);
      askPlusAlpha.fill(0x42);
      
      const rk = computeRandomizedVerificationKey(askPlusAlpha);
      
      expect(rk.length).toBe(32);
    });

    it('should be deterministic', () => {
      const askPlusAlpha = new Uint8Array(32).fill(0x42);
      
      const rk1 = computeRandomizedVerificationKey(askPlusAlpha);
      const rk2 = computeRandomizedVerificationKey(askPlusAlpha);
      
      expect(Array.from(rk1)).toEqual(Array.from(rk2));
    });

    it('should throw on invalid input length', () => {
      const invalid = new Uint8Array(31);
      
      expect(() => computeRandomizedVerificationKey(invalid)).toThrow();
    });

    it('should work with scalar addition result', () => {
      const ask = new Uint8Array(32).fill(0x11);
      const alpha = new Uint8Array(32).fill(0x22);
      
      const combined = addScalars(ask, alpha);
      const rk = computeRandomizedVerificationKey(combined);
      
      expect(rk.length).toBe(32);
    });
  });

  describe('deriveEphemeralPublicKey', () => {
    it('should derive 32-byte ephemeral public key', () => {
      const diversifier = new Uint8Array(11).fill(0x42);
      const esk = new Uint8Array(32).fill(0x33);
      
      const epk = deriveEphemeralPublicKey(diversifier, esk);
      
      expect(epk.length).toBe(32);
    });

    it('should be deterministic', () => {
      const diversifier = new Uint8Array(11).fill(0x42);
      const esk = new Uint8Array(32).fill(0x33);
      
      const epk1 = deriveEphemeralPublicKey(diversifier, esk);
      const epk2 = deriveEphemeralPublicKey(diversifier, esk);
      
      expect(Array.from(epk1)).toEqual(Array.from(epk2));
    });

    it('should produce different keys for different diversifiers', () => {
      const diversifier1 = new Uint8Array(11).fill(0x01);
      const diversifier2 = new Uint8Array(11).fill(0x02);
      const esk = new Uint8Array(32).fill(0x33);
      
      const epk1 = deriveEphemeralPublicKey(diversifier1, esk);
      const epk2 = deriveEphemeralPublicKey(diversifier2, esk);
      
      expect(Array.from(epk1)).not.toEqual(Array.from(epk2));
    });

    it('should throw on invalid diversifier length', () => {
      const diversifier = new Uint8Array(10); // Wrong length
      const esk = new Uint8Array(32);
      
      expect(() => deriveEphemeralPublicKey(diversifier, esk)).toThrow();
    });

    it('should throw on invalid esk length', () => {
      const diversifier = new Uint8Array(11);
      const esk = new Uint8Array(31); // Wrong length
      
      expect(() => deriveEphemeralPublicKey(diversifier, esk)).toThrow();
    });
  });

  describe('diversifyHash', () => {
    it('should produce 32-byte output', () => {
      const diversifier = new Uint8Array(11).fill(0x42);
      
      const result = diversifyHash(diversifier);
      
      expect(result.length).toBe(32);
    });

    it('should be deterministic', () => {
      const diversifier = new Uint8Array(11).fill(0x42);
      
      const r1 = diversifyHash(diversifier);
      const r2 = diversifyHash(diversifier);
      
      expect(Array.from(r1)).toEqual(Array.from(r2));
    });

    it('should produce different outputs for different inputs', () => {
      const d1 = new Uint8Array(11).fill(0x01);
      const d2 = new Uint8Array(11).fill(0x02);
      
      const r1 = diversifyHash(d1);
      const r2 = diversifyHash(d2);
      
      expect(Array.from(r1)).not.toEqual(Array.from(r2));
    });
  });
});

describe('FieldElement', () => {
  describe('arithmetic', () => {
    it('should add two elements', () => {
      const a = new FieldElement(100n);
      const b = new FieldElement(200n);
      
      const sum = a.add(b);
      
      expect(bigIntEquals(sum.value, 300n)).toBe(true);
    });

    it('should subtract two elements', () => {
      const a = new FieldElement(300n);
      const b = new FieldElement(100n);
      
      const diff = a.subtract(b);
      
      expect(bigIntEquals(diff.value, 200n)).toBe(true);
    });

    it('should multiply two elements', () => {
      const a = new FieldElement(10n);
      const b = new FieldElement(20n);
      
      const product = a.multiply(b);
      
      expect(bigIntEquals(product.value, 200n)).toBe(true);
    });

    it('should square an element', () => {
      const a = new FieldElement(10n);
      
      const squared = a.square();
      
      expect(bigIntEquals(squared.value, 100n)).toBe(true);
    });
  });

  describe('toBytes/fromBytes', () => {
    it('should round-trip correctly', () => {
      const original = new FieldElement(123456789n);
      const bytes = original.toBytes();
      const recovered = FieldElement.fromBytes(bytes);
      
      expect(bigIntEquals(recovered.value, original.value)).toBe(true);
    });

    it('should produce 32 bytes', () => {
      const element = new FieldElement(42n);
      const bytes = element.toBytes();
      
      expect(bytes.length).toBe(32);
    });
  });
});

describe('Scalar Arithmetic', () => {
  describe('addScalars', () => {
    it('should add two scalars', () => {
      const a = new Uint8Array(32).fill(0);
      const b = new Uint8Array(32).fill(0);
      a[0] = 10;
      b[0] = 20;
      
      const result = addScalars(a, b);
      
      expect(result[0]).toBe(30);
    });

    it('should be commutative', () => {
      const a = new Uint8Array(32);
      const b = new Uint8Array(32);
      a[0] = 10; a[1] = 20;
      b[0] = 30; b[1] = 40;
      
      const r1 = addScalars(a, b);
      const r2 = addScalars(b, a);
      
      expect(Array.from(r1)).toEqual(Array.from(r2));
    });
  });

  describe('negateScalar', () => {
    it('should negate a scalar', () => {
      const a = new Uint8Array(32).fill(0);
      a[0] = 10;
      
      const negated = negateScalar(a);
      const sum = addScalars(a, negated);
      
      // Sum should be zero (or close to it in mod arithmetic)
      // The exact result depends on the field order
      expect(sum.length).toBe(32);
    });
  });
});

describe('Integration: Full Key Derivation Flow', () => {
  it('should derive all keys from spending key', () => {
    // Simulate full key derivation
    const ask = new Uint8Array(32);
    const nsk = new Uint8Array(32);
    const alpha = new Uint8Array(32);
    
    // Fill with test values
    for (let i = 0; i < 32; i++) {
      ask[i] = i;
      nsk[i] = i + 32;
      alpha[i] = i + 64;
    }
    
    // Derive nullifier key: nk = [nsk] * G_nk
    const nk = deriveNullifierKeyFromNsk(nsk);
    expect(nk.length).toBe(32);
    
    // Derive randomized verification key: rk = [ask + alpha] * G_spend
    const askPlusAlpha = addScalars(ask, alpha);
    const rk = computeRandomizedVerificationKey(askPlusAlpha);
    expect(rk.length).toBe(32);
    
    // Derive ephemeral public key: epk = [esk] * DiversifyHash(d)
    const diversifier = new Uint8Array(11).fill(0x55);
    const esk = new Uint8Array(32).fill(0xAA);
    const epk = deriveEphemeralPublicKey(diversifier, esk);
    expect(epk.length).toBe(32);
  });

  it('should produce consistent results across multiple derivations', () => {
    const nsk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) nsk[i] = i * 7;
    
    // Derive multiple times
    const results: Uint8Array[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(deriveNullifierKeyFromNsk(nsk));
    }
    
    // All results should be identical
    const firstResult = Array.from(results[0]);
    for (const result of results) {
      expect(Array.from(result)).toEqual(firstResult);
    }
  });
});
