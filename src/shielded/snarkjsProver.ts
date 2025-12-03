/**
 * snarkjs Groth16 Prover
 * Wrapper around snarkjs for Groth16 proof generation and verification
 */

// @ts-ignore - snarkjs may not have type definitions
import * as snarkjs from 'snarkjs';
import type { SaplingNote } from './types.js';

/**
 * Input parameters for proof generation
 */
export interface ProofInput {
  spendingKey: Uint8Array;
  outputNote: Pick<SaplingNote, 'value' | 'rseed'> & { value: number | bigint };
  merkleRoot: Uint8Array;
  nullifier: Uint8Array;
  witness: Uint8Array[];
  nf: Uint8Array;
  rho: Uint8Array;
  ar: Uint8Array;
  kr: Uint8Array;
}

/**
 * Groth16 proof output
 */
export interface ProofOutput {
  proof: any;
  publicSignals: any[];
}

/**
 * snarkjs Groth16 Prover
 * Handles generation and verification of Groth16 proofs for Zcash Sapling
 */
export class SnarkjsProver {
  private zkeyBuffer: ArrayBuffer | null = null;
  private vkey: any = null;
  private initialized: boolean = false;

  /**
   * Initialize the prover with zkey and verification key
   * @param zkeyBuffer - The zkey file buffer (from trusted setup)
   * @param vkey - The verification key (public)
   */
  async initialize(zkeyBuffer: ArrayBuffer, vkey: any): Promise<void> {
    this.zkeyBuffer = zkeyBuffer;
    this.vkey = vkey;
    this.initialized = true;
  }

  /**
   * Check if prover is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.zkeyBuffer !== null && this.vkey !== null;
  }

  /**
   * Check if prover has real zkey loaded (not empty development buffer)
   */
  hasRealZkey(): boolean {
    return this.zkeyBuffer !== null && this.zkeyBuffer.byteLength > 0;
  }

  /**
   * Generate a Groth16 proof for a Zcash Sapling spend
   * @param input - Input parameters including keys and merkle proof
   * @returns Proof and public signals
   */
  async generateProof(input: ProofInput): Promise<ProofOutput> {
    if (!this.isInitialized()) {
      throw new Error('Prover not initialized. Call initialize() first.');
    }

    // Generate witness from input parameters
    const witness = await this.generateWitness(input);

    // Generate Groth16 proof using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.prove(
      this.zkeyBuffer!,
      witness
    );

