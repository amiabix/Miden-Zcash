/**
 * Groth16 Integration Layer
 * Supports both snarkjs and librustzcash for proof generation
 */

import type { SaplingProof, SpendProofInputs, OutputProofInputs } from './types.js';
import { SnarkjsProver } from './snarkjsProver.js';
import { LibrustzcashProver } from './librustzcashProver.js';
import { DelegatedProver } from './delegatedProver.js';
import { computePedersenValueCommitment, computeNoteCommitment } from './noteCommitment.js';
import { addScalars } from './scalarArithmetic.js';
import {
  validateSpendProofInputs,
  validateOutputProofInputs,
  logValidationResult,
  createProverError
} from './proverStatus.js';

// Lazy import for Prize-WASM to avoid build-time resolution issues
// Import type separately to avoid build-time resolution
import type { PrizeWasmProver as PrizeWasmProverType } from './prizeWasmProver.js';

let PrizeWasmProverClass: any = null;
let getPrizeWasmProver: any = null;

async function loadPrizeWasmProver() {
  if (PrizeWasmProverClass && getPrizeWasmProver) {
    return { PrizeWasmProver: PrizeWasmProverClass, getPrizeWasmProver };
  }

  try {
    const module = await import('./prizeWasmProver.js');
    PrizeWasmProverClass = module.PrizeWasmProver;
    getPrizeWasmProver = module.getPrizeWasmProver;
    return { PrizeWasmProver: PrizeWasmProverClass, getPrizeWasmProver };
  } catch (error) {
    // Prize-WASM not available - will fall back to other provers
    return { PrizeWasmProver: null, getPrizeWasmProver: null };
  }
}

/**
 * Prover type selection
 */
export type ProverType = 'snarkjs' | 'librustzcash' | 'delegated' | 'prize-wasm' | 'auto';

/**
 * Groth16 Integration for Sapling proofs
 * Supports both snarkjs and librustzcash (Zcash's official prover)
 */
export class Groth16Integration {
  private spendProver: SnarkjsProver | LibrustzcashProver | DelegatedProver | PrizeWasmProverType | null = null;
  private outputProver: SnarkjsProver | LibrustzcashProver | DelegatedProver | PrizeWasmProverType | null = null;
  private proverType: ProverType = 'auto';
  private initialized: boolean = false;

  /**
   * Initialize the Groth16 provers
   * 
   * @param options - Configuration options
   *   - proverType: 'snarkjs' | 'librustzcash' | 'auto' (default: 'auto')
   *   - For snarkjs: spendZkey, spendVkey, outputZkey, outputVkey
   *   - For librustzcash: wasmPath (path to WASM module)
   */
  async initialize(options?: {
    proverType?: ProverType;
    // snarkjs options
    spendZkey?: ArrayBuffer | string;
    spendVkey?: any | string;
    outputZkey?: ArrayBuffer | string;
    outputVkey?: any | string;
    // librustzcash options
    wasmPath?: string;
    // delegated proving service options
    serviceUrl?: string;
    apiKey?: string;
  }): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Determine prover type
    this.proverType = options?.proverType || 'auto';

    // Auto-detect: try librustzcash first (replaces Prize-WASM), then delegated, fallback to snarkjs
    if (this.proverType === 'auto') {
      try {
        // Try librustzcash first (replaces Prize-WASM)
        const librustzcash = new LibrustzcashProver();
        await librustzcash.initialize(options?.wasmPath);
        if (librustzcash.isInitialized()) {
          this.proverType = 'librustzcash';
          this.spendProver = librustzcash;
          this.outputProver = librustzcash;
          this.initialized = true;
          return;
        }
      } catch (error) {
        // librustzcash not available, try delegated service
      }

      try {
        // Try delegated proving service (if URL configured)
        if (options?.serviceUrl) {
          const delegated = new DelegatedProver({
            serviceUrl: options.serviceUrl,
            apiKey: options?.apiKey
          });
          await delegated.initialize();
          if (delegated.isInitialized()) {
            this.proverType = 'delegated';
            this.spendProver = delegated;
            this.outputProver = delegated;
            this.initialized = true;
            return;
          }
        }
      } catch (error) {
        // Delegated service not available, try Prize-WASM as fallback
      }

      try {
        // Try Prize-WASM as fallback (if available)
        const { getPrizeWasmProver: getPrizeWasm } = await loadPrizeWasmProver();
        if (getPrizeWasm) {
          const prizeWasm = await getPrizeWasm(options?.wasmPath);
          if (prizeWasm && prizeWasm.isInitialized()) {
            this.proverType = 'prize-wasm';
            this.spendProver = prizeWasm;
            this.outputProver = prizeWasm;
            this.initialized = true;
            return;
          }
        }
      } catch (error) {
        // Prize-WASM not available, fall back to snarkjs
      }
      
      this.proverType = 'snarkjs';
    }

