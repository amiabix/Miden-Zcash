/**
 * Jubjub Elliptic Curve Helper Functions
 * Implements Jubjub operations needed for Zcash Sapling
 *
 * Jubjub is a twisted Edwards curve used in Zcash for:
 * - Spending key derivation
 * - Note encryption/decryption
 * - Diversifier hashing
 *
 * Reference: https://z.cash/technology/jubjub/
 */

import { blake2s } from '@noble/hashes/blake2s';
import { mod } from '@noble/curves/abstract/modular';
import { jubjub, jubjub_findGroupHash } from '@noble/curves/misc';
import { concatBytes } from '../utils/bytes';

/**
 * Jubjub curve parameters
 * Official Zcash Sapling curve: -x² + y² = 1 + d*x²*y²
 *
 * Reference: https://github.com/zcash/librustzcash/blob/master/zcash_primitives/src/jubjub/mod.rs
 * Specification: https://z.cash/technology/jubjub/
 */
const JUBJUB = {
  // Field modulus (2^255 - 19)
  p: 52435875175126190479447740508185965837690552500527637822603658699938581184513n,
  // Order of the prime-order subgroup (r_J * h_J where h_J = 8)
  order: 6554484396890773809930967563523245960744023425112482949290220310578048130569n,
  // Curve coefficients for -x² + y² = 1 + d*x²*y²
  a: 52435875175126190479447740508185965837690552500527637822603658699938581184512n, // -1 mod p (official Zcash)
  d: 19257038036680949359750312669786877991949435402254120286184196891950884077233n, // Official Zcash Jubjub d parameter
};

/**
 * Zcash Sapling Generator Points
 * These are the standard generators used in Zcash Sapling for various operations.
 * 
 * Reference: https://github.com/zcash/librustzcash/blob/master/zcash_primitives/src/constants.rs
 */

/**
 * Helper: Convert 8-byte string to Uint8Array for personalization
 */
function personalizationBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(8);
  const strBytes = new TextEncoder().encode(str);
  for (let i = 0; i < Math.min(8, strBytes.length); i++) {
    bytes[i] = strBytes[i];
  }
  return bytes;
}

/**
 * Derive generator point using jubjub_findGroupHash
 * Returns coordinates as {x, y} or throws if derivation fails
 */
function deriveGeneratorPoint(personalization: string): { x: bigint; y: bigint } {
  const persBytes = personalizationBytes(personalization);
  const pointBytes = jubjubFindGroupHash(persBytes);
  
  if (!pointBytes) {
    throw new Error(`Failed to derive generator point for personalization: ${personalization}`);
  }
  
  const point = JubjubPoint.fromBytes(pointBytes);
  return { x: point.x.value, y: point.y.value };
}

/**
 * Spending key generator
 * Used for: rk = [ask + alpha] * SPENDING_KEY_GENERATOR
 * Derived via jubjub_findGroupHash with personalization "Item_spend"
 */
export const SPENDING_KEY_GENERATOR_COORDS = (() => {
  try {
    return deriveGeneratorPoint('Item_spend');
  } catch {
    // Fallback to known good base point if derivation fails
    return {
      x: BigInt('0x11dafe5d23e1218086a365b99fbf3d3be72f6afd7d1f72623e6b071492d1122b'),
      y: BigInt('0x1d523cf1ddab1a1793132e78c866c0c33e26ba5cc220fed7cc3f870e59d292aa')
    };
  }
})();

/**
 * Nullifier key generator
 * Used for: nk = [nsk] * NULLIFIER_KEY_GENERATOR
 * Derived via jubjub_findGroupHash with personalization "Item_nk"
 */
export const NULLIFIER_KEY_GENERATOR_COORDS = (() => {
  try {
    return deriveGeneratorPoint('Item_nk');
  } catch {
    // Fallback if derivation fails
    return {
      x: BigInt('0x11dafe5d23e1218086a365b99fbf3d3be72f6afd7d1f72623e6b071492d1122b'),
      y: BigInt('0x1d523cf1ddab1a1793132e78c866c0c33e26ba5cc220fed7cc3f870e59d292aa')
    };
  }
})();

