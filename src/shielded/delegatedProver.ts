/**
 * Delegated Proving Service
 * 
 * Since librustzcash cannot compile to WASM, this service provides
 * an interface to generate proofs via a remote server running librustzcash.
 * 
 * This is the recommended approach for browser-based Zcash wallets.
 */

import type { SaplingProof, SpendProofInputs, OutputProofInputs } from './types.js';

/**
 * Configuration for delegated proving service
 */
export interface DelegatedProverConfig {
  /** URL of the proving service endpoint */
  serviceUrl: string;
  /** API key (if required) */
  apiKey?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Delegated Proving Service Client
 * 
 * Sends proof generation requests to a remote server that runs librustzcash.
 * The server generates real proofs and returns them to the client.
 */
export class DelegatedProver {
  private config: DelegatedProverConfig;
  private initialized: boolean = false;

  constructor(config: DelegatedProverConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default
      ...config
    };
  }

  /**
   * Initialize the delegated prover
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Test connection to proving service
    try {
      const response = await fetch(`${this.config.serviceUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Proving service health check failed: ${response.statusText}`);
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to connect to proving service: ${error}`);
    }
  }

  /**
   * Check if prover is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Generate a Sapling spend proof via delegated service
   */
  async generateSpendProof(inputs: SpendProofInputs): Promise<SaplingProof> {
    if (!this.initialized) {
      throw new Error('DelegatedProver not initialized. Call initialize() first.');
    }

    try {
      const response = await fetch(`${this.config.serviceUrl}/prove/spend`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          spending_key: Array.from(inputs.ask),
          nsk: Array.from(inputs.nsk),
          value: inputs.value.toString(),
          rcv: Array.from(inputs.rcv),
          alpha: Array.from(inputs.alpha),
          anchor: Array.from(inputs.anchor),
          merkle_path: inputs.merklePath.map((p: Uint8Array) => Array.from(p)),
          position: inputs.position.toString()
        }),
        signal: AbortSignal.timeout(this.config.timeout || 300000)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Proof generation failed: ${error}`);
      }

      const result = await response.json();
      
      // Validate response structure and sizes
      if (!result.proof || !Array.isArray(result.proof)) {
        throw new Error('Invalid response: proof field missing or invalid');
      }
      if (!result.cv || !Array.isArray(result.cv)) {
        throw new Error('Invalid response: cv field missing or invalid');
      }
      if (!result.rk || !Array.isArray(result.rk)) {
        throw new Error('Invalid response: rk field missing or invalid');
      }
      
      const proof = new Uint8Array(result.proof);
      const cv = new Uint8Array(result.cv);
      const rk = new Uint8Array(result.rk);
      
      // Validate proof format: Groth16 proof is exactly 192 bytes
      if (proof.length !== 192) {
        throw new Error(`Invalid proof length: ${proof.length}, expected 192 bytes`);
      }
      
      // Validate cv: value commitment is exactly 32 bytes
      if (cv.length !== 32) {
        throw new Error(`Invalid cv length: ${cv.length}, expected 32 bytes`);
      }
      
      // Validate rk: randomized key is exactly 32 bytes
      if (rk.length !== 32) {
        throw new Error(`Invalid rk length: ${rk.length}, expected 32 bytes`);
      }
      
      // Validate proof is not all zeros (indicates failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). Proof generation may have failed.');
      }
      
      return { proof, cv, rk };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Proof generation timed out');
      }
      throw new Error(`Failed to generate spend proof: ${error}`);
    }
  }

  /**
   * Generate a Sapling output proof via delegated service
   */
  async generateOutputProof(inputs: OutputProofInputs): Promise<SaplingProof> {
    if (!this.initialized) {
      throw new Error('DelegatedProver not initialized. Call initialize() first.');
    }

    try {
      const response = await fetch(`${this.config.serviceUrl}/prove/output`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: inputs.value.toString(),
          rcv: Array.from(inputs.rcv),
          rcm: Array.from(inputs.rcm),
          diversifier: Array.from(inputs.diversifier),
          pk_d: Array.from(inputs.pkD),
          esk: inputs.esk ? Array.from(inputs.esk) : null
        }),
        signal: AbortSignal.timeout(this.config.timeout || 300000)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Proof generation failed: ${error}`);
      }

      const result = await response.json();
      
      // Validate response structure and sizes
      if (!result.proof || !Array.isArray(result.proof)) {
        throw new Error('Invalid response: proof field missing or invalid');
      }
      if (!result.cv || !Array.isArray(result.cv)) {
        throw new Error('Invalid response: cv field missing or invalid');
      }
      if (!result.cmu || !Array.isArray(result.cmu)) {
        throw new Error('Invalid response: cmu field missing or invalid');
      }
      
      const proof = new Uint8Array(result.proof);
      const cv = new Uint8Array(result.cv);
      const cmu = new Uint8Array(result.cmu);
      
      // Validate proof format: Groth16 proof is exactly 192 bytes
      if (proof.length !== 192) {
        throw new Error(`Invalid proof length: ${proof.length}, expected 192 bytes`);
      }
      
      // Validate cv: value commitment is exactly 32 bytes
      if (cv.length !== 32) {
        throw new Error(`Invalid cv length: ${cv.length}, expected 32 bytes`);
      }
      
      // Validate cmu: note commitment is exactly 32 bytes
      if (cmu.length !== 32) {
        throw new Error(`Invalid cmu length: ${cmu.length}, expected 32 bytes`);
      }
      
      // Validate proof is not all zeros (indicates failed generation)
      if (proof.every(b => b === 0)) {
        throw new Error('Generated proof is invalid (all zeros). Proof generation may have failed.');
      }
      
      return { proof, cv, cmu };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Proof generation timed out');
      }
      throw new Error(`Failed to generate output proof: ${error}`);
    }
  }

  /**
   * Get HTTP headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}

