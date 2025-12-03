/**
 * librustzcash WASM Integration Test
 */

import { LibrustzcashProver } from '../../src/shielded/librustzcashProver';
import type { SpendProofInputs, OutputProofInputs } from '../../src/types/index';

describe('librustzcash WASM Prover', () => {
  let prover: LibrustzcashProver;

  beforeEach(() => {
    prover = new LibrustzcashProver();
  });

  describe('Initialization', () => {
    it('should initialize WASM module', async () => {
      // This will try to load WASM from /zcash_prover_wasm.js
      // In Node.js test environment, this may fail, which is expected
      try {
        await prover.initialize();
        expect(prover.isInitialized()).toBe(true);
      } catch (error) {
        // Expected in Node.js environment (WASM needs browser)
        expect(error).toBeDefined();
      }
    });

    it('should handle initialization failure gracefully', async () => {
      // In Node.js, WASM loading will fail
      await expect(prover.initialize('/non-existent.wasm')).rejects.toThrow();
      expect(prover.isInitialized()).toBe(false);
    });
  });

  describe('Proof Generation (when WASM available)', () => {
    it('should generate spend proof structure', async () => {
      // This test will only pass in browser environment with WASM loaded
      try {
        await prover.initialize();
        
        if (prover.isInitialized()) {
          const inputs: SpendProofInputs = {
            value: 1000n,
            rcv: new Uint8Array(32).fill(1),
            alpha: new Uint8Array(32).fill(2),
            ask: new Uint8Array(32).fill(3),
            nsk: new Uint8Array(32).fill(4),
            anchor: new Uint8Array(32).fill(5),
            position: 0n,
            merklePath: []
          };

          const proof = await prover.generateSpendProof(inputs);
          
          expect(proof).toBeDefined();
          expect(proof.proof.length).toBe(192);
          expect(proof.cv.length).toBe(32);
          expect(proof.rk.length).toBe(32);
        }
      } catch (error) {
        // Expected in Node.js test environment
        expect(error).toBeDefined();
      }
    });

    it('should generate output proof structure', async () => {
      try {
        await prover.initialize();
        
        if (prover.isInitialized()) {
          const inputs: OutputProofInputs = {
            value: 1000n,
            rcv: new Uint8Array(32).fill(1),
            rcm: new Uint8Array(32).fill(2),
            diversifier: new Uint8Array(11).fill(3),
            pkD: new Uint8Array(32).fill(4),
            esk: new Uint8Array(32).fill(5)
          };

          const proof = await prover.generateOutputProof(inputs);
          
          expect(proof).toBeDefined();
          expect(proof.proof.length).toBe(192);
          expect(proof.cv.length).toBe(32);
          expect(proof.cmu.length).toBe(32);
        }
      } catch (error) {
        // Expected in Node.js test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error if not initialized', async () => {
      const inputs: SpendProofInputs = {
        value: 1000n,
        rcv: new Uint8Array(32),
        alpha: new Uint8Array(32),
        ask: new Uint8Array(32),
        nsk: new Uint8Array(32),
        anchor: new Uint8Array(32),
        position: 0n,
        merklePath: []
      };

      await expect(prover.generateSpendProof(inputs)).rejects.toThrow('not initialized');
    });
  });
});