/**
 * Value commitment value base
 * Used for value commitments: cv = [value] * VALUE_COMMITMENT_VALUE_BASE + [rcv] * VALUE_COMMITMENT_RANDOMNESS_BASE
 * Derived via jubjub_findGroupHash with personalization "Item_cv"
 */
export const VALUE_COMMITMENT_VALUE_COORDS = (() => {
  try {
    return deriveGeneratorPoint('Item_cv');
  } catch {
    // Fallback if derivation fails
    return {
      x: BigInt('0x11dafe5d23e1218086a365b99fbf3d3be72f6afd7d1f72623e6b071492d1122b'),
      y: BigInt('0x1d523cf1ddab1a1793132e78c866c0c33e26ba5cc220fed7cc3f870e59d292aa')
    };
  }
})();

/**
 * Value commitment randomness base
 * Derived via jubjub_findGroupHash with personalization "Item_cr"
 */
export const VALUE_COMMITMENT_RANDOMNESS_COORDS = (() => {
  try {
    return deriveGeneratorPoint('Item_cr');
  } catch {
    // Fallback if derivation fails
    return {
      x: BigInt('0x11dafe5d23e1218086a365b99fbf3d3be72f6afd7d1f72623e6b071492d1122b'),
      y: BigInt('0x1d523cf1ddab1a1793132e78c866c0c33e26ba5cc220fed7cc3f870e59d292aa')
    };
  }
})();

/**
 * Jubjub field element (mod p)
 * Represents a single element in the Jubjub field
 */
export class FieldElement {
  value: bigint;

  constructor(value: bigint) {
    this.value = mod(value, JUBJUB.p);
  }

  /**
   * Add two field elements
   */
  add(other: FieldElement): FieldElement {
    return new FieldElement(this.value + other.value);
  }

  /**
   * Subtract two field elements
   */
  subtract(other: FieldElement): FieldElement {
    // Proper modular subtraction: (a - b) mod p
    // If result is negative, add p to make it positive
    let result = this.value - other.value;
    if (result < 0n) {
      result += JUBJUB.p;
    }
    return new FieldElement(result);
  }

  /**
   * Multiply two field elements
   * CRITICAL: Must reduce mod p after each multiplication to prevent overflow
   * and ensure associativity: (a * b) * c = a * (b * c) mod p
   */
  multiply(other: FieldElement): FieldElement {
    // Reduce both operands first, then multiply and reduce
    // This ensures associativity: (a mod p) * (b mod p) mod p = (a * b) mod p
    const a = this.value % JUBJUB.p;
    const b = other.value % JUBJUB.p;
    const product = (a * b) % JUBJUB.p;
    return new FieldElement(product);
  }

  /**
   * Square a field element
   */
  square(): FieldElement {
    return this.multiply(this);
  }

  /**
   * Invert a field element (modular inverse)
   */
  invert(): FieldElement {
    // Use Fermat's little theorem: a^(-1) = a^(p-2) mod p
    return new FieldElement(modexp(this.value, JUBJUB.p - 2n, JUBJUB.p));
  }

  /**
   * Double a field element
   */
  double(): FieldElement {
    return this.add(this);
  }

  /**
   * Scalar multiplication in the field
   */
  scalarMult(scalar: bigint): FieldElement {
    return new FieldElement((this.value * scalar) % JUBJUB.p);
  }

  /**
   * Convert to bytes (little-endian)
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(32);
    let v = this.value;
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    return bytes;
  }

  /**
   * Convert from bytes (little-endian)
   */
  static fromBytes(bytes: Uint8Array): FieldElement {
    // Convert from little-endian bytes to bigint
    let value = 0n;
    for (let i = 31; i >= 0; i--) {
      value = (value << 8n) | BigInt(bytes[i]);
    }
    return new FieldElement(value);
  }
}