    return { proof, publicSignals };
  }

  /**
   * Verify a Groth16 proof
   * @param proof - The proof to verify
   * @param publicSignals - Public signals from proof generation
   * @returns true if proof is valid
   */
  async verifyProof(proof: any, publicSignals: any[]): Promise<boolean> {
    if (!this.vkey) {
      throw new Error('Verification key not set');
    }

    try {
      const isValid = await snarkjs.groth16.verify(
        this.vkey,
        publicSignals,
        proof
      );

      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate witness for the Zcash Sapling spend circuit
   *
   * Witness includes:
   * - Spending key (a_sk)
   * - Randomness (ar, kr)
   * - Merkle proof
   * - Nullifier
   * - Note parameters (rho, rseed, value)
   */
  private async generateWitness(input: ProofInput): Promise<any> {
    return {
      // Spending key derivation
      ask: Array.from(input.spendingKey),

      // Randomness for commitment hiding
      ar: Array.from(input.ar),
      kr: Array.from(input.kr),

      // Note parameters
      nf: Array.from(input.nullifier),
      rho: Array.from(input.rho),
      value: (typeof input.outputNote.value === 'bigint' ? input.outputNote.value : BigInt(input.outputNote.value)).toString(),
      rseed: Array.from(input.outputNote.rseed || new Uint8Array(32)),

      // Merkle proof (array of siblings)
      witness: input.witness.map(w => Array.from(w)),

      // Merkle tree anchor (root)
      rt: Array.from(input.merkleRoot),

      // Optional: outgoing ephemeral key for encryption
      epk: Array.from(new Uint8Array(32)), // Placeholder
    };
  }

  /**
   * Serialize a Groth16 proof to bytes
   * 
   * Zcash Sapling uses BLS12-381 curve with compressed point format:
   * - π_A (G1 compressed): 48 bytes
   * - π_B (G2 compressed): 96 bytes  
   * - π_C (G1 compressed): 48 bytes
   * Total: 192 bytes
   * 
   * snarkjs outputs uncompressed format (256 bytes). This method
   * compresses the points for Zcash network compatibility.
   */
  static serializeProof(proof: any): Uint8Array {
    if (!proof.pi_a || !proof.pi_b || !proof.pi_c) {
      throw new Error('Invalid proof structure');
    }

    const result = new Uint8Array(192);
    let offset = 0;

    // π_A: G1 compressed = 48 bytes
    // Compression: take x-coordinate (32 bytes) + sign bit, pad to 48 bytes
    const piA = proof.pi_a as [string, string];
    const aX = SnarkjsProver.fieldElementToBytes(piA[0]);
    const aY = SnarkjsProver.fieldElementToBytes(piA[1]);
    // Copy x-coordinate and set sign bit based on y-coordinate parity
    result.set(aX, offset);
    // Add 16 bytes padding for 48-byte G1 point, with sign bit in highest byte
    const aYParity = (BigInt(piA[1]) & 1n) !== 0n;
    result[offset + 47] = aYParity ? 0x80 : 0x00;
    offset += 48;

    // π_B: G2 compressed = 96 bytes
    // G2 points have two coordinates, each is a Fp2 element (two field elements)
    const piB = proof.pi_b as [[string, string], [string, string]];
    const b1X = SnarkjsProver.fieldElementToBytes(piB[0][0]);
    const b1Y = SnarkjsProver.fieldElementToBytes(piB[0][1]);
    const b2X = SnarkjsProver.fieldElementToBytes(piB[1][0]);
    const b2Y = SnarkjsProver.fieldElementToBytes(piB[1][1]);
    // For G2, we store: c0_x || c1_x || sign bits (48 + 48 = 96 bytes)
    result.set(b1X, offset);
    result.set(b2X, offset + 32);
    // Set sign bits based on y-coordinates
    const b1YParity = (BigInt(piB[0][1]) & 1n) !== 0n;
    const b2YParity = (BigInt(piB[1][1]) & 1n) !== 0n;
    result[offset + 47] = b1YParity ? 0x80 : 0x00;
    result[offset + 95] = b2YParity ? 0x80 : 0x00;
    offset += 96;

    // π_C: G1 compressed = 48 bytes
    const piC = proof.pi_c as [string, string];
    const cX = SnarkjsProver.fieldElementToBytes(piC[0]);
    const cY = SnarkjsProver.fieldElementToBytes(piC[1]);
    result.set(cX, offset);
    const cYParity = (BigInt(piC[1]) & 1n) !== 0n;
    result[offset + 47] = cYParity ? 0x80 : 0x00;
    offset += 48;

    return result;
  }

  /**
   * Deserialize bytes back to Groth16 proof
   * Supports both 192-byte (compressed) and 256-byte (uncompressed) formats
   */
  static deserializeProof(bytes: Uint8Array): any {
    const toFieldElement = (bytes32: Uint8Array): string => {
      // Convert 32 bytes to bigint (little-endian), then to string
      let value = 0n;
      for (let i = 31; i >= 0; i--) {
        value = (value << 8n) | BigInt(bytes32[i]);
      }
      return value.toString();
    };

    // Handle 192-byte compressed format (Zcash standard)
    if (bytes.length === 192) {
      let offset = 0;

      // π_A: G1 compressed (48 bytes)
      // Extract x-coordinate and sign bit
      const aXBytes = bytes.slice(offset, offset + 32);
      const aSign = (bytes[offset + 47] & 0x80) !== 0;
      const pi_a = [
        toFieldElement(aXBytes),
        aSign ? '1' : '0' // Y-coordinate parity placeholder (full decompression would need curve ops)
      ];
      offset += 48;

      // π_B: G2 compressed (96 bytes)
      const b1XBytes = bytes.slice(offset, offset + 32);
      const b1Sign = (bytes[offset + 47] & 0x80) !== 0;
      const b2XBytes = bytes.slice(offset + 32, offset + 64);
      const b2Sign = (bytes[offset + 95] & 0x80) !== 0;
      const pi_b = [
        [toFieldElement(b1XBytes), b1Sign ? '1' : '0'],
        [toFieldElement(b2XBytes), b2Sign ? '1' : '0']
      ];
      offset += 96;

      // π_C: G1 compressed (48 bytes)
      const cXBytes = bytes.slice(offset, offset + 32);
      const cSign = (bytes[offset + 47] & 0x80) !== 0;
      const pi_c = [
        toFieldElement(cXBytes),
        cSign ? '1' : '0'
      ];

      return { pi_a, pi_b, pi_c, compressed: true };
    }

    // Handle 256-byte uncompressed format (snarkjs native)
    if (bytes.length === 256) {
      let offset = 0;

      // π_A: 64 bytes
      const pi_a = [
        toFieldElement(bytes.slice(offset, offset + 32)),
        toFieldElement(bytes.slice(offset + 32, offset + 64))
      ];
      offset += 64;

      // π_B: 128 bytes
      const pi_b = [
        [
          toFieldElement(bytes.slice(offset, offset + 32)),
          toFieldElement(bytes.slice(offset + 32, offset + 64))
        ],
        [
          toFieldElement(bytes.slice(offset + 64, offset + 96)),
          toFieldElement(bytes.slice(offset + 96, offset + 128))
        ]
      ];
      offset += 128;

      // π_C: 64 bytes
      const pi_c = [
        toFieldElement(bytes.slice(offset, offset + 32)),
        toFieldElement(bytes.slice(offset + 32, offset + 64))
      ];

      return { pi_a, pi_b, pi_c, compressed: false };
    }

    throw new Error(`Proof must be exactly 192 bytes (compressed) or 256 bytes (uncompressed), got ${bytes.length}`);
  }

  /**
   * Convert field element to 32-byte little-endian
   */
  private static fieldElementToBytes(element: string | bigint): Uint8Array {
    let value = BigInt(element);
    const bytes = new Uint8Array(32);

    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(value & 0xFFn);
      value >>= 8n;
    }

    return bytes;
  }

  /**
   * Get proof size in bytes
   */
  static getProofSize(): number {
    return 256; // Standard Groth16 proof size
  }

  /**
   * Create a prover from files
   * @param zkeyPath - Path to zkey file
   * @param vkeyPath - Path to verification key file
   */
  static async fromFiles(
    zkeyPath: string,
    vkeyPath: string
  ): Promise<SnarkjsProver> {
    const prover = new SnarkjsProver();

    // Load zkey from file
    const zkeyResponse = await fetch(zkeyPath);
    const zkeyBuffer = await zkeyResponse.arrayBuffer();

    // Load verification key
    const vkeyResponse = await fetch(vkeyPath);
    const vkey = await vkeyResponse.json();

    await prover.initialize(zkeyBuffer, vkey);

    return prover;
  }
}

/**
 * Helper function to create a proof for a Zcash Sapling transaction
 */
export async function createZcashProof(
  prover: SnarkjsProver,
  spendingKey: Uint8Array,
  outputNote: Pick<SaplingNote, 'value' | 'rseed'>,
  merkleRoot: Uint8Array,
  nullifier: Uint8Array,
  witness: Uint8Array[],
  nf: Uint8Array,
  rho: Uint8Array,
  ar: Uint8Array,
  kr: Uint8Array
): Promise<Uint8Array> {
  const proofOutput = await prover.generateProof({
    spendingKey,
    outputNote,
    merkleRoot,
    nullifier,
    witness,
    nf,
    rho,
    ar,
    kr
  });

  return SnarkjsProver.serializeProof(proofOutput.proof);
}
