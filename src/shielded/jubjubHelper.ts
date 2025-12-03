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
import { concatBytes } from '../utils/bytes';

/**
 * Jubjub curve parameters
 * Twisted Edwards: -x² + y² = 1 - (10540/10741) * x² * y²
 */
const JUBJUB = {
  // Field modulus
  p: 52435875175126190479447740508185965837690552500527637822603658699938581184513n,
  // Order of subgroup
  order: 6554484396890773809930967563523245960744023425112482949290220310578048130569n,
  // Curve coefficients
  a: 1n,
  d: -10540n / 10741n, // Normalized form
  // Base point (generator)
  // Gu = 8967009104981691511184280257777137469511400633666422603073258241851469509970n
  // Gv = 15931800829954170746055714094219556811473228541646137357846426087758294707819n
};

/**
 * Zcash Sapling Generator Points
 * These are the standard generators used in Zcash Sapling for various operations.
 * 
 * Reference: https://github.com/zcash/librustzcash/blob/master/zcash_primitives/src/constants.rs
 */

/**
 * Spending key generator
 * Used for: rk = [ask + alpha] * SPENDING_KEY_GENERATOR
 */
export const SPENDING_KEY_GENERATOR_COORDS = {
  x: 8967009104981691511184280257777137469511400633666422603073258241851469509970n,
  y: 15931800829954170746055714094219556811473228541646137357846426087758294707819n
};

/**
 * Nullifier key generator
 * Used for: nk = [nsk] * NULLIFIER_KEY_GENERATOR
 * This is a different generator than the spending key generator for domain separation
 */
export const NULLIFIER_KEY_GENERATOR_COORDS = {
  // These coordinates are derived from hashing "Zcash_nk" to the curve
  x: 13257218937473648831565167659780627655778652077612510227515979838513697220107n,
  y: 15735419008645693368779294692704312050507058605779716363261927908917723527043n
};

/**
 * Value commitment value base
 * Used for value commitments: cv = [value] * VALUE_COMMITMENT_VALUE_BASE + [rcv] * VALUE_COMMITMENT_RANDOMNESS_BASE
 */
export const VALUE_COMMITMENT_VALUE_COORDS = {
  x: 26956832112013842920656680211810897020336881160695741140854417693591223665728n,
  y: 36761747689931614879618133855953832474549403954500496014818248965025685621088n
};

/**
 * Value commitment randomness base
 */