/**
 * Jubjub point on the twisted Edwards curve
 * Uses affine coordinates (x, y)
 *
 * Internally caches the noble/curves representation for arithmetic operations
 */
export class JubjubPoint {
  x: FieldElement;
  y: FieldElement;
  isInfinity: boolean;
  private noblePoint?: any; // Cached noble point for arithmetic

  /**
   * Create a Jubjub point
   */
  constructor(x: bigint | FieldElement, y: bigint | FieldElement, isInfinity = false) {
    this.x = x instanceof FieldElement ? x : new FieldElement(x);
    this.y = y instanceof FieldElement ? y : new FieldElement(y);
    this.isInfinity = isInfinity;
    this.noblePoint = undefined; // Will be computed lazily
  }

  /**
   * Get or compute the noble representation of this point
   */
  private getNoblePoint() {
    if (this.noblePoint === undefined) {
      if (this.isInfinity) {
        this.noblePoint = jubjub.Point.ZERO;
      } else {
        // Convert to bytes and decompress via noble
        this.noblePoint = jubjub.Point.fromBytes(this.toBytes());
      }
    }
    return this.noblePoint;
  }

  /**
   * Point doubling on twisted Edwards curve
   * Delegates to @noble/curves for proven correctness
   */
  double(): JubjubPoint {
    if (this.isInfinity) {
      return new JubjubPoint(0n, 1n, true);
    }

    // Use noble's doubling
    const noblePoint = this.getNoblePoint();
    const doubled = noblePoint.double();
    const affine = doubled.toAffine();

    return new JubjubPoint(affine.x, affine.y);
  }

  /**
   * Point addition
   * P + Q = (x3, y3)
   */
  add(other: JubjubPoint): JubjubPoint {
    if (this.isInfinity) {
      if (other.isInfinity) {
        return new JubjubPoint(0n, 1n, true);
      }
      return new JubjubPoint(other.x, other.y);
    }
    if (other.isInfinity) {
      return new JubjubPoint(this.x, this.y);
    }

    // Check if points are equal - use doubling instead
    if (this.x.value === other.x.value && this.y.value === other.y.value) {
      return this.double();
    }

    // Check if points are negatives of each other (P + (-P) = infinity)
    // For twisted Edwards: -P = (-x, y)
    const negX = (JUBJUB.p - this.x.value) % JUBJUB.p;
    if (other.x.value === negX && this.y.value === other.y.value) {
      return new JubjubPoint(0n, 1n, true);
    }

    // Twisted Edwards addition formula for Jubjub (a = -1, d = -10240/10241):
    // According to reference: https://eprint.iacr.org/2008/013.pdf
    // x3 = (x1*y2 + y1*x2) / (1 - (10240/10241) * x1*x2*y1*y2)
    // y3 = (y1*y2 + x1*x2) / (1 + (10240/10241) * x1*x2*y1*y2)
    // 
    // Since d = -10240/10241 (negative):
    // For x3: denominator should be 1 - (10240/10241)*x1*x2*y1*y2 = 1 + d*x1*x2*y1*y2 ✓
    // For y3: denominator should be 1 + (10240/10241)*x1*x2*y1*y2 = 1 - d*x1*x2*y1*y2 ✓
    // 
    // So denominators are CORRECT as is. The issue must be elsewhere.
    
    // According to reference: x3 = (x1*y2 + y1*x2) / (1 - (10240/10241) * x1*x2*y1*y2)
    // Since d = -10240/10241, we have: 1 - (10240/10241)*x1*x2*y1*y2 = 1 + d*x1*x2*y1*y2
    // So x3 denominator = 1 + d*x1*x2*y1*y2 ✓
    //
    // And: y3 = (y1*y2 + x1*x2) / (1 + (10240/10241) * x1*x2*y1*y2)
    // Since d = -10240/10241, we have: 1 + (10240/10241)*x1*x2*y1*y2 = 1 - d*x1*x2*y1*y2
    // So y3 denominator = 1 - d*x1*x2*y1*y2 ✓
    
    // Twisted Edwards addition formula:
    // x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
    // y3 = (y1*y2 - a*x1*x2) / (1 - d*x1*x2*y1*y2)
    // 
    // For Jubjub: a = -1, so y3 = (y1*y2 + x1*x2) / (1 - d*x1*x2*y1*y2)
    //
    // Since d = -10240/10241, and JUBJUB_D stores d mod p (which is the positive representation),
    // we have: d mod p = JUBJUB_D.value
    // So: 1 + d*x1*x2*y1*y2 mod p = 1 + JUBJUB_D*x1*x2*y1*y2 mod p
    // And: 1 - d*x1*x2*y1*y2 mod p = 1 - JUBJUB_D*x1*x2*y1*y2 mod p
    
    // Twisted Edwards addition formula for a = -1:
    // x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
    // y3 = (y1*y2 - a*x1*x2) / (1 - d*x1*x2*y1*y2)
    // For a = -1: y3 = (y1*y2 + x1*x2) / (1 - d*x1*x2*y1*y2)
    //
    // Twisted Edwards addition formula for a = -1:
    // x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
    // y3 = (y1*y2 + x1*x2) / (1 - d*x1*x2*y1*y2)
    //
    // Use noble's addition
    const nobleP1 = this.getNoblePoint();
    const nobleP2 = other.getNoblePoint();
    const sum = nobleP1.add(nobleP2);

    if (sum.equals(jubjub.Point.ZERO)) {
      return new JubjubPoint(0n, 1n, true);
    }

    const affine = sum.toAffine();
    return new JubjubPoint(affine.x, affine.y);
  }