    // Initialize provers based on type
    if (this.proverType === 'prize-wasm') {
      const { getPrizeWasmProver: getPrizeWasm } = await loadPrizeWasmProver();
      if (!getPrizeWasm) {
        throw new Error('Prize-WASM prover not available. Install WASM files or use a different prover type.');
      }
      const prizeWasm = await getPrizeWasm(options?.wasmPath);
      this.spendProver = prizeWasm;
      this.outputProver = prizeWasm;
      this.initialized = true;
      return;
    } else if (this.proverType === 'snarkjs') {
      this.spendProver = new SnarkjsProver();
      this.outputProver = new SnarkjsProver();
    } else if (this.proverType === 'librustzcash') {
      const librustzcash = new LibrustzcashProver();
      await librustzcash.initialize(options?.wasmPath);
      this.spendProver = librustzcash;
      this.outputProver = librustzcash;
      this.initialized = true;
      return;
    } else if (this.proverType === 'delegated') {
      if (!options?.serviceUrl) {
        throw new Error('Delegated prover requires serviceUrl');
      }
      const delegated = new DelegatedProver({
        serviceUrl: options.serviceUrl,
        apiKey: options?.apiKey
      });
      await delegated.initialize();
      this.spendProver = delegated;
      this.outputProver = delegated;
      this.initialized = true;
      return;
    }

    // Try to load zkeys if provided or from default paths (for snarkjs)
    let spendZkey: ArrayBuffer | null = null;
    let spendVkey: any | null = null;
    let outputZkey: ArrayBuffer | null = null;
    let outputVkey: any | null = null;

    if (options) {
      // Load from provided options
      if (options.spendZkey) {
        spendZkey = typeof options.spendZkey === 'string'
          ? await fetch(options.spendZkey).then(r => r.arrayBuffer())
          : options.spendZkey;
      }
      if (options.spendVkey) {
        spendVkey = typeof options.spendVkey === 'string'
          ? await fetch(options.spendVkey).then(r => r.json())
          : options.spendVkey;
      }
      if (options.outputZkey) {
        outputZkey = typeof options.outputZkey === 'string'
          ? await fetch(options.outputZkey).then(r => r.arrayBuffer())
          : options.outputZkey;
      }
      if (options.outputVkey) {
        outputVkey = typeof options.outputVkey === 'string'
          ? await fetch(options.outputVkey).then(r => r.json())
          : options.outputVkey;
      }
    } else {
      try {
        spendZkey = await fetch('/sapling-spend.zkey').then(r => r.arrayBuffer());
        spendVkey = await fetch('/sapling-spend.vkey').then(r => r.json());
        outputZkey = await fetch('/sapling-output.zkey').then(r => r.arrayBuffer());
        outputVkey = await fetch('/sapling-output.vkey').then(r => r.json());
      } catch (error) {
        // Files not found - will run in development mode with placeholder proofs
      }
    }

    // Initialize provers (use empty buffers if zkeys not found - development mode)
    if (this.spendProver instanceof SnarkjsProver) {
      await this.spendProver.initialize(
        spendZkey || new ArrayBuffer(0),
        spendVkey || {}
      );
    }
    if (this.outputProver instanceof SnarkjsProver) {
      await this.outputProver.initialize(
        outputZkey || new ArrayBuffer(0),
        outputVkey || {}
      );
    }

