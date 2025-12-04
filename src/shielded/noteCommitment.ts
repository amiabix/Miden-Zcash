/**
 * Note Commitment and Nullifier Generation
 * Implements Sapling note commitment and nullifier computation
 */

import { blake2s } from '@noble/hashes/blake2s';
import { blake2b } from '@noble/hashes/blake2b';
import { concatBytes } from '../utils/bytes';
import { computePedersenNoteCommitment, computePedersenValueCommitment } from './pedersenHash.js';
import { NULLIFIER_KEY_GENERATOR_COORDS, JubjubPoint, FieldElement, bytesToBigIntLE } from './jubjubHelper.js';
import type {
  SaplingPaymentAddress,
  NotePlaintext
} from './types.js';

// Sapling constants
const SAPLING_COMMITMENT_PERSONALIZATION = new Uint8Array([
  0x53, 0x61, 0x70, 0x6c, 0x69, 0x6e, 0x67, 0x5f, // "Sapling_"
  0x4e, 0x6f, 0x74, 0x65, 0x43, 0x6f, 0x6d, 0x6d  // "NoteComm"
]);

const SAPLING_NULLIFIER_PERSONALIZATION = new Uint8Array([
  0x53, 0x61, 0x70, 0x6c, 0x69, 0x6e, 0x67, 0x5f, // "Sapling_"
  0x4e, 0x75, 0x6c, 0x6c, 0x69, 0x66, 0x69, 0x65  // "Nullifie"
]);

const SAPLING_PRF_EXPAND_PERSONALIZATION = new Uint8Array([
  0x53, 0x61, 0x70, 0x6c, 0x69, 0x6e, 0x67, 0x5f, // "Sapling_"
  0x45, 0x78, 0x70, 0x61, 0x6e, 0x64, 0x53, 0x65  // "ExpandSe"
]);

/**
 * PRF^expand function using BLAKE2s
 * 
 * In real Zcash, this uses BLAKE2b with 64-byte output.
 * We use BLAKE2s twice (with different domain separators) to get 64 bytes.
 */
export function prfExpand(sk: Uint8Array, t: number): Uint8Array {
  const input = concatBytes(sk, new Uint8Array([t]));
  
  // First 32 bytes
  const first = blake2s(concatBytes(SAPLING_PRF_EXPAND_PERSONALIZATION, input, new Uint8Array([0])), { 
    dkLen: 32 
  });
  
  // Second 32 bytes
  const second = blake2s(concatBytes(SAPLING_PRF_EXPAND_PERSONALIZATION, input, new Uint8Array([1])), { 
    dkLen: 32 
  });
  
  return concatBytes(first, second);
}

/**
 * Compute note commitment (cmu)
 *
 * The note commitment is: PedersenHash(rcm || value || diversifier || pk_d)
 * This uses the proper Jubjub-based Pedersen hash from Zcash Sapling
 */
export function computeNoteCommitment(
  diversifier: Uint8Array,
  pkD: Uint8Array,
  value: bigint,
  rcm: Uint8Array
): Uint8Array {
  // Use Pedersen hash for note commitment
  // This is the proper implementation that matches Zcash
  return computePedersenNoteCommitment(diversifier, pkD, value, rcm);
}

/**
 * Compute nullifier for a note
 * 
 * The nullifier is: BLAKE2s-256("Sapling_Nullifie", nk || position || cmu)
 * 
 * In reality, this uses a PRF with the nullifier key, but we use BLAKE2s
 * as a placeholder.
 */
export function computeNullifier(
  nk: Uint8Array,
  cmu: Uint8Array,
  position: bigint
): Uint8Array {
  if (nk.length !== 32) {
    throw new Error('nk must be 32 bytes');
  }
  if (cmu.length !== 32) {
    throw new Error('cmu must be 32 bytes');
  }

  // Encode position as 8 bytes little-endian
  const positionBytes = new Uint8Array(8);
  const view = new DataView(positionBytes.buffer);
  view.setBigUint64(0, position, true);

  // Concatenate inputs
  const input = concatBytes(nk, positionBytes, cmu);

  // Compute nullifier using BLAKE2s
  return blake2s(input, {
    key: SAPLING_NULLIFIER_PERSONALIZATION,
    dkLen: 32
  });
}

/**
 * Derive nullifier key (nk) from nullifier deriving key (nsk)
 * 
 * nk = [nsk] * generator_nk
 * 
 * Uses proper Jubjub scalar multiplication
 */
export function deriveNullifierKey(nsk: Uint8Array): Uint8Array {
  if (nsk.length !== 32) {
    throw new Error('nsk must be 32 bytes');
  }

  // Convert nsk to scalar (little-endian)
  const nskScalar = bytesToBigIntLE(nsk);
  
  // Create generator point
  const generator = new JubjubPoint(
    new FieldElement(NULLIFIER_KEY_GENERATOR_COORDS.x),
    new FieldElement(NULLIFIER_KEY_GENERATOR_COORDS.y)
  );
  
  // Compute nk = [nsk] * generator_nk
  const nkPoint = generator.scalarMult(nskScalar);
  
  // Return compressed point bytes (32 bytes)
  return nkPoint.toBytes();
}

/**
 * Generate random commitment trapdoor (rcm)
 */