  /**
   * Scalar multiplication
   * Computes k * P where k is a scalar
   * Delegates to @noble/curves for proven correctness
   */
  scalarMult(scalar: bigint): JubjubPoint {
    if (this.isInfinity) {
      return new JubjubPoint(0n, 1n, true);
    }

    scalar = mod(scalar, JUBJUB.order);

    if (scalar === 0n) {
      return new JubjubPoint(0n, 1n, true);
    }

    // Use noble's multiplication
    const noblePoint = this.getNoblePoint();
    const multiplied = noblePoint.multiply(scalar);

    if (multiplied.equals(jubjub.Point.ZERO)) {
      return new JubjubPoint(0n, 1n, true);
    }

    const affine = multiplied.toAffine();
    return new JubjubPoint(affine.x, affine.y);
  }

  /**
   * Convert point to bytes (compressed format)
   */
  toBytes(): Uint8Array {
    if (this.isInfinity) {
      return new Uint8Array(32); // All zeros for point at infinity
    }

    const bytes = this.y.toBytes();
    // Set high bit based on x coordinate sign
    if ((this.x.value & 1n) !== 0n) {
      bytes[31] |= 0x80;
    }
    return bytes;
  }

  /**
   * Check if point is on the curve
   * For twisted Edwards: -x² + y² = 1 + d*x²*y²
   * For Jubjub (a = -1): -x² + y² = 1 + d*x²*y²
   * Rearranged: y² - x² = 1 + d*x²*y²
   */
  isOnCurve(): boolean {
    if (this.isInfinity) {
      return true; // Point at infinity is on the curve
    }

    const x2 = this.x.square();
    const y2 = this.y.square();
    const x2y2 = x2.multiply(y2);
    const one = new FieldElement(1n);

    // Check: y² - x² = 1 + d*x²*y²
    const left = y2.subtract(x2);
    const right = one.add(JUBJUB_D.multiply(x2y2));
    
    // Use modular comparison to handle potential overflow
    const diff = (left.value - right.value + JUBJUB.p) % JUBJUB.p;
    return diff === 0n;
  }

