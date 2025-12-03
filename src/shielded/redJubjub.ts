/**
 * RedJubjub Signature Scheme for Zcash
 *
 * RedJubjub is a variant of the Schnorr signature scheme adapted to the Jubjub curve.
 * It's used for spend authorization and binding signatures in Zcash Sapling.
 *
 * Reference: https://zips.z.cash/zip-0215
 */

import { blake2s } from '@noble/hashes/blake2s';
import { JubjubPoint } from './jubjubHelper.js';
import { multiplyScalars, addScalars, reduceModOrder, bytesToBigInt, bigIntToBytes } from './scalarArithmetic.js';
import { concatBytes } from '../utils/bytes';

/**
 * Jubjub scalar field order
 */
const JUBJUB_ORDER = 6554484396890773809930967563523245960744023425112482949290220310578048130569n;

/**
 * Base point (generator) on Jubjub
 * This is the standard generator used for Zcash
 */
const JUBJUB_GENERATOR = new JubjubPoint(
  8967009104981691511184280257777137469511400633666422603073258241851469509970n,
  15931800829954170746055714094219556811473228541646137357846426087758294707819n
);

/**
 * RedJubjub public key
 */
export interface RedJubjubPublicKey {
  point: Uint8Array; // Compressed Jubjub point (32 bytes)
  raw: Uint8Array;   // Original bytes for verification
}

/**
 * RedJubjub signature
 */
export interface RedJubjubSignature {
  r: Uint8Array; // R point (32 bytes compressed)
  s: Uint8Array; // Scalar s (32 bytes)
}

/**
 * Derive public key from private key
 * pk = [sk] * G where G is the Jubjub generator
 */
export function derivePublicKey(privateKey: Uint8Array): RedJubjubPublicKey {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  // Convert private key to scalar (little-endian)
  const scalar = bytesToBigInt(privateKey);
  const reducedScalar = reduceModOrder(scalar);

  // Compute public key: [sk] * G
  const publicPoint = JUBJUB_GENERATOR.scalarMult(reducedScalar);

  // Return compressed point
  return {
    point: publicPoint.toBytes(),
    raw: privateKey
  };
}

/**
 * Sign a message with RedJubjub
 * Returns (R, s) where:
 * - R = [r] * G (commitment point)
 * - s = (r + H(R || A || M)) * sk mod order
 */
export function redJubjubSign(
  privateKey: Uint8Array,
  message: Uint8Array,
  nonce?: Uint8Array
): RedJubjubSignature {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  // Derive or use provided nonce
  const r = nonce || generateNonce(privateKey, message);

  // Convert nonce and private key to scalars
  const rScalar = bytesToBigInt(r);
  const skScalar = bytesToBigInt(privateKey);

  // Reduce both modulo order
  const rReduced = reduceModOrder(rScalar);
  const skReduced = reduceModOrder(skScalar);

  // Compute R = [r] * G
  const rPoint = JUBJUB_GENERATOR.scalarMult(rReduced);
  const rBytes = rPoint.toBytes();

  // Compute A = [sk] * G (public key)
  const aPoint = JUBJUB_GENERATOR.scalarMult(skReduced);
  const aBytes = aPoint.toBytes();

  // Compute challenge: H(R || A || M)
  const challengeInput = concatBytes(rBytes, aBytes, message);
  const challengeHash = blake2s(challengeInput, { dkLen: 32 });
  const challengeScalar = bytesToBigInt(challengeHash);
  const cReduced = reduceModOrder(challengeScalar);

  // Compute s = r + c * sk (mod order)
  const cBytes = bigIntToBytes(cReduced, 32);
  const skBytes = bigIntToBytes(skReduced, 32);
  const cTimesSkBytes = multiplyScalars(cBytes, skBytes);
  const sBytes = addScalars(r, cTimesSkBytes);

  return {
    r: rBytes,
    s: sBytes
  };
}

/**
 * Verify a RedJubjub signature
 * Checks that: [s] * G = R + [c] * A
 */
export function redJubjubVerify(
  publicKey: RedJubjubPublicKey,
  message: Uint8Array,
  signature: RedJubjubSignature
): boolean {
  try {
    // Decompress public key point
    const aPoint = JubjubPoint.fromBytes(publicKey.point);

    // Decompress R point from signature
    const rPoint = JubjubPoint.fromBytes(signature.r);

    // Compute challenge: H(R || A || M)
    const challengeInput = concatBytes(signature.r, publicKey.point, message);
    const challengeHash = blake2s(challengeInput, { dkLen: 32 });
    const cScalar = bytesToBigInt(challengeHash);
    const cReduced = reduceModOrder(cScalar);

    // Convert s to scalar
    const sScalar = bytesToBigInt(signature.s);
    const sReduced = reduceModOrder(sScalar);

    // Compute left side: [s] * G
    const leftPoint = JUBJUB_GENERATOR.scalarMult(sReduced);

    // Compute right side: R + [c] * A
    const cAPoint = aPoint.scalarMult(cReduced);
    const rightPoint = rPoint.add(cAPoint);

    // Check if equal
    return pointsEqual(leftPoint, rightPoint);
  } catch (error) {
    // Invalid signature format or computation failed
    return false;
  }
}

/**
 * Generate a nonce deterministically from private key and message
 * nonce = H(sk || M)
 */
function generateNonce(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  const input = concatBytes(privateKey, message);
  const hash = blake2s(input, { dkLen: 32 });
  // Ensure nonce is in valid range [1, r)
  const scalar = bytesToBigInt(hash);
  const reduced = reduceModOrder(scalar);
  return bigIntToBytes(reduced, 32);
}

/**
 * Check if two Jubjub points are equal
 */
function pointsEqual(p1: JubjubPoint, p2: JubjubPoint): boolean {
  // Compare compressed representations
  const p1Bytes = p1.toBytes();
  const p2Bytes = p2.toBytes();

  if (p1Bytes.length !== p2Bytes.length) {
    return false;
  }

  for (let i = 0; i < p1Bytes.length; i++) {
    if (p1Bytes[i] !== p2Bytes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Spend authorization signature
 * This is a specific type of RedJubjub signature used for spend authorization
 */
export function signSpendAuth(
  spendingKey: Uint8Array,
  sighash: Uint8Array
): RedJubjubSignature {
  // Spend authorization uses the spending key directly as the private key
  return redJubjubSign(spendingKey, sighash);
}

/**
 * Binding signature
 * Used to prove that value commitments balance
 */
export function signBinding(
  bindingKey: Uint8Array,
  sighash: Uint8Array
): RedJubjubSignature {
  // Binding signature uses the binding key
  return redJubjubSign(bindingKey, sighash);
}
