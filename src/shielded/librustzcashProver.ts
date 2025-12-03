/**
 * librustzcash WASM Prover
 * Wraps the Rust WASM module for Zcash proof generation
 */

import type { SaplingProof, SpendProofInputs, OutputProofInputs } from './types.js';

/**
 * WASM module type (imported from compiled WASM)
 * WASM uses bigint for u64 values
 */
interface ZcashProverWasm {
  init(): void;
  prove_spend(
    spending_key: Uint8Array,
    value: bigint,
    rcv: Uint8Array,
    alpha: Uint8Array,
    anchor: Uint8Array,
    merkle_path: Uint8Array,
    position: bigint
  ): Uint8Array;
  prove_output(
    value: bigint,
    rcv: Uint8Array,
    rcm: Uint8Array,
    diversifier: Uint8Array,
    pk_d: Uint8Array,
    esk: Uint8Array
  ): Uint8Array;
  verify_spend(
    proof: Uint8Array,
    cv: Uint8Array,
    anchor: Uint8Array,
    nullifier: Uint8Array,
    rk: Uint8Array
  ): boolean;
  verify_output(
    proof: Uint8Array,
    cv: Uint8Array,
    cmu: Uint8Array,
    ephemeral_key: Uint8Array
  ): boolean;
}

/**
 * librustzcash WASM Prover
 * Uses Zcash's official proving system via WASM
 */
export class LibrustzcashProver {
  private wasm: ZcashProverWasm | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the WASM module
   * @param wasmPath - Path to WASM module (default: '/zcash-prover-wasm_bg.wasm')
   */
  async initialize(wasmPath: string = '/zcash_prover_wasm_bg.wasm'): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load WASM module from public folder
      // In browser environment, we need to load the WASM file using fetch
      let wasmModule: any;