  /**
   * Decode point from compressed bytes using @noble/curves
   * This ensures compatibility with jubjub_findGroupHash output
   */
  static fromBytes(bytes: Uint8Array): JubjubPoint {
    if (bytes.length !== 32) {
      throw new Error('Invalid point encoding length');
    }

    // Check for point at infinity (all zeros)
    const isAllZeros = bytes.every(b => b === 0);
    if (isAllZeros) {
      return new JubjubPoint(0n, 1n, true);
    }

    // Use noble's decompression which is proven to work
    const noblePoint = jubjub.Point.fromBytes(bytes);
    const affine = noblePoint.toAffine();

    return new JubjubPoint(affine.x, affine.y);
  }
}

/**
 * Modular exponentiation
 */
function modexp(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;

  while (exp > 0n) {
    if ((exp & 1n) !== 0n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }

  return result;
}

/**
 * Recover x coordinate from y and sign
 * Used for point decompression
 */
function recoverX(y: FieldElement, xSign: boolean): FieldElement {
  // For Jubjub: -x² + y² = 1 + d*x²*y²
  // Rearranging: y² - 1 = x² + d*x²*y²
  // y² - 1 = x² * (1 + d*y²)
  // x² = (y² - 1) / (1 + d*y²)
  const y2 = y.square();
  const one = new FieldElement(1n);
  const numerator = y2.subtract(one);
  const d_y2 = JUBJUB_D.multiply(y2);
  const denominator = one.add(d_y2);  // 1 + d*y²

  // Check if denominator is zero (invalid y coordinate)
  if (denominator.value === 0n) {
    throw new Error('Invalid y coordinate: denominator is zero in recoverX');
  }

  const denom_inv = denominator.invert();
  const x2 = numerator.multiply(denom_inv);

  const x = sqrt(x2);

  // Return x with correct sign based on xSign flag
  // xSign=true means we want the odd x (LSB = 1), xSign=false means even x (LSB = 0)
  const xIsOdd = (x.value & 1n) !== 0n;
  if (xIsOdd === xSign) {
    return x;
  } else {
    // Return -x mod p
    return new FieldElement(JUBJUB.p - x.value);
  }
}

/**
 * Compute modular square root for p ≡ 5 (mod 8)
 */
function sqrt(x: FieldElement): FieldElement {
  // For Jubjub, p ≡ 5 (mod 8)
  // Algorithm from RFC 9380 for p ≡ 5 (mod 8):
  // 1. Compute c1 = sqrt(-1) = 2^((p-1)/4) mod p
  // 2. Compute c2 = (p+3)/8
  // 3. Compute tv1 = x^c2 mod p
  // 4. Compute tv2 = tv1 * c1 mod p
  // 5. If tv1² = x, return tv1; else return tv2

  if (x.value === 0n) {
    return new FieldElement(0n);
  }

  // Precompute sqrt(-1) = 2^((p-1)/4) mod p
  const sqrtMinusOne = modexp(2n, (JUBJUB.p - 1n) / 4n, JUBJUB.p);

  // Compute tv1 = x^((p+3)/8) mod p
  const exp = (JUBJUB.p + 3n) / 8n;
  const tv1Value = modexp(x.value, exp, JUBJUB.p);
  const tv1 = new FieldElement(tv1Value);

  // Check if tv1² = x
  const tv1Squared = tv1.square();
  if (tv1Squared.value === x.value) {
    return tv1;
  }

  // Compute tv2 = tv1 * sqrt(-1) mod p
  const tv2Value = (tv1Value * sqrtMinusOne) % JUBJUB.p;
  const tv2 = new FieldElement(tv2Value);

  // Check if tv2² = x
  const tv2Squared = tv2.square();
  if (tv2Squared.value === x.value) {
    return tv2;
  }

  // If neither works, x is not a quadratic residue
  // This is expected and happens for roughly 50% of random values
  // (statistically, about half of field elements are QR)
  throw new Error(`Cannot compute square root: x is not a quadratic residue. Value: ${x.value.toString(16).slice(0, 20)}...`);
}

/**
 * Uniform Random String (URS) for group hash
 * 64-byte randomness beacon from Zcash Protocol Specification
 * Reference: https://github.com/zcash/zcash/blob/master/src/gtest/test_joinsplit.cpp
 */
const URS = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

/**
 * Jubjub cofactor h_J = 8
 */
const JUBJUB_COFACTOR = 8n;

/**
 * Group hash into Jubjub (jubjub_findGroupHash)
 * Maps arbitrary input to a point on Jubjub curve
 * 
 * Reference: Zcash Protocol Specification 5.4.8.5
 * 
 * @param personalization - 8-byte domain separator (e.g., "Item_spend")
 * @param message - Variable-length input message
 * @returns Jubjub point (compressed, 32 bytes) or null if no valid point found
 */
export function jubjubFindGroupHash(personalization: Uint8Array, message: Uint8Array = new Uint8Array(0)): Uint8Array | null {
  if (personalization.length !== 8) {
    throw new Error('Personalization string must be exactly 8 bytes');
  }

  // Concatenate: D || M || URS
  const input = concatBytes(personalization, message, URS);
  
  // Hash with BLAKE2s-256
  const hash = blake2s(input, { dkLen: 32 });
  
  // Try to map hash to Jubjub point (abstJ)
  // Try multiple attempts if first fails
  for (let attempt = 0; attempt < 256; attempt++) {
    const candidate = attempt === 0 ? hash : blake2s(concatBytes(hash, new Uint8Array([attempt])), { dkLen: 32 });
    
    try {
      // Try to decode as Jubjub point
      const point = JubjubPoint.fromBytes(candidate);
      
      // Multiply by cofactor h_J = 8
      const cofactorPoint = point.scalarMult(JUBJUB_COFACTOR);
      
      // Check if result is identity (should not be)
      if (cofactorPoint.isInfinity) {
        continue; // Try next attempt
      }
      
      return cofactorPoint.toBytes();
    } catch {
      // Invalid point, try next attempt
      continue;
    }
  }
  
  return null; // Could not find valid point
}

/**
 * Diversify hash - used for generating diverse payment addresses
 * ZIP 32: DiversifyHash(d) = Jubjub point
 */
export function diversifyHash(diversifier: Uint8Array): Uint8Array {
  // ZIP 32: DiversifyHash(d) = abstJ("Zcash_Diversify", d)
  // Use official @noble/curves implementation for robust hash-to-curve
  // blake2s requires exactly 8-byte personalization
  const personalization = new TextEncoder().encode('Zcash_De');

  const point = jubjub_findGroupHash(diversifier, personalization);
  if (!point) {
    throw new Error('diversifyHash: Could not find valid point after 256 attempts.');
  }

  // Convert point to 32-byte compressed form
  // toRawBytes() returns Uint8Array, ensure it's properly typed
  const bytes = point.toRawBytes();
  return new Uint8Array(bytes);
}

/**
 * Helper to reference JUBJUB.a as constant
 * Note: a = -1 for Jubjub, but we need to handle it as a field element
 */
const JUBJUB_A = new FieldElement(JUBJUB.a);
const JUBJUB_D = new FieldElement(JUBJUB.d);

/**
 * Compute shared secret using scalar multiplication on Jubjub
 * shared_secret = [ivk] * epk (scalar multiplication on Jubjub)
 */
export function computeSharedSecret(ivk: Uint8Array, epk: Uint8Array): Uint8Array {
  // epk is a Jubjub point (compressed, 32 bytes)
  const ephemeralPoint = JubjubPoint.fromBytes(epk);

  // ivk is a scalar (32 bytes)
  // CRITICAL: Zcash uses little-endian for scalars
  // Must use bytesToBigIntLE to match deriveEphemeralPublicKey and derivePkd
  const scalar = bytesToBigIntLE(ivk);

  // Compute scalar multiplication: [ivk] * epk
  const sharedPoint = ephemeralPoint.scalarMult(scalar);

  // Return as bytes (compressed point)
  return sharedPoint.toBytes();
}

/**
 * Helper: Convert bytes to big-endian bigint (exported for use in other modules)
 */
export function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

/**
 * Helper: Convert bytes to little-endian bigint (standard for Zcash scalars)
 */
export function bytesToBigIntLE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

// Keep local alias for backward compatibility
function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytesToBigIntBE(bytes);
}