export const VALUE_COMMITMENT_RANDOMNESS_COORDS = {
  x: 7737318964748856445752822707833215563284210207051094489293836754148985196093n,
  y: 23391081245579608275957344764133104287153372456168826758067589732476387478527n
};

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
    return new FieldElement(this.value - other.value + JUBJUB.p);
  }

  /**
   * Multiply two field elements
   */
  multiply(other: FieldElement): FieldElement {
    return new FieldElement((this.value * other.value) % JUBJUB.p);
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
 */
export class JubjubPoint {
  x: FieldElement;
  y: FieldElement;
  isInfinity: boolean;

  /**
   * Create a Jubjub point
   */
  constructor(x: bigint | FieldElement, y: bigint | FieldElement, isInfinity = false) {
    this.x = x instanceof FieldElement ? x : new FieldElement(x);
    this.y = y instanceof FieldElement ? y : new FieldElement(y);
    this.isInfinity = isInfinity;
  }

  /**
   * Point doubling
   * 2 * P = (x3, y3) where:
   * x3 = (2*x*y) / (2 - a*x²)
   * y3 = (y² + a*x²) / (y² - a*x²)
   */
  double(): JubjubPoint {
    if (this.isInfinity) {
      return new JubjubPoint(0n, 1n, true);
    }

    const x2 = this.x.square();
    const y2 = this.y.square();
    const xx = x2.multiply(JUBJUB_A);
    const s = y2.add(xx).double();
    const m = this.y.scalarMult(3n).multiply(x2);
    const c = xx.multiply(xx);
    const x3 = m.square().subtract(s).subtract(s);
    const y3 = m.multiply(s.subtract(x3)).subtract(c.scalarMult(8n));

    return new JubjubPoint(x3, y3);
  }

  /**
   * Point addition
   * P + Q = (x3, y3)
   */
  add(other: JubjubPoint): JubjubPoint {
    if (this.isInfinity) return new JubjubPoint(other.x.value, other.y.value);
    if (other.isInfinity) return new JubjubPoint(this.x.value, this.y.value);

    const dxy = new FieldElement(JUBJUB.d).multiply(this.x).multiply(other.x).multiply(this.y).multiply(other.y);
    const one = new FieldElement(1n);
    const denominator = one.add(dxy);
    const denominator2 = one.subtract(dxy);

    if (denominator.value === 0n || denominator2.value === 0n) {
      return new JubjubPoint(0n, 1n, true);
    }

    const x3 = this.x.multiply(other.y).add(this.y.multiply(other.x)).multiply(denominator.invert());
    const y3 = this.y.multiply(other.y).add(new FieldElement(JUBJUB.a).multiply(this.x).multiply(other.x)).multiply(denominator2.invert());

    return new JubjubPoint(x3, y3);
  }

  /**
   * Scalar multiplication using binary expansion
   * Computes k * P where k is a scalar
   */
  scalarMult(scalar: bigint): JubjubPoint {
    scalar = mod(scalar, JUBJUB.order);

    let result = new JubjubPoint(0n, 1n, true); // Point at infinity
    let addend = new JubjubPoint(this.x.value, this.y.value);

    while (scalar > 0n) {
      if ((scalar & 1n) !== 0n) {
        result = result.add(addend);
      }
      addend = addend.double();
      scalar >>= 1n;
    }

    return result;
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
   * Decode point from compressed bytes
   */
  static fromBytes(bytes: Uint8Array): JubjubPoint {
    if (bytes.length !== 32) {
      throw new Error('Invalid point encoding length');
    }

    const yBytes = new Uint8Array(bytes);
    const xSign = (yBytes[31] & 0x80) !== 0;
    yBytes[31] &= 0x7f;

    const y = FieldElement.fromBytes(yBytes);
    const x = recoverX(y, xSign);

    return new JubjubPoint(x.value, y.value);
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
  // x² = (y² - 1) / (d*y² - a)
  const y2 = y.square();
  const one = new FieldElement(1n);
  const numerator = y2.subtract(one);
  const d_y2 = new FieldElement(JUBJUB.d).multiply(y2);
  const denominator = d_y2.subtract(new FieldElement(JUBJUB.a));

  const x2 = numerator.multiply(denominator.invert());
  const x = sqrt(x2);

  // Return x with correct sign
  if ((x.value & 1n) !== 0n ? xSign : !xSign) {
    return x;
  } else {
    return new FieldElement(JUBJUB.p - x.value);
  }
}

/**
 * Compute modular square root using Tonelli-Shanks
 */
function sqrt(x: FieldElement): FieldElement {
  // For Jubjub, p ≡ 5 (mod 8)
  // Using special case for p ≡ 5 (mod 8)
  const exp = (JUBJUB.p + 3n) / 8n;
  const candidate = x.scalarMult(modexp(x.value, exp, JUBJUB.p));

  return candidate;
}

/**
 * Diversify hash - used for generating diverse payment addresses
 * ZIP 32: DiversifyHash(d) = Jubjub point
 */
export function diversifyHash(diversifier: Uint8Array): Uint8Array {
  // Zcash uses a specific personalization
  const input = concatBytes(
    Buffer.from('Zcash_Diversify'),
    diversifier
  );

  // Hash to get a field element candidate
  // Repeat until valid point found
  for (let i = 0; i < 256; i++) {
    const candidate = blake2s(concatBytes(input, new Uint8Array([i])), { dkLen: 32 });

    // Check if this is a valid y-coordinate
    try {
      // Try to construct point - if valid, return it
      const point = JubjubPoint.fromBytes(candidate);
      return point.toBytes();
    } catch {
      // Try next iteration
      continue;
    }
  }

  throw new Error('Could not find valid diversified point');
}

/**
 * Helper to reference JUBJUB.a as constant
 */
const JUBJUB_A = new FieldElement(JUBJUB.a);

/**
 * Compute shared secret using scalar multiplication on Jubjub
 * shared_secret = [ivk] * epk (scalar multiplication on Jubjub)
 */
export function computeSharedSecret(ivk: Uint8Array, epk: Uint8Array): Uint8Array {
  // epk is a Jubjub point (compressed, 32 bytes)
  const ephemeralPoint = JubjubPoint.fromBytes(epk);

  // ivk is a scalar (32 bytes)
  const scalar = bytesToBigInt(ivk);

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
  const scalar = bytesToBigInt(ivk);
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
