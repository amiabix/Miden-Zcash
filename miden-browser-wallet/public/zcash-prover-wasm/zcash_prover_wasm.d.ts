/* tslint:disable */
/* eslint-disable */

/**
 * Initialize the WASM module
 */
export function init(): void;

export function main(): void;

/**
 * Generate a Sapling output proof
 * 
 * # Arguments
 * * `value` - Output value in zatoshi
 * * `rcv` - 32-byte value commitment randomness
 * * `rcm` - 32-byte note commitment randomness
 * * `diversifier` - 11-byte diversifier
 * * `pk_d` - 32-byte transmission key
 * * `esk` - 32-byte ephemeral secret key
 * 
 * # Returns
 * Serialized result: proof (192 bytes) + cv (32 bytes) + cmu (32 bytes) = 256 bytes total
 */
export function prove_output(value: bigint, rcv: Uint8Array, rcm: Uint8Array, diversifier: Uint8Array, pk_d: Uint8Array, esk: Uint8Array): Uint8Array;

/**
 * Generate a Sapling spend proof
 * 
 * This function will use librustzcash to generate real Groth16 proofs
 * once the full implementation is complete.
 * 
 * # Arguments
 * * `spending_key` - 32-byte spending key (ask)
 * * `value` - Note value in zatoshi
 * * `rcv` - 32-byte value commitment randomness
 * * `alpha` - 32-byte randomizer for verification key
 * * `anchor` - 32-byte commitment tree root
 * * `merkle_path` - Merkle authentication path (serialized)
 * * `position` - Position in commitment tree
 * 
 * # Returns
 * Serialized result: proof (192 bytes) + cv (32 bytes) + rk (32 bytes) = 256 bytes total
 */
export function prove_spend(spending_key: Uint8Array, value: bigint, rcv: Uint8Array, alpha: Uint8Array, anchor: Uint8Array, _merkle_path: Uint8Array, _position: bigint): Uint8Array;

/**
 * Verify a Sapling output proof
 * 
 * # Arguments
 * * `proof` - 192-byte Groth16 proof
 * * `cv` - 32-byte value commitment
 * * `cmu` - 32-byte note commitment
 * * `ephemeral_key` - 32-byte ephemeral public key
 * 
 * # Returns
 * true if proof is valid, false otherwise
 */
export function verify_output(proof: Uint8Array, cv: Uint8Array, cmu: Uint8Array, ephemeral_key: Uint8Array): boolean;

/**
 * Verify a Sapling spend proof
 * 
 * # Arguments
 * * `proof` - 192-byte Groth16 proof
 * * `cv` - 32-byte value commitment
 * * `anchor` - 32-byte commitment tree root
 * * `nullifier` - 32-byte nullifier
 * * `rk` - 32-byte randomized verification key
 * 
 * # Returns
 * true if proof is valid, false otherwise
 */
export function verify_spend(proof: Uint8Array, cv: Uint8Array, anchor: Uint8Array, nullifier: Uint8Array, rk: Uint8Array): boolean;