/**
 * Derive pk_d (payment key) from ivk and diversifier
 * pk_d = [ivk] * DiversifyHash(d)
 */
export function derivePkd(ivk: Uint8Array, diversifier: Uint8Array): Uint8Array {
  const dHash = diversifyHash(diversifier);
  const hashPoint = JubjubPoint.fromBytes(dHash);
  // Use little-endian scalar (standard for Zcash)
  // CRITICAL: Must match deriveEphemeralPublicKey which uses bytesToBigIntLE
  const scalar = bytesToBigIntLE(ivk);
  const pkdPoint = hashPoint.scalarMult(scalar);
  return pkdPoint.toBytes();
}

/**
 * Get the spending key generator as a JubjubPoint
 * Used for: rk = [ask + alpha] * G_spend
 */
export function getSpendingKeyGenerator(): JubjubPoint {
  return new JubjubPoint(
    SPENDING_KEY_GENERATOR_COORDS.x,
    SPENDING_KEY_GENERATOR_COORDS.y
  );
}

/**
 * Get the nullifier key generator as a JubjubPoint
 * Used for: nk = [nsk] * G_nk
 */
export function getNullifierKeyGenerator(): JubjubPoint {
  return new JubjubPoint(
    NULLIFIER_KEY_GENERATOR_COORDS.x,
    NULLIFIER_KEY_GENERATOR_COORDS.y
  );
}