      if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
        // Browser environment: fetch the WASM file
        try {
          const response = await fetch(wasmPath);
          if (!response.ok) throw new Error('Failed to fetch WASM file');
          const buffer = await response.arrayBuffer();
          // Use raw WebAssembly.instantiate
          const wasmInstance = await WebAssembly.instantiate(buffer);
          wasmModule = wasmInstance.instance.exports;
        } catch (browserError) {
          throw new Error(`Failed to load WASM in browser: ${browserError}`);
        }
      } else {
        // Node.js environment: try require or relative import
        // Use dynamic require with string concatenation to prevent webpack from statically analyzing this
        try {
          // @ts-ignore - Node.js require (webpack will ignore this in browser builds)
          if (typeof require !== 'undefined') {
            // Use string concatenation to prevent webpack static analysis
            const path1 = '../../rust-wasm';
            const path2 = '/pkg/zcash_prover_wasm.js';
            const fullPath = path1 + path2;
            wasmModule = require(fullPath);
          } else {
            throw new Error('require not available');
          }
        } catch (e) {
          throw new Error('WASM module not available in Node.js environment');
        }
      }
      
      // Initialize WASM with the path to the .wasm file
      await wasmModule.default(wasmPath);
      
      // Initialize the module
      wasmModule.init();
      
      // Store the module
      this.wasm = wasmModule as unknown as ZcashProverWasm;
      
      this.initialized = true;
    } catch (error) {
      // Failed to load librustzcash WASM, will use fallback
      this.initialized = false;
      throw new Error(`Failed to initialize librustzcash WASM: ${error}`);
    }
  }

  /**
   * Check if prover is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.wasm !== null;
  }

  /**
   * Generate a Sapling spend proof
   */
  async generateSpendProof(inputs: SpendProofInputs): Promise<SaplingProof> {
    if (!this.wasm || !this.initialized) {
      throw new Error('librustzcash WASM not initialized. Call initialize() first.');
    }

    try {
      // Call Rust WASM function
      const result = this.wasm.prove_spend(
        inputs.ask,
        inputs.value,
        inputs.rcv,
        inputs.alpha,
        inputs.anchor,
        this.serializeMerklePath(inputs.merklePath),
        inputs.position
      );

      // Validate result size before parsing
      if (result.length < 256) {
        throw new Error(`Invalid proof result length: ${result.length}, expected at least 256 bytes`);
      }
      
      // Parse result (proof + cv + rk = 192 + 32 + 32 = 256 bytes)
      const proof = new Uint8Array(result.slice(0, 192));
      const cv = new Uint8Array(result.slice(192, 224));
      const rk = new Uint8Array(result.slice(224, 256));
      
      // Validate proof is not all zeros (indicates failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). WASM prover may not be properly initialized.');
      }
      
      // Validate cv is not all zeros
      if (cv.every(b => b === 0)) {
        throw new Error('Generated cv is invalid (all zeros). Value commitment generation failed.');
      }
      
      // Validate rk is not all zeros
      if (rk.every(b => b === 0)) {
        throw new Error('Generated rk is invalid (all zeros). Randomized key generation failed.');
      }

      return { proof, cv, rk };
    } catch (error) {
      throw new Error(`Failed to generate spend proof: ${error}`);
    }
  }

  /**
   * Generate a Sapling output proof
   */
  async generateOutputProof(inputs: OutputProofInputs): Promise<SaplingProof> {
    if (!this.wasm) {
      throw new Error('librustzcash WASM not initialized. Call initialize() first.');
    }

    try {
      // Call Rust WASM function
      const result = this.wasm.prove_output(
        inputs.value,
        inputs.rcv,
        inputs.rcm,
        inputs.diversifier,
        inputs.pkD,
        inputs.esk || new Uint8Array(32)
      );

      // Validate result size before parsing
      if (result.length < 256) {
        throw new Error(`Invalid proof result length: ${result.length}, expected at least 256 bytes`);
      }
      
      // Parse result (proof + cv + cmu = 192 + 32 + 32 = 256 bytes)
      const proof = result.slice(0, 192);
      const cv = result.slice(192, 224);
      const cmu = result.slice(224, 256);
      
      // Validate proof is not all zeros (indicates failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). WASM prover may not be properly initialized.');
      }
      
      // Validate cv is not all zeros
      if (cv.every(b => b === 0)) {
        throw new Error('Generated cv is invalid (all zeros). Value commitment generation failed.');
      }
      
      // Validate cmu is not all zeros
      if (cmu.every(b => b === 0)) {
        throw new Error('Generated cmu is invalid (all zeros). Note commitment generation failed.');
      }

      return { proof, cv, cmu };
    } catch (error) {
      throw new Error(`Failed to generate output proof: ${error}`);
    }
  }

  /**
   * Verify a spend proof
   */
  async verifySpendProof(
    proof: Uint8Array,
    cv: Uint8Array,
    anchor: Uint8Array,
    nullifier: Uint8Array,
    rk: Uint8Array
  ): Promise<boolean> {
    if (!this.wasm) {
      throw new Error('librustzcash WASM not initialized');
    }

    try {
      return this.wasm.verify_spend(proof, cv, anchor, nullifier, rk);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify an output proof
   */
  async verifyOutputProof(
    proof: Uint8Array,
    cv: Uint8Array,
    cmu: Uint8Array,
    ephemeralKey: Uint8Array
  ): Promise<boolean> {
    if (!this.wasm) {
      throw new Error('librustzcash WASM not initialized');
    }

    try {
      return this.wasm.verify_output(proof, cv, cmu, ephemeralKey);
    } catch (error) {
      return false;
    }
  }

  /**
   * Serialize Merkle path to bytes
   * 
   * Sapling commitment tree has depth 32, so path should have 32 elements.
   * Each element should be 32 bytes (a node commitment).
   */
  private serializeMerklePath(path: Uint8Array[]): Uint8Array {
    // Validate Merkle path structure
    const EXPECTED_DEPTH = 32;
    const NODE_SIZE = 32;
    
    if (path.length !== EXPECTED_DEPTH) {
      throw new Error(
        `Invalid Merkle path length: ${path.length}, expected ${EXPECTED_DEPTH} elements for Sapling tree`
      );
    }
    
    // Validate each path element is exactly 32 bytes
    for (let i = 0; i < path.length; i++) {
      if (path[i].length !== NODE_SIZE) {
        throw new Error(
          `Invalid Merkle path element ${i}: length ${path[i].length}, expected ${NODE_SIZE} bytes`
        );
      }
    }
    
    // Concatenate all path elements
    const totalLength = path.reduce((sum, p) => sum + p.length, 0);
    if (totalLength !== EXPECTED_DEPTH * NODE_SIZE) {
      throw new Error(
        `Invalid Merkle path total length: ${totalLength}, expected ${EXPECTED_DEPTH * NODE_SIZE} bytes`
      );
    }
    
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of path) {
      result.set(p, offset);
      offset += p.length;
    }
    return result;
  }
}

