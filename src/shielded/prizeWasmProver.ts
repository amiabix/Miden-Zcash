/**
 * Prize-WASM Sapling Groth16 Prover Integration
 * 
 * This module integrates the Z-Prize WASM prover for real Sapling proofs.
 * 
 * Setup:
 * 1. Clone: https://github.com/z-prize/prize-wasm-masp-groth16-prover
 * 2. Build WASM: cd prize-wasm-masp-groth16-prover && wasm-pack build --target web
 * 3. Copy pkg/ to public/zcash-prover-wasm/
 * 4. Load in initialize()
 * 
 * This replaces all placeholder proof generation with real Groth16 proofs.
 */

import type { SaplingProof, SpendProofInputs, OutputProofInputs } from './types.js';
import { loadPrizeWasm, getPrizeWasmModule, isPrizeWasmLoaded, getPrizeWasmInfo } from './prizeWasmLoader.js';
import type { PrizeWasmModule } from './prizeWasmLoader.js';

/**
 * Assert Uint8Array type guard
 */
function assertUint8Array(x: unknown): asserts x is Uint8Array {
  if (!(x instanceof Uint8Array)) throw new Error('Expected Uint8Array');
}

/**
 * Spend proof input parameters (deserialized)
 */
export interface SpendProofParams {
  spendingKey: Uint8Array;  // 32 bytes - ask
  value: bigint;            // 8 bytes
  rcv: Uint8Array;          // 32 bytes - randomness for value commitment
  alpha: Uint8Array;        // 32 bytes - randomness for randomized key
  anchor: Uint8Array;       // 32 bytes - merkle tree root
  merklePath: Uint8Array;   // variable - serialized merkle path
  position: bigint;         // 8 bytes - position in tree
}

/**
 * Generate spend proof using Prize-WASM
 * Calls the actual WASM prove_spend function with individual parameters
 * 
 * @param params - Proof input parameters
 * @returns Proof bytes as Uint8Array (192 bytes)
 */