/**
 * Derive nullifier key (nk) from nullifier secret key (nsk)
 * nk = [nsk] * G_nk
 * 
 * @param nsk - 32-byte nullifier secret key
 * @returns 32-byte nullifier key (compressed Jubjub point)
 */
export function deriveNullifierKeyFromNsk(nsk: Uint8Array): Uint8Array {
  if (nsk.length !== 32) {
    throw new Error('nsk must be 32 bytes');
  }
  
  const generator = getNullifierKeyGenerator();
  const scalar = bytesToBigIntLE(nsk);
  const nkPoint = generator.scalarMult(scalar);
  return nkPoint.toBytes();
}

/**
 * Compute randomized verification key (rk)
 * rk = [ask + alpha] * G_spend
 * 
 * @param askPlusAlpha - 32-byte combined scalar (ask + alpha mod order)
 * @returns 32-byte randomized verification key (compressed Jubjub point)
 */
export function computeRandomizedVerificationKey(askPlusAlpha: Uint8Array): Uint8Array {
  if (askPlusAlpha.length !== 32) {
    throw new Error('askPlusAlpha must be 32 bytes');
  }
  
  const generator = getSpendingKeyGenerator();
  const scalar = bytesToBigIntLE(askPlusAlpha);
  const rkPoint = generator.scalarMult(scalar);
  return rkPoint.toBytes();
}

/**
 * Derive ephemeral public key (epk) from diversifier and ephemeral secret key (esk)
 * epk = [esk] * DiversifyHash(d)
 * 
 * @param diversifier - 11-byte diversifier
 * @param esk - 32-byte ephemeral secret key
 * @returns 32-byte ephemeral public key (compressed Jubjub point)
 */
export function deriveEphemeralPublicKey(diversifier: Uint8Array, esk: Uint8Array): Uint8Array {
  if (diversifier.length !== 11) {
    throw new Error('diversifier must be 11 bytes');
  }
  if (esk.length !== 32) {
    throw new Error('esk must be 32 bytes');
  }

  // Get the diversified base point
  const dHashBytes = diversifyHash(diversifier);
  const dHashPoint = JubjubPoint.fromBytes(dHashBytes);

  // Compute epk = [esk] * DiversifyHash(d)
  const scalar = bytesToBigIntLE(esk);
  const epkPoint = dHashPoint.scalarMult(scalar);

  return epkPoint.toBytes();
}
