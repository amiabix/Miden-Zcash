/**
 * Scalar Field Arithmetic for Jubjub
 *
 * Implements modular arithmetic operations on the Jubjub scalar field.
 * The Jubjub curve order (field modulus) is:
 * r = 6554484396890773809930967563523245960744023425112482949290220310578048130569
 *
 * All operations are reduced modulo r.
 */

/**
 * Jubjub scalar field order
 * This is the order of the subgroup used for Zcash Sapling
 */
const JUBJUB_ORDER = 6554484396890773809930967563523245960744023425112482949290220310578048130569n;

/**
 * Convert bytes (little-endian) to bigint
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

/**
 * Convert bigint to bytes (little-endian)
 */
export function bigIntToBytes(value: bigint, length: number = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  value = value & ((1n << BigInt(length * 8)) - 1n); // Mask to appropriate size
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(i * 8)) & 0xFFn);
  }
  return bytes;
}

/**
 * Reduce a value modulo the Jubjub scalar field order
 */
export function reduceModOrder(value: bigint): bigint {
  return ((value % JUBJUB_ORDER) + JUBJUB_ORDER) % JUBJUB_ORDER;
}

/**
 * Add two scalars (mod field order)
 */
export function addScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes');
  }

  // Convert to bigints (little-endian)
  const aVal = bytesToBigInt(a);
  const bVal = bytesToBigInt(b);

  // Add and reduce modulo order
  const sum = reduceModOrder(aVal + bVal);

  // Convert back to bytes
  return bigIntToBytes(sum, 32);
}

/**
 * Subtract two scalars (mod field order)
 */
export function subtractScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes');
  }

  // Convert to bigints (little-endian)
  const aVal = bytesToBigInt(a);
  const bVal = bytesToBigInt(b);

  // Subtract and reduce modulo order
  const difference = reduceModOrder(aVal - bVal + JUBJUB_ORDER);

  // Convert back to bytes
  return bigIntToBytes(difference, 32);
}

/**
 * Negate a scalar (mod field order)
 */
export function negateScalar(s: Uint8Array): Uint8Array {
  if (s.length !== 32) {
    throw new Error('Scalar must be 32 bytes');
  }

  // Convert to bigint (little-endian)
  const val = bytesToBigInt(s);

  // Negate: -val ≡ (r - val) mod r
  const negated = reduceModOrder(JUBJUB_ORDER - val);

  // Convert back to bytes
  return bigIntToBytes(negated, 32);
}

/**
 * Multiply two scalars (mod field order)
 */
export function multiplyScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes');
  }

  // Convert to bigints (little-endian)
  const aVal = bytesToBigInt(a);
  const bVal = bytesToBigInt(b);

  // Multiply and reduce modulo order
  const product = reduceModOrder(aVal * bVal);

  // Convert back to bytes
  return bigIntToBytes(product, 32);
}

/**
 * Compute modular inverse of a scalar (mod field order)
 * Uses extended Euclidean algorithm
 */
export function invertScalar(s: Uint8Array): Uint8Array {
  if (s.length !== 32) {
    throw new Error('Scalar must be 32 bytes');
  }

  // Convert to bigint (little-endian)
  const val = bytesToBigInt(s);

  if (val === 0n) {
    throw new Error('Cannot invert zero');
  }

  // Use Fermat's little theorem: a^(-1) ≡ a^(p-2) (mod p)
  // For our field: a^(-1) ≡ a^(r-2) (mod r)
  const inverse = modExp(val, JUBJUB_ORDER - 2n, JUBJUB_ORDER);

  // Convert back to bytes
  return bigIntToBytes(inverse, 32);
}

/**
 * Modular exponentiation: base^exp (mod modulus)
 */
function modExp(base: bigint, exp: bigint, modulus: bigint): bigint {
  let result = 1n;
  base = base % modulus;

  while (exp > 0n) {
    if ((exp & 1n) === 1n) {
      result = (result * base) % modulus;
    }
    exp >>= 1n;
    base = (base * base) % modulus;
  }

  return result;
}

/**
 * Check if a scalar is zero
 */
export function isZeroScalar(s: Uint8Array): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a scalar is equal to one
 */
export function isOneScalar(s: Uint8Array): boolean {
  if (s[0] !== 1) return false;
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== 0) {
      return false;
    }
  }
  return true;
}