export function generateRcm(): Uint8Array {
  const rcm = new Uint8Array(32);
  crypto.getRandomValues(rcm);
  
  // Reduce modulo the Jubjub scalar field order
  // Placeholder: in real implementation, this would reduce mod r
  return rcm;
}

/**
 * Generate random rseed for note
 */
export function generateRseed(): Uint8Array {
  const rseed = new Uint8Array(32);
  crypto.getRandomValues(rseed);
  return rseed;
}

/**
 * Derive rcm from rseed (for ZIP 212 compliance)
 * 
 * rcm = PRF^expand(rseed, 0x04)
 */
export function deriveRcmFromRseed(rseed: Uint8Array): Uint8Array {
  if (rseed.length !== 32) {
    throw new Error('rseed must be 32 bytes');
  }
  
  const expanded = prfExpand(rseed, 0x04);
  // Take first 32 bytes and reduce mod r (placeholder)
  return expanded.slice(0, 32);
}

/**
 * Partial note type for creation (without nullifier, position, witness)
 */
export interface PartialNote {
  commitment: Uint8Array;
  value: number;
  rcm: Uint8Array;
  rseed: Uint8Array;
  cmu: Uint8Array;
  address: string;
  diversifier: Uint8Array;
  pkD: Uint8Array;
  memo?: Uint8Array;
  spent: boolean;
}

export function createNote(
  address: SaplingPaymentAddress,
  value: bigint,
  memo?: Uint8Array
): PartialNote {
  // Generate random rseed
  const rseed = generateRseed();
  
  // Derive rcm from rseed
  const rcm = deriveRcmFromRseed(rseed);
  
  // Compute note commitment
  const cmu = computeNoteCommitment(
    address.diversifier,
    address.pkD,
    value,
    rcm
  );

  return {
    commitment: cmu,
    value: Number(value),
    rcm,
    rseed,
    cmu,
    address: '', // Will be encoded from diversifier + pkD
    diversifier: address.diversifier,
    pkD: address.pkD,
    memo: memo || new Uint8Array(512),
    spent: false
  };
}

/**
 * Compute value commitment (cv)
 *
 * cv = PedersenHash(value || rcv)
 * Uses Jubjub-based Pedersen hash for value commitments
 */
export function computeValueCommitment(
  value: bigint,
  rcv: Uint8Array
): Uint8Array {
  // Use Pedersen hash for value commitment
  // This provides proper cryptographic binding for value confidentiality
  return computePedersenValueCommitment(value, rcv);
}

/**
 * Generate random value commitment trapdoor (rcv)
 */
export function generateRcv(): Uint8Array {
  const rcv = new Uint8Array(32);
  crypto.getRandomValues(rcv);
  return rcv;
}

/**
 * Encode note plaintext for encryption
 */
export function encodeNotePlaintext(
  note: Pick<PartialNote, 'diversifier' | 'value' | 'rseed' | 'memo'>
): Uint8Array {
  // Note plaintext format (564 bytes):
  // [1 byte: lead byte] [11 bytes: diversifier] [8 bytes: value] [32 bytes: rseed] [512 bytes: memo]
  
  const plaintext = new Uint8Array(564);
  let offset = 0;
  
  // Lead byte (0x02 for ZIP 212)
  plaintext[offset++] = 0x02;
  
  // Diversifier
  plaintext.set(note.diversifier, offset);
  offset += 11;
  
  // Value (8 bytes, little-endian)
  const valueView = new DataView(plaintext.buffer, offset, 8);
  valueView.setBigUint64(0, BigInt(note.value), true);
  offset += 8;
  
  // Rseed
  plaintext.set(note.rseed, offset);
  offset += 32;
  
  // Memo (512 bytes)
  if (note.memo) {
    const memoBytes = note.memo.length > 512 ? note.memo.slice(0, 512) : note.memo;
    plaintext.set(memoBytes, offset);
  }
  
  return plaintext;
}

/**
 * Decode note plaintext after decryption
 */
export function decodeNotePlaintext(plaintext: Uint8Array): NotePlaintext {
  if (plaintext.length !== 564) {
    throw new Error('Invalid plaintext length');
  }
  
  let offset = 0;
  
  // Lead byte
  const leadByte = plaintext[offset++];
  
  // Diversifier
  const diversifier = plaintext.slice(offset, offset + 11);
  offset += 11;
  
  // Value
  const valueView = new DataView(plaintext.buffer, plaintext.byteOffset + offset, 8);
  const value = valueView.getBigUint64(0, true);
  offset += 8;
  
  // Rseed
  const rseed = plaintext.slice(offset, offset + 32);
  offset += 32;
  
  // Memo
  const memo = plaintext.slice(offset, offset + 512);
  
  return {
    leadByte,
    diversifier,
    value,
    rseed,
    memo
  };
}

/**
 * Check if a nullifier has been spent (in local set)
 */
export function isNullifierSpent(
  nullifier: Uint8Array,
  spentNullifiers: Set<string>
): boolean {
  const nullifierHex = Array.from(nullifier)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return spentNullifiers.has(nullifierHex);
}

/**
 * Add nullifier to spent set
 */
export function markNullifierSpent(
  nullifier: Uint8Array,
  spentNullifiers: Set<string>
): void {
  const nullifierHex = Array.from(nullifier)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  spentNullifiers.add(nullifierHex);
}

// Re-export Pedersen functions for external use
export { computePedersenNoteCommitment, computePedersenValueCommitment } from './pedersenHash.js';