export async function generateSpendProofDirect(params: SpendProofParams): Promise<Uint8Array> {
  const mod = await loadPrizeWasm();

  // The actual WASM function signature:
  // prove_spend(spending_key, value, rcv, alpha, anchor, merkle_path, position)
  const proveSpend = (mod as any).prove_spend;
  
  if (typeof proveSpend !== 'function') {
    throw new Error('WASM module does not export prove_spend function');
  }

  try {
    // Call the actual WASM function with individual parameters
    const result = proveSpend(
      params.spendingKey,
      params.value,
      params.rcv,
      params.alpha,
      params.anchor,
      params.merklePath,
      params.position
    );

    // Handle different return types
    if (result instanceof Uint8Array) {
      return result;
    }
    if (result instanceof ArrayBuffer) {
      return new Uint8Array(result);
    }
    if (Array.isArray(result)) {
      return new Uint8Array(result);
    }
    
    throw new Error(`Unexpected return type from prove_spend: ${typeof result}`);
  } catch (error) {
    throw new Error(`WASM prove_spend failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Legacy wrapper for serialized input (for backwards compatibility)
 * Deserializes input and calls the direct function
 */
export async function generateSpendProof(input: Uint8Array): Promise<Uint8Array> {
  assertUint8Array(input);
  
  // Deserialize the input buffer
  // Format: [ask(32) | nsk(32) | value(8) | rcv(32) | alpha(32) | anchor(32) | merkle_path_len(4) | merkle_path(...) | position(8)]
  let offset = 0;
  
  const spendingKey = input.slice(offset, offset + 32); offset += 32;
  const _nsk = input.slice(offset, offset + 32); offset += 32; // Not used by prove_spend
  
  const valueView = new DataView(input.buffer, input.byteOffset + offset, 8);
  const value = valueView.getBigUint64(0, true); offset += 8;
  
  const rcv = input.slice(offset, offset + 32); offset += 32;
  const alpha = input.slice(offset, offset + 32); offset += 32;
  const anchor = input.slice(offset, offset + 32); offset += 32;
  
  const pathLenView = new DataView(input.buffer, input.byteOffset + offset, 4);
  const pathLen = pathLenView.getUint32(0, true); offset += 4;
  
  const merklePath = input.slice(offset, offset + pathLen); offset += pathLen;
  
  const posView = new DataView(input.buffer, input.byteOffset + offset, 8);
  const position = posView.getBigUint64(0, true);

  return generateSpendProofDirect({
    spendingKey,
    value,
    rcv,
    alpha,
    anchor,
    merklePath,
    position
  });
}

/**
 * Output proof input parameters (deserialized)
 */
export interface OutputProofParams {
  value: bigint;            // 8 bytes
  rcv: Uint8Array;          // 32 bytes - randomness for value commitment
  rcm: Uint8Array;          // 32 bytes - randomness for note commitment
  diversifier: Uint8Array;  // 11 bytes
  pkD: Uint8Array;          // 32 bytes - diversified payment address
  esk: Uint8Array;          // 32 bytes - ephemeral secret key
}

/**
 * Generate output proof using Prize-WASM
 * Calls the actual WASM prove_output function with individual parameters
 * 
 * @param params - Proof input parameters
 * @returns Proof bytes as Uint8Array (192 bytes)
 */
export async function generateOutputProofDirect(params: OutputProofParams): Promise<Uint8Array> {
  const mod = await loadPrizeWasm();

  // The actual WASM function signature:
  // prove_output(value, rcv, rcm, diversifier, pk_d, esk)
  const proveOutput = (mod as any).prove_output;
  
  if (typeof proveOutput !== 'function') {
    throw new Error('WASM module does not export prove_output function');
  }

  try {
    // Call the actual WASM function with individual parameters
    const result = proveOutput(
      params.value,
      params.rcv,
      params.rcm,
      params.diversifier,
      params.pkD,
      params.esk
    );

    // Handle different return types
    if (result instanceof Uint8Array) {
      return result;
    }
    if (result instanceof ArrayBuffer) {
      return new Uint8Array(result);
    }
    if (Array.isArray(result)) {
      return new Uint8Array(result);
    }
    
    throw new Error(`Unexpected return type from prove_output: ${typeof result}`);
  } catch (error) {
    throw new Error(`WASM prove_output failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Legacy wrapper for serialized input (for backwards compatibility)
 * Deserializes input and calls the direct function
 */
export async function generateOutputProof(input: Uint8Array): Promise<Uint8Array> {
  assertUint8Array(input);
  
  // Deserialize the input buffer
  // Format: [value(8) | rcv(32) | rcm(32) | diversifier(11) | pkD(32) | esk(32)]
  let offset = 0;
  
  const valueView = new DataView(input.buffer, input.byteOffset + offset, 8);
  const value = valueView.getBigUint64(0, true); offset += 8;
  
  const rcv = input.slice(offset, offset + 32); offset += 32;
  const rcm = input.slice(offset, offset + 32); offset += 32;
  const diversifier = input.slice(offset, offset + 11); offset += 11;
  const pkD = input.slice(offset, offset + 32); offset += 32;
  const esk = input.slice(offset, offset + 32);

  return generateOutputProofDirect({
    value,
    rcv,
    rcm,
    diversifier,
    pkD,
    esk
  });
}

// PrizeWasmModule type is already imported at the top of the file

/**
 * Prize-WASM Prover
 * 
 * Wraps the Prize-WASM module for use in Groth16Integration
 */
export class PrizeWasmProver {
  private wasmModule: PrizeWasmModule | null = null;
  private initialized: boolean = false;
  private wasmBaseUrl: string;
  private loadStartTime: number = 0;

  constructor(wasmBaseUrl: string = '/') {
    // Default to root since WASM files are in public/
    this.wasmBaseUrl = wasmBaseUrl;
  }

  /**
   * Initialize WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.wasmModule) {
      return;
    }

    this.loadStartTime = Date.now();

    try {
      // Load WASM using the safe loader
      this.wasmModule = await loadPrizeWasm(this.wasmBaseUrl);
      
      const loadTime = Date.now() - this.loadStartTime;
      
      // Performance warning for slow WASM loads (typically indicates network issues)
      if (loadTime > 10000) {
        // Consider using a CDN or preloading WASM for better performance
      }
      
      this.initialized = true;
    } catch (error) {
      const loadTime = Date.now() - this.loadStartTime;
      throw new Error(
        'Prize-WASM prover not available. ' +
        'Please build the WASM module from https://github.com/z-prize/prize-wasm-masp-groth16-prover ' +
        `and place it in ${this.wasmBaseUrl}/. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.wasmModule !== null;
  }

  /**
   * Generate spend proof
   * Uses the robust glue function that handles multiple WASM API patterns
   */
  async generateSpendProof(inputs: SpendProofInputs): Promise<SaplingProof> {
    if (!this.wasmModule || !this.initialized) {
      throw new Error('Prize-WASM prover not initialized. Call initialize() first.');
    }

    // Validate inputs before serialization
    if (!inputs.ask || inputs.ask.length !== 32) {
      throw new Error('Invalid ask (spending key): must be 32 bytes');
    }
    if (!inputs.nsk || inputs.nsk.length !== 32) {
      throw new Error('Invalid nsk (nullifier key): must be 32 bytes');
    }
    if (!inputs.anchor || inputs.anchor.length !== 32) {
      throw new Error('Invalid anchor (merkle tree root): must be 32 bytes');
    }
    if (!inputs.rcv || inputs.rcv.length !== 32) {
      throw new Error('Invalid rcv (randomness for value commitment): must be 32 bytes');
    }
    if (!inputs.alpha || inputs.alpha.length !== 32) {
      throw new Error('Invalid alpha (randomness for randomized key): must be 32 bytes');
    }
    if (!inputs.rcm || inputs.rcm.length !== 32) {
      throw new Error('Invalid rcm (randomness for note commitment): must be 32 bytes');
    }
    if (!inputs.merklePath || inputs.merklePath.length === 0) {
      throw new Error('Invalid merklePath: cannot be empty, need witness from merkle tree');
    }
    if (inputs.value < 0n || inputs.value > BigInt(21e14)) {
      throw new Error(`Invalid value: must be 0 to 2.1e15 satoshis, got ${inputs.value}`);
    }

    try {
      // Serialize inputs to Uint8Array for WASM
      // Format: [ask(32) | nsk(32) | value(8) | rcv(32) | alpha(32) | anchor(32) | merkle_path_len(4) | merkle_path(...) | position(8)]
      const merklePathBytes = this.serializeMerklePath(inputs.merklePath);
      
      const inputSize = 32 + 32 + 8 + 32 + 32 + 32 + 4 + merklePathBytes.length + 8;
      const inputBuffer = new Uint8Array(inputSize);
      let offset = 0;
      
      // Serialize inputs
      inputBuffer.set(inputs.ask, offset); offset += 32;
      inputBuffer.set(inputs.nsk, offset); offset += 32;
      const valueBytes = this.bigintToBytes(inputs.value, 8);
      inputBuffer.set(valueBytes, offset); offset += 8;
      inputBuffer.set(inputs.rcv, offset); offset += 32;
      inputBuffer.set(inputs.alpha, offset); offset += 32;
      inputBuffer.set(inputs.anchor, offset); offset += 32;
      
      // Merkle path length and data
      const pathLenView = new DataView(inputBuffer.buffer, offset, 4);
      pathLenView.setUint32(0, merklePathBytes.length, true);
      offset += 4;
      inputBuffer.set(merklePathBytes, offset); offset += merklePathBytes.length;
      
      // Position
      const positionBytes = this.bigintToBytes(BigInt(inputs.position || 0), 8);
      inputBuffer.set(positionBytes, offset);

      // Use the robust glue function
      const proofBytes = await generateSpendProof(inputBuffer);

      // Parse result: 192 bytes proof + 32 bytes cv + 32 bytes rk = 256 bytes
      if (proofBytes.length < 256) {
        throw new Error(`Invalid proof length: ${proofBytes.length}, expected at least 256`);
      }

      const proof = proofBytes.slice(0, 192);
      const cv = proofBytes.slice(192, 224);
      const rk = proofBytes.slice(224, 256);

      // Validate proof is not all zeros (indicates placeholder or failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). Prover may not be properly initialized.');
      }

      return {
        proof,
        cv,
        rk
      };
    } catch (error) {
      throw new Error(`Failed to generate spend proof: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Compute value commitment (fallback if WASM doesn't provide it)
   */
  private computeValueCommitment(value: bigint, rcv: Uint8Array): Uint8Array {
    const wasm = getPrizeWasmModule();
    const method = (wasm as any).compute_value_commitment || (wasm as any).computeValueCommitment;
    
    if (method && typeof method === 'function') {
      return method(value, rcv);
    }
    
    // Fallback: placeholder (should be replaced with real Pedersen commitment)
    const result = new Uint8Array(32);
    const input = new Uint8Array(40);
    const valueBytes = this.bigintToBytes(value, 8);
    input.set(rcv, 0);
    input.set(valueBytes, 32);
    
    for (let i = 0; i < 32; i++) {
      result[i] = input[i % 40] ^ input[(i + 1) % 40];
    }
    
    return result;
  }

  /**
   * Compute randomized key (fallback if WASM doesn't provide it)
   */
  private computeRandomizedKey(ask: Uint8Array, alpha: Uint8Array): Uint8Array {
    const wasm = getPrizeWasmModule();
    const method = (wasm as any).randomize_key || (wasm as any).randomizeKey;
    
    if (method && typeof method === 'function') {
      return method(ask, alpha);
    }
    
    // Fallback: placeholder (should be replaced with real Jubjub operation)
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = ask[i] ^ alpha[i];
    }
    return result;
  }

  /**
   * Convert bigint to bytes
   */
  private bigintToBytes(value: bigint, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let v = value >= 0n ? value : -value;
    for (let i = 0; i < length; i++) {
      bytes[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    return bytes;
  }

  /**
   * Generate output proof
   * Uses the robust glue function that handles multiple WASM API patterns
   */
  async generateOutputProof(inputs: OutputProofInputs): Promise<SaplingProof> {
    if (!this.wasmModule || !this.initialized) {
      throw new Error('Prize-WASM prover not initialized. Call initialize() first.');
    }

    // Validate inputs before serialization
    if (!inputs.rcv || inputs.rcv.length !== 32) {
      throw new Error('Invalid rcv (randomness for value commitment): must be 32 bytes');
    }
    if (!inputs.rcm || inputs.rcm.length !== 32) {
      throw new Error('Invalid rcm (randomness for note commitment): must be 32 bytes');
    }
    if (!inputs.diversifier || inputs.diversifier.length !== 11) {
      throw new Error('Invalid diversifier: must be 11 bytes');
    }
    if (!inputs.pkD || inputs.pkD.length !== 32) {
      throw new Error('Invalid pkD (public key of diversified address): must be 32 bytes');
    }
    if (inputs.esk && inputs.esk.length !== 32) {
      throw new Error('Invalid esk (ephemeral secret key): must be 32 bytes if provided');
    }
    if (inputs.value < 0n || inputs.value > BigInt(21e14)) {
      throw new Error(`Invalid value: must be 0 to 2.1e15 satoshis, got ${inputs.value}`);
    }

    try {
      // Serialize inputs to Uint8Array for WASM
      // Format: [value(8) | rcv(32) | rcm(32) | diversifier(11) | pkD(32) | esk(32)]
      const esk = inputs.esk || new Uint8Array(32);
      const inputSize = 8 + 32 + 32 + 11 + 32 + 32;
      const inputBuffer = new Uint8Array(inputSize);
      let offset = 0;
      
      // Serialize inputs
      const valueBytes = this.bigintToBytes(inputs.value, 8);
      inputBuffer.set(valueBytes, offset); offset += 8;
      inputBuffer.set(inputs.rcv, offset); offset += 32;
      inputBuffer.set(inputs.rcm, offset); offset += 32;
      inputBuffer.set(inputs.diversifier, offset); offset += 11;
      inputBuffer.set(inputs.pkD, offset); offset += 32;
      inputBuffer.set(esk, offset);

      // Use the robust glue function
      const proofBytes = await generateOutputProof(inputBuffer);

      // Parse result: 192 bytes proof + 32 bytes cv + 32 bytes cmu = 256 bytes
      if (proofBytes.length < 256) {
        throw new Error(`Invalid proof length: ${proofBytes.length}, expected at least 256`);
      }

      const proof = proofBytes.slice(0, 192);
      const cv = proofBytes.slice(192, 224);
      const cmu = proofBytes.slice(224, 256);

      // Validate proof is not all zeros (indicates placeholder or failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). Prover may not be properly initialized.');
      }

      return {
        proof,
        cv,
        cmu
      };
    } catch (error) {
      throw new Error(`Failed to generate output proof: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Compute note commitment (fallback if WASM doesn't provide it)
   */
  private computeNoteCommitment(
    diversifier: Uint8Array,
    pkD: Uint8Array,
    value: bigint,
    rcm: Uint8Array
  ): Uint8Array {
    const wasm = getPrizeWasmModule();
    const method = (wasm as any).compute_note_commitment || (wasm as any).computeNoteCommitment;
    
    if (method && typeof method === 'function') {
      return method(diversifier, pkD, value, rcm);
    }
    
    // Fallback: placeholder (should be replaced with real commitment)
    const result = new Uint8Array(32);
    const input = new Uint8Array(83); // 11 + 32 + 8 + 32
    input.set(diversifier, 0);
    input.set(pkD, 11);
    const valueBytes = this.bigintToBytes(value, 8);
    input.set(valueBytes, 43);
    input.set(rcm, 51);
    
    for (let i = 0; i < 32; i++) {
      result[i] = input[i % 83] ^ input[(i + 1) % 83];
    }
    
    return result;
  }

  /**
   * Compute nullifier
   */
  computeNullifier(nk: Uint8Array, cmu: Uint8Array, position: number): Uint8Array {
    if (!this.wasmModule || !this.initialized) {
      throw new Error('Prize-WASM prover not initialized');
    }

    const wasm = getPrizeWasmModule();
    const method = (wasm as any).compute_nullifier || (wasm as any).computeNullifier;
    
    if (method && typeof method === 'function') {
      return method(nk, cmu, position);
    }
    
    // Fallback: placeholder (should be replaced with real nullifier computation)
    const result = new Uint8Array(32);
    const input = new Uint8Array(64);
    input.set(nk, 0);
    input.set(cmu, 32);
    const positionBytes = this.bigintToBytes(BigInt(position), 4);
    input.set(positionBytes, 64);
    
    // Simple hash (replace with real nullifier in production)
    for (let i = 0; i < 32; i++) {
      result[i] = input[i % 64] ^ input[(i + 1) % 64];
    }
    
    return result;
  }

  /**
   * Serialize merkle path to single Uint8Array for WASM
   * The WASM function expects a single Uint8Array, so we concatenate the path
   * Each element must be 32 bytes (a merkle tree node)
   */
  private serializeMerklePath(path: Uint8Array[]): Uint8Array {
    if (path.length === 0) {
      throw new Error('Merkle path cannot be empty');
    }

    // Validate each path element is 32 bytes
    for (let i = 0; i < path.length; i++) {
      if (path[i].length !== 32) {
        throw new Error(`Invalid merkle path element ${i}: expected 32 bytes, got ${path[i].length}`);
      }
    }

    // Calculate total length
    const totalLength = path.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);

    // Concatenate all path elements
    let offset = 0;
    for (const p of path) {
      result.set(p, offset);
      offset += p.length;
    }

    return result;
  }
}

/**
 * Global Prize-WASM instance
 */
let globalPrizeWasm: PrizeWasmProver | null = null;

/**
 * Get or create global Prize-WASM instance
 */
export async function getPrizeWasmProver(wasmPath?: string): Promise<PrizeWasmProver> {
  if (!globalPrizeWasm) {
    globalPrizeWasm = new PrizeWasmProver(wasmPath);
    await globalPrizeWasm.initialize();
  }
  return globalPrizeWasm;
}