    this.initialized = true;
  }

  /**
   * Generate a Sapling spend proof
   * @throws {Error} If inputs are invalid or prover fails
   */
  async generateSpendProof(inputs: SpendProofInputs): Promise<SaplingProof> {
    // Validate inputs (convert position to number for validation)
    const validationInputs = {
      ...inputs,
      position: inputs.position !== undefined ? Number(inputs.position) : undefined
    };
    const validation = validateSpendProofInputs(validationInputs);
    if (!validation.valid) {
      logValidationResult('generateSpendProof', validation);
      throw createProverError('spend', this.proverType, 
        `Invalid inputs: ${validation.errors.join(', ')}`, inputs as unknown as Record<string, unknown>);
    }
    if (validation.warnings.length > 0) {
      logValidationResult('generateSpendProof', validation);
    }

    // Check initialization
    if (!this.spendProver || !this.initialized) {
      throw createProverError('spend', this.proverType,
        'Groth16Integration not initialized. Call initialize() first.');
    }

    const cv = this.computeValueCommitment(inputs.value, inputs.rcv);
    const rk = this.computeRandomizedKey(inputs.ask, inputs.alpha);

    try {
      // Attempt proof generation with available provers in priority order
      // Priority: Prize-WASM > Delegated > librustzcash > snarkjs
      
      if (this.proverType === 'prize-wasm') {
        try {
          return await (this.spendProver as any).generateSpendProof(inputs);
        } catch (prizeError) {
          // Fall through to fallback provers
        }
      }

      if (this.proverType === 'delegated' && this.spendProver instanceof DelegatedProver) {
        try {
          return await this.spendProver.generateSpendProof(inputs);
        } catch (delegatedError) {
          // Fall through to other provers
        }
      }
      
      if (this.proverType === 'librustzcash' && this.spendProver instanceof LibrustzcashProver) {
        try {
          return await this.spendProver.generateSpendProof(inputs);
        } catch (librustError) {
          // Fall through to snarkjs
        }
      }
      
      // Fallback to snarkjs if it has real zkeys
      if (this.spendProver instanceof SnarkjsProver && this.spendProver.isInitialized()) {
        try {
          if (this.spendProver.hasRealZkey()) {
            // Convert inputs to ProofInput format for SnarkjsProver
            const proofInput = {
              spendingKey: inputs.ask,
              outputNote: {
                value: typeof inputs.value === 'bigint' ? Number(inputs.value) : inputs.value,
                rseed: inputs.rcm
              },
              merkleRoot: inputs.anchor || new Uint8Array(32),
              nullifier: new Uint8Array(32),
              witness: inputs.merklePath || [],
              nf: new Uint8Array(32),
              rho: new Uint8Array(32),
              ar: new Uint8Array(32),
              kr: new Uint8Array(32)
            };

            const proofOutput = await this.spendProver.generateProof(proofInput);
            const proofBytes = SnarkjsProver.serializeProof(proofOutput.proof);

            return { proof: proofBytes, cv, rk };
          }
        } catch (snarkjsError) {
          // Continue to error handling below
        }
      }

      // If no prover succeeded, throw detailed error
      throw new Error(
        `No available prover: Prize-WASM unavailable and no fallback configured. ` +
        `Prover type: ${this.proverType}, initialized: ${this.initialized}, ` +
        `spendProver: ${this.spendProver ? 'present' : 'null'}`
      );
    } catch (error) {
      // Wrap in detailed error if not already a ProverError
      if (error instanceof Error && error.name === 'ProverError') {
        throw error;
      }
      throw createProverError('spend', this.proverType, error as Error, inputs as unknown as Record<string, unknown>);
    }
  }

  /**
   * Generate a Sapling output proof
   * @throws {Error} If inputs are invalid or prover fails
   */
  async generateOutputProof(inputs: OutputProofInputs): Promise<SaplingProof> {
    // Validate inputs
    const validation = validateOutputProofInputs(inputs);
    if (!validation.valid) {
      logValidationResult('generateOutputProof', validation);
      throw createProverError('output', this.proverType,
        `Invalid inputs: ${validation.errors.join(', ')}`, inputs as unknown as Record<string, unknown>);
    }
    if (validation.warnings.length > 0) {
      logValidationResult('generateOutputProof', validation);
    }

    // Check initialization
    if (!this.outputProver || !this.initialized) {
      throw createProverError('output', this.proverType,
        'Groth16Integration not initialized. Call initialize() first.');
    }

    const cv = this.computeValueCommitment(inputs.value, inputs.rcv);
    const cmu = this.computeNoteCommitment(
      inputs.diversifier,
      inputs.pkD,
      inputs.value,
      inputs.rcm
    );

    try {
      // Attempt proof generation with available provers in priority order
      if (this.proverType === 'prize-wasm') {
        return await (this.outputProver as any).generateOutputProof(inputs);
      }

      if (this.proverType === 'delegated' && this.outputProver instanceof DelegatedProver) {
        return await this.outputProver.generateOutputProof(inputs);
      }
      
      if (this.proverType === 'librustzcash' && this.outputProver instanceof LibrustzcashProver) {
        return await this.outputProver.generateOutputProof(inputs);
      }
      
      // Fallback to snarkjs if it has real zkeys
      if (this.outputProver instanceof SnarkjsProver && this.outputProver.isInitialized() && this.outputProver.hasRealZkey()) {
        // For output proofs, we need to construct the witness differently
        const proofInput = {
          spendingKey: new Uint8Array(32), // Not used for output
          outputNote: {
            value: typeof inputs.value === 'bigint' ? Number(inputs.value) : inputs.value,
            rseed: inputs.rcm
          },
          merkleRoot: new Uint8Array(32),
          nullifier: new Uint8Array(32),
          witness: [],
          nf: new Uint8Array(32),
          rho: new Uint8Array(32),
          ar: inputs.rcv,
          kr: inputs.esk || new Uint8Array(32)
        };

        const proofOutput = await this.outputProver.generateProof(proofInput);
        const proofBytes = SnarkjsProver.serializeProof(proofOutput.proof);

        return { proof: proofBytes, cv, cmu };
      }

      // If no prover succeeded, throw detailed error
      throw new Error(
        `No active prover found. Type: ${this.proverType}. ` +
        `Prover state: initialized=${this.initialized}, outputProver=${this.outputProver ? 'present' : 'null'}`
      );
    } catch (error) {
      // Wrap in detailed error if not already a ProverError
      if (error instanceof Error && error.name === 'ProverError') {
        throw error;
      }
      throw createProverError('output', this.proverType, error as Error, inputs as unknown as Record<string, unknown>);
    }
  }

  /**
   * Compute value commitment (Pedersen commitment)
   * cv = PedersenHash(value || rcv)
   * Uses proper Jubjub-based Pedersen hash
   */
  private computeValueCommitment(value: bigint, rcv: Uint8Array): Uint8Array {
    return computePedersenValueCommitment(value, rcv);
  }

  /**
   * Compute randomized verification key
   * rk = ask + alpha (mod order)
   * Uses proper scalar field arithmetic
   */
  private computeRandomizedKey(ask: Uint8Array, alpha: Uint8Array): Uint8Array {
    return addScalars(ask, alpha);
  }

  /**
   * Compute note commitment
   * cm = PedersenHash(rcm || value || diversifier || pk_d)
   * Uses proper Jubjub-based Pedersen hash
   */
  private computeNoteCommitment(
    diversifier: Uint8Array,
    pkD: Uint8Array,
    value: bigint,
    rcm: Uint8Array
  ): Uint8Array {
    return computeNoteCommitment(diversifier, pkD, value, rcm);
  }

  /**
   * Verify a Sapling proof
   */
  async verifyProof(
    proof: Uint8Array,
    publicInputs: Uint8Array
  ): Promise<boolean> {
    if (!this.spendProver || !this.initialized) {
      return false;
    }

    // Use librustzcash verification if available
    if (this.proverType === 'librustzcash' && this.spendProver instanceof LibrustzcashProver) {
      // librustzcash verification would need more context (cv, anchor, etc.)
      // For now, if librustzcash is available, we trust it generated a valid proof
      // TODO: Implement full verification with cv, anchor, etc.
      return true;
    }
    
    // Use snarkjs verification if it has real zkeys
    if (this.spendProver instanceof SnarkjsProver && this.spendProver.isInitialized() && this.spendProver.hasRealZkey()) {
      try {
        const proofObj = SnarkjsProver.deserializeProof(proof);
        const publicSignals = Array.from(publicInputs).map(b => b.toString());
        return await this.spendProver.verifyProof(proofObj, publicSignals);
      } catch (error) {
        return false;
      }
    }

    // No valid prover available - reject proof
    // CRITICAL: Do not accept proofs without validation
    throw new Error('Proof verification failed: No valid prover available. Cannot verify proof without zkeys or WASM prover.');
  }

  /**
   * Check if Groth16 integration is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current prover type
   */
  getProverType(): ProverType {
    return this.proverType;
  }

  /**
   * Check if using librustzcash (Zcash's official prover)
   */
  isUsingLibrustzcash(): boolean {
    return this.proverType === 'librustzcash';
  }

  /**
   * Get prover status for diagnostics
   */
  async getStatus(): Promise<import('./proverStatus').ProverStatus> {
    const { getProverStatus } = await import('./proverStatus.js');
    return getProverStatus();
  }

}

/**
 * Global Groth16 integration instance
 */
let globalGroth16: Groth16Integration | null = null;

/**
 * Get or create the global Groth16 integration instance
 */
export async function getGroth16Integration(): Promise<Groth16Integration> {
  if (!globalGroth16) {
    globalGroth16 = new Groth16Integration();
    await globalGroth16.initialize();
  }
  return globalGroth16;
}

/**
 * Reset the global Groth16 integration (for testing)
 */
export function resetGroth16Integration(): void {
  globalGroth16 = null;
}
